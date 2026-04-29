#!/usr/bin/env python3
"""Competitive research workbench CLI.

Builds a dossier from a small list of competitor homepages by:
1. fetching key public pages with Playwright
2. extracting structured facts with the existing AI client
3. synthesizing a Markdown report and raw JSON evidence
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT))

from ai_crawler.ai_client import chat, chat_json  # noqa: E402
from ai_crawler.browser import BrowserSession  # noqa: E402


DEFAULT_TASK = (
    "输出每个产品的定位、目标用户、核心功能、协作能力、AI 能力、"
    "定价线索、增长线索、技术栈线索，以及相互之间最关键的差异。"
)

DISCOVERY_PATHS = [
    ("homepage", ""),
    ("pricing", "/pricing"),
    ("features", "/features"),
    ("product", "/product"),
    ("ai", "/ai"),
    ("integrations", "/integrations"),
    ("security", "/security"),
    ("enterprise", "/enterprise"),
    ("help", "/help"),
    ("docs", "/docs"),
    ("blog", "/blog"),
    ("changelog", "/changelog"),
]

TARGET_SYSTEM = """\
你是资深竞品分析师。你将收到一个产品的多个公开页面证据。

任务：
1. 仅根据提供的证据输出结构化事实，不要编造
2. 尽量提炼出定位、目标用户、功能、AI、协作、定价、增长、技术栈线索
3. 每个结论尽量给 evidence_url 或 evidence_quote
4. 若证据不足，明确写 unknown
5. 只返回 JSON

输出结构：
{
  "name": "",
  "homepage": "",
  "positioning": "",
  "target_users": [],
  "key_features": [],
  "ai_capabilities": [],
  "collaboration_capabilities": [],
  "pricing_signals": [],
  "growth_signals": [],
  "tech_stack_hints": [],
  "notable_integrations": [],
  "risks_or_gaps": [],
  "evidence": [
    {
      "claim": "",
      "evidence_url": "",
      "evidence_quote": ""
    }
  ]
}
"""

REPORT_SYSTEM = """\
你是严谨的战略分析师。请基于提供的竞品事实，产出一份中文 Markdown 报告。

要求：
1. 先给结论，再给对比
2. 不要编造，没有证据的地方明确说证据不足
3. 报告必须包含：
   - 执行摘要
   - 单个竞品画像
   - 横向功能/定价/AI/协作对比
   - 市场机会与风险
   - 下一步研究建议
