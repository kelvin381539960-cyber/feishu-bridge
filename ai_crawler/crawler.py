"""Core crawl engine — orchestrates browser + AI extraction + link following."""

from __future__ import annotations

import asyncio
import json
import os
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

from . import config
from .browser import BrowserSession, PageResult
from .extractor import extract_content, filter_links, summarize_results


@dataclass
class CrawlTask:
    start_url: str
    task: str
    max_pages: int = config.DEFAULT_MAX_PAGES
    max_depth: int = config.DEFAULT_DEPTH
    delay: float = config.DEFAULT_DELAY_SEC
    screenshot: bool = False
    follow_links: bool = True
    output_dir: str = "crawl_output"


@dataclass
class CrawlResult:
    task: str
    pages_crawled: int
    total_records: int
    results: list[dict[str, Any]] = field(default_factory=list)
    summary: str = ""
    output_file: str = ""
    duration_sec: float = 0


async def run_crawl(task: CrawlTask, on_progress=None) -> CrawlResult:
    """Execute a full crawl job."""
    start_time = time.time()
    base_domain = urlparse(task.start_url).netloc
    visited: set[str] = set()
    queue: deque[tuple[str, int]] = deque()
    queue.append((task.start_url, 0))
    all_page_results: list[dict[str, Any]] = []

    def log(msg: str):
        if on_progress:
            on_progress(msg)
        print(msg)

    log(f"🕷️  开始爬取: {task.start_url}")
    log(f"📋 任务: {task.task}")
    log(f"⚙️  最大页面数: {task.max_pages}, 最大深度: {task.max_depth}")
    log("")

    async with BrowserSession() as browser:
        while queue and len(visited) < task.max_pages:
            url, depth = queue.popleft()

            if url in visited:
                continue
            if depth > task.max_depth:
                continue

            visited.add(url)
            page_num = len(visited)
            log(f"[{page_num}/{task.max_pages}] 深度{depth} 正在爬取: {url}")

            try:
                page = await browser.fetch_page(
                    url,
                    screenshot=task.screenshot,
                )
            except Exception as exc:
                log(f"  ❌ 页面加载失败: {exc}")
                continue

            log(f"  📄 标题: {page.title}")
            log(f"  📝 文本长度: {len(page.text)} 字符, 链接数: {len(page.links)}")

            # AI extraction
            log("  🤖 AI 正在提取数据...")
            extracted = extract_content(page, task.task)
            record_count = len(extracted.get("data", []))
            log(f"  ✅ 提取到 {record_count} 条记录")
            if extracted.get("summary"):
                log(f"  💡 {extracted['summary']}")

            page_result = {
                "url": page.url,
                "title": page.title,
                "depth": depth,
                "extracted": extracted,
                "timestamp": datetime.now().isoformat(),
            }

            if task.screenshot and page.screenshot:
                shot_path = os.path.join(
                    task.output_dir,
                    f"screenshot_{page_num}.png",
                )
                os.makedirs(task.output_dir, exist_ok=True)
                with open(shot_path, "wb") as f:
                    f.write(page.screenshot)
                page_result["screenshot"] = shot_path
                log(f"  📸 截图已保存: {shot_path}")

            all_page_results.append(page_result)

            # Smart link following
            if task.follow_links and depth < task.max_depth and len(visited) < task.max_pages:
                log("  🔗 AI 正在分析链接...")
                relevant_links = filter_links(page, task.task, base_domain)
                new_count = 0
                for link in relevant_links:
                    link_url = link["url"]
                    if link_url not in visited:
                        queue.append((link_url, depth + 1))
                        new_count += 1
                log(f"  🔗 发现 {new_count} 个相关链接待爬取")

            if queue and len(visited) < task.max_pages:
                await asyncio.sleep(task.delay)

            log("")

    # Summarize
    log("📊 正在生成总结报告...")
    summary = summarize_results(all_page_results, task.task)

    # Save output
    os.makedirs(task.output_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = os.path.join(task.output_dir, f"crawl_{ts}.json")
    output_data = {
        "task": task.task,
        "start_url": task.start_url,
        "config": {
            "max_pages": task.max_pages,
            "max_depth": task.max_depth,
            "follow_links": task.follow_links,
        },
        "summary": summary,
        "pages": all_page_results,
        "stats": {
            "pages_crawled": len(all_page_results),
            "total_records": sum(
                len(p.get("extracted", {}).get("data", []))
                for p in all_page_results
            ),
            "duration_sec": round(time.time() - start_time, 1),
        },
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    # Also save a markdown report
    md_file = os.path.join(task.output_dir, f"crawl_{ts}.md")
    _write_markdown_report(md_file, output_data)

    duration = round(time.time() - start_time, 1)
    total_records = output_data["stats"]["total_records"]

    log(f"\n{'='*60}")
    log(f"✅ 爬取完成!")
    log(f"   页面数: {len(all_page_results)}")
    log(f"   提取记录数: {total_records}")
    log(f"   耗时: {duration}s")
    log(f"   JSON 输出: {output_file}")
    log(f"   Markdown 报告: {md_file}")
    log(f"{'='*60}")
    log(f"\n📊 总结:\n{summary}")

    return CrawlResult(
        task=task.task,
        pages_crawled=len(all_page_results),
        total_records=total_records,
        results=all_page_results,
        summary=summary,
        output_file=output_file,
        duration_sec=duration,
    )


def _write_markdown_report(path: str, data: dict):
    lines = [
        f"# 🕷️ AI 智能爬虫报告",
        "",
        f"**任务**: {data['task']}",
        f"**起始 URL**: {data['start_url']}",
        f"**爬取页面数**: {data['stats']['pages_crawled']}",
        f"**提取记录数**: {data['stats']['total_records']}",
        f"**耗时**: {data['stats']['duration_sec']}s",
        "",
        "---",
        "",
        "## 总结",
        "",
        data.get("summary", ""),
        "",
        "---",
        "",
        "## 详细数据",
        "",
    ]

    for i, page in enumerate(data.get("pages", []), 1):
        extracted = page.get("extracted", {})
        lines.append(f"### {i}. {page.get('title', 'Untitled')}")
        lines.append(f"- **URL**: {page.get('url')}")
        lines.append(f"- **深度**: {page.get('depth')}")
        if extracted.get("summary"):
            lines.append(f"- **摘要**: {extracted['summary']}")
        lines.append("")

        records = extracted.get("data", [])
        if records:
            lines.append("```json")
            lines.append(json.dumps(records, ensure_ascii=False, indent=2))
            lines.append("```")
            lines.append("")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
