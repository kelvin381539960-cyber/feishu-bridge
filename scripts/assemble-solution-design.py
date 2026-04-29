#!/usr/bin/env python3
"""
将 docs/aix-phase2/solution-design/chapters/*.md 转为 HTML 终稿，并合并出 solution-design.md（通读用）。
依赖：仓库根目录 .venv-aix-doc（pip install -r scripts/aix-doc-requirements.txt）
"""
from __future__ import annotations

import sys
from pathlib import Path

import markdown

REPO = Path(__file__).resolve().parents[1]
SD = REPO / "docs/aix-phase2/solution-design"
CHAPTER_DIR = SD / "chapters"
OUT_HTML = SD / "solution-design.html"
OUT_MD = SD / "solution-design.md"

CHAPTER_FILES = [
    "01-doc-header.md",
    "02-overview.md",
    "03-architecture.md",
    "04-boundary.md",
    "04-mvp-function.md",
    "05-money-flows.md",
    "06-dependencies.md",
    "07-risks.md",
]

MD_EXTENSIONS = [
    "markdown.extensions.tables",
    "markdown.extensions.fenced_code",
    "markdown.extensions.nl2br",
    "markdown.extensions.sane_lists",
]


def md_to_html_fragment(text: str) -> str:
    md = markdown.Markdown(extensions=MD_EXTENSIONS)
    body = md.convert(text)
    return body if body.endswith("\n") else body + "\n"


def main() -> int:
    if not CHAPTER_DIR.is_dir():
        print(f"Missing {CHAPTER_DIR}", file=sys.stderr)
        return 1

    missing = [f for f in CHAPTER_FILES if not (CHAPTER_DIR / f).is_file()]
    if missing:
        print("Missing chapter files:", missing, file=sys.stderr)
        return 1

    parts_html: list[str] = []
    parts_md: list[str] = []

    for name in CHAPTER_FILES:
        raw = (CHAPTER_DIR / name).read_text(encoding="utf-8")
        parts_md.append(raw.rstrip() + "\n\n---\n\n")
        parts_html.append(md_to_html_fragment(raw))

    head = (SD / "partials" / "head.html").read_text(encoding="utf-8")
    foot = (SD / "partials" / "foot.html").read_text(encoding="utf-8")

    inner = "".join(parts_html)
    html_out = head + '\n<main class="doc-root">\n' + inner + "</main>\n" + foot

    OUT_HTML.write_text(html_out, encoding="utf-8")
    OUT_MD.write_text("".join(parts_md), encoding="utf-8")

    print(f"OK: {OUT_HTML}")
    print(f"OK: {OUT_MD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
