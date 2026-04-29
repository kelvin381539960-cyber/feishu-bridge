"""AI-powered content extraction and link relevance scoring."""

from __future__ import annotations

import json
import re
from typing import Any

from . import config
from .ai_client import chat, chat_json
from .browser import PageResult

EXTRACT_SYSTEM = """\
你是一个专业的网页数据提取助手。用户会给你一段网页文本和一个提取任务。
请严格按照任务要求，从网页内容中提取结构化数据。

规则：
1. 只提取网页中实际存在的信息，不要编造
2. 如果某个字段在网页中找不到，填 null
3. 返回一个 JSON 对象，包含 "data" 数组和 "summary" 摘要
4. data 数组中每个元素是一条提取的记录
5. summary 是对本页提取结果的一句话概述
6. 只返回 JSON，不要包含其他文本"""

LINK_FILTER_SYSTEM = """\
你是一个智能爬虫链接分析助手。用户会给你一个爬取任务和一组链接。
你需要判断哪些链接值得继续爬取以完成任务。

规则：
1. 只选择与任务直接相关的链接
2. 忽略导航栏、页脚、登录、关于我们等无关链接
3. 忽略外部域名链接（除非任务明确需要跨域）
4. 返回 JSON: {"selected": [{"url": "...", "reason": "..."}]}
5. 最多选择 10 个最相关的链接
6. 只返回 JSON"""


def extract_content(page: PageResult, task: str) -> dict[str, Any]:
    """Use AI to extract structured data from page text based on the task."""
    truncated = page.text[: config.MAX_CONTENT_CHARS]
    prompt = (
        f"## 爬取任务\n{task}\n\n"
        f"## 页面信息\n- URL: {page.url}\n- 标题: {page.title}\n\n"
        f"## 页面内容\n{truncated}"
    )
    try:
        result = chat_json(
            [{"role": "user", "content": prompt}],
            system=EXTRACT_SYSTEM,
        )
        if not isinstance(result, dict):
            result = {"data": result if isinstance(result, list) else [result], "summary": ""}
        return result
    except (json.JSONDecodeError, RuntimeError) as exc:
        return {
            "data": [],
            "summary": f"提取失败: {exc}",
            "error": str(exc),
        }


def filter_links(
    page: PageResult,
    task: str,
    base_domain: str,
) -> list[dict[str, str]]:
    """Use AI to pick which links to follow next."""
    candidate_links = []
    for link in page.links[: config.MAX_LINKS_FOR_AI]:
        candidate_links.append(f"- [{link['text']}]({link['url']})")

    if not candidate_links:
        return []

    links_text = "\n".join(candidate_links)
    prompt = (
        f"## 爬取任务\n{task}\n\n"
        f"## 当前页面\n- URL: {page.url}\n- 标题: {page.title}\n\n"
        f"## 目标域名\n{base_domain}\n\n"
        f"## 候选链接\n{links_text}"
    )

    try:
        result = chat_json(
            [{"role": "user", "content": prompt}],
            system=LINK_FILTER_SYSTEM,
        )
        selected = result.get("selected", [])
        return [s for s in selected if isinstance(s, dict) and "url" in s]
    except Exception:
        return []


def summarize_results(all_results: list[dict[str, Any]], task: str) -> str:
    """Generate a final summary of all crawled data."""
    total_records = sum(len(r.get("data", [])) for r in all_results)
    pages = len(all_results)

    preview = json.dumps(all_results[:3], ensure_ascii=False, indent=2)
    if len(preview) > 8000:
        preview = preview[:8000] + "\n... (truncated)"

    prompt = (
        f"## 爬取任务\n{task}\n\n"
        f"## 统计\n- 爬取页面数: {pages}\n- 提取记录数: {total_records}\n\n"
        f"## 数据预览\n```json\n{preview}\n```\n\n"
        "请用中文写一段简洁的总结报告，包括：发现了什么数据、数据质量如何、有哪些值得注意的点。"
    )

    try:
        return chat(
            [{"role": "user", "content": prompt}],
            system="你是数据分析助手，简洁准确地总结爬取结果。",
        )
    except Exception as exc:
        return f"总结生成失败: {exc}"