4. 保持信息密度高，但不要写空话
"""


@dataclass
class PageCapture:
    label: str
    requested_url: str
    final_url: str
    title: str
    state: str
    text: str


@dataclass
class TargetCapture:
    name: str
    homepage: str
    pages: list[PageCapture] = field(default_factory=list)
    extracted: dict[str, Any] = field(default_factory=dict)


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"https?://", "", value)
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value or "target"


def parse_target(raw: str) -> tuple[str, str]:
    if "|" not in raw:
        raise ValueError(f"Invalid --target value: {raw!r}. Use Name|URL.")
    name, url = raw.split("|", 1)
    name = name.strip()
    url = url.strip()
    if not name or not url:
        raise ValueError(f"Invalid --target value: {raw!r}. Use Name|URL.")
    return name, url


def build_candidate_pages(homepage: str, max_pages: int) -> list[tuple[str, str]]:
    homepage = homepage.rstrip("/")
    candidates: list[tuple[str, str]] = []
    seen: set[str] = set()
    for label, path in DISCOVERY_PATHS:
        url = homepage if not path else urljoin(homepage + "/", path.lstrip("/"))
        if url in seen:
            continue
        seen.add(url)
        candidates.append((label, url))
        if len(candidates) >= max_pages:
            break
    return candidates


async def fetch_target(
    browser: BrowserSession,
    name: str,
    homepage: str,
    *,
    max_pages: int,
    wait_ms: int,
    save_html_dir: Path | None,
) -> TargetCapture:
    target = TargetCapture(name=name, homepage=homepage)
    seen_final_urls: set[str] = set()

    for label, url in build_candidate_pages(homepage, max_pages):
        try:
            page = await browser.fetch_page(url, wait_ms=wait_ms, screenshot=False)
        except Exception as exc:
            target.pages.append(
                PageCapture(
                    label=label,
                    requested_url=url,
                    final_url=url,
                    title=f"ERROR: {exc}",
                    state="fetch_error",
                    text="",
                )
            )
            continue

        if page.url in seen_final_urls:
            continue
        seen_final_urls.add(page.url)

        cleaned_text = page.text[:12000]
        target.pages.append(
            PageCapture(
                label=label,
                requested_url=url,
                final_url=page.url,
                title=page.title,
                state=page.page_state,
                text=cleaned_text,
            )
        )

        if save_html_dir and page.page_state == "content":
            filename = f"{slugify(name)}-{label}.html"
            save_html_dir.mkdir(parents=True, exist_ok=True)
            (save_html_dir / filename).write_text(page.html, encoding="utf-8")

    return target


def extract_target_facts(target: TargetCapture, task: str) -> dict[str, Any]:
    evidence_blocks = []
    for page in target.pages:
        evidence_blocks.append(
            {
                "label": page.label,
                "requested_url": page.requested_url,
                "final_url": page.final_url,
                "title": page.title,
                "state": page.state,
                "text_excerpt": page.text[:4000],
            }
        )

    prompt = (
        f"研究任务：{task}\n\n"
        f"竞品名称：{target.name}\n"
        f"首页：{target.homepage}\n\n"
        "页面证据如下：\n"
        f"{json.dumps(evidence_blocks, ensure_ascii=False, indent=2)}"
    )
    result = chat_json([{"role": "user", "content": prompt}], system=TARGET_SYSTEM)
    if not isinstance(result, dict):
        raise RuntimeError(f"Unexpected extraction result for {target.name}: {type(result)}")
    result.setdefault("name", target.name)
    result.setdefault("homepage", target.homepage)
    return result


def build_report_markdown(
    task: str,
    captures: list[TargetCapture],
    synthesis: str,
    generated_at: str,
) -> str:
    lines = [
        "# Competitive Research Report",
        "",
        f"- Generated at: `{generated_at}`",
        f"- Task: {task}",
        "",
        "## Targets",
        "",
    ]

    for capture in captures:
        lines.append(f"- `{capture.name}`: {capture.homepage}")

    lines.extend(["", "## Synthesis", "", synthesis.strip(), "", "## Evidence Snapshot", ""])

    for capture in captures:
        lines.append(f"### {capture.name}")
        for page in capture.pages:
            lines.append(
                f"- `{page.label}` | `{page.state}` | {page.final_url or page.requested_url}"
            )
        lines.append("")

    return "\n".join(lines).strip() + "\n"


async def run(args: argparse.Namespace) -> Path:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    run_slug = "-".join(slugify(parse_target(raw)[0]) for raw in args.target)
    run_dir = Path(args.output_dir) / f"{timestamp}-{run_slug}"
    raw_dir = run_dir / "raw"
    html_dir = run_dir / "html"
    run_dir.mkdir(parents=True, exist_ok=True)
    raw_dir.mkdir(parents=True, exist_ok=True)

    targets = [parse_target(raw) for raw in args.target]
    captures: list[TargetCapture] = []

    async with BrowserSession(
        headless=not args.headful,
        persistent=args.persistent_profile,
    ) as browser:
        for name, url in targets:
            print(f"[fetch] {name} -> {url}")
            capture = await fetch_target(
                browser,
                name,
                url,
                max_pages=args.max_pages_per_target,
                wait_ms=args.wait_ms,
                save_html_dir=html_dir if args.save_html else None,
            )
            captures.append(capture)

    for capture in captures:
        if args.skip_ai:
            capture.extracted = {
                "name": capture.name,
                "homepage": capture.homepage,
                "positioning": "skipped",
                "target_users": [],
                "key_features": [],
                "ai_capabilities": [],
                "collaboration_capabilities": [],
                "pricing_signals": [],
                "growth_signals": [],
                "tech_stack_hints": [],
                "notable_integrations": [],
                "risks_or_gaps": ["AI extraction skipped"],
                "evidence": [],
            }
        else:
            print(f"[analyze] {capture.name}")
            capture.extracted = extract_target_facts(capture, args.task)

        raw_path = raw_dir / f"{slugify(capture.name)}.json"
        raw_path.write_text(
            json.dumps(asdict(capture), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    if args.skip_ai:
        synthesis = (
            "本次运行只完成页面抓取与证据落盘，未调用 AI 生成竞品判断。"
            "后续去掉 `--skip-ai` 即可生成完整报告。"
        )
    else:
        synthesis_prompt = (
            f"研究任务：{args.task}\n\n"
            "以下是各竞品的结构化事实：\n"
            f"{json.dumps([c.extracted for c in captures], ensure_ascii=False, indent=2)}"
        )
        synthesis = chat(
            [{"role": "user", "content": synthesis_prompt}],
            system=REPORT_SYSTEM,
            max_tokens=5000,
            temperature=0.2,
        )

    generated_at = datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
    report_text = build_report_markdown(args.task, captures, synthesis, generated_at)
    report_path = run_dir / "report.md"
    report_path.write_text(report_text, encoding="utf-8")

    manifest = {
        "generated_at": generated_at,
        "task": args.task,
        "targets": [{"name": c.name, "homepage": c.homepage} for c in captures],
        "skip_ai": args.skip_ai,
        "report_path": str(report_path),
    }
    (run_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"[done] report: {report_path}")
    return report_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run a competitive research dossier from public competitor URLs.",
    )
    parser.add_argument(
        "--target",
        action="append",
        required=True,
        help="Research target in the format Name|URL. Repeat for multiple targets.",
    )
    parser.add_argument(
        "--task",
        default=DEFAULT_TASK,
        help="What to compare across competitors.",
    )
    parser.add_argument(
        "--output-dir",
        default="var/experimental/competitive-research/runs",
        help="Directory where reports and raw evidence will be saved.",
    )
    parser.add_argument(
        "--max-pages-per-target",
        type=int,
        default=6,
        help="How many well-known public pages to probe per target.",
    )
    parser.add_argument(
        "--wait-ms",
        type=int,
        default=2500,
        help="Additional wait time after page load.",
    )
    parser.add_argument(
        "--headful",
        action="store_true",
        help="Launch a visible browser window.",
    )
    parser.add_argument(
        "--persistent-profile",
        action="store_true",
        help="Use the existing persistent browser profile if needed.",
    )
    parser.add_argument(
        "--save-html",
        action="store_true",
        help="Save fetched HTML files for later manual inspection.",
    )
    parser.add_argument(
        "--skip-ai",
        action="store_true",
        help="Only fetch and save evidence without AI analysis.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        return 130
    except Exception as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
