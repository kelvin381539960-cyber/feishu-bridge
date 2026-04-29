#!/usr/bin/env python3
"""Read a Feishu/Lark page via a persistent Playwright browser profile."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai_crawler.browser import BrowserSession  # noqa: E402

# 与 lib/feishu-online-doc.js 中 normalizeFeishuPasteUrl 对齐：飞书常粘贴成 url(url)，
# 不处理则 Playwright goto 抛错、无 JSON 输出，Node 侧只剩 Command failed。
_DUP_PAREN_RE = re.compile(r"^(https?://[^\s()]+)\((https?://[^)\s]+)\)\s*$")


def normalize_feishu_paste_url(url: str) -> str:
    s = (url or "").strip()
    if not s:
        return s
    m = _DUP_PAREN_RE.match(s)
    if m:
        a = m.group(1).rstrip("/")
        b = m.group(2).rstrip("/")
        if a == b:
            return m.group(1)
    idx_m = re.search(r"\(\s*https?://", s)
    if idx_m and idx_m.start() > 0:
        head = s[: idx_m.start()].strip()
        tail = s[idx_m.start() + 1 :]
        if tail.startswith("("):
            tail = tail[1:]
        ci = tail.find(")")
        inner = (tail[:ci] if ci >= 0 else tail).strip()
        try:
            u_head = urlparse(head)
            u_inner = urlparse(inner)
            if (
                u_head.scheme
                and u_inner.scheme
                and u_head.netloc == u_inner.netloc
                and u_head.path == u_inner.path
            ):
                return head
        except Exception:
            pass
        if head.startswith("http") and inner.startswith("http") and head == inner:
            return head
        if head.startswith("http"):
            return head
    return s


async def _fetch(target: str, wait_ms: int, headful: bool) -> dict:
    async with BrowserSession(headless=not headful, persistent=True) as browser:
        page = await browser.fetch_page(target, wait_ms=wait_ms)
    return {
        "ok": page.page_state == "content",
        "url": page.url,
        "title": page.title,
        "state": page.page_state,
        "text": page.text,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Use a persistent browser profile to read a Feishu/Lark page.",
    )
    parser.add_argument("url", help="Target Feishu/Lark URL")
    parser.add_argument("--wait-ms", type=int, default=3000, help="Post-load wait time")
    parser.add_argument(
        "--headful",
        action="store_true",
        help="Launch a visible browser window instead of headless mode",
    )
    args = parser.parse_args()
    target = normalize_feishu_paste_url(args.url)

    try:
        payload = asyncio.run(_fetch(target, args.wait_ms, args.headful))
    except Exception as e:
        payload = {
            "ok": False,
            "url": target,
            "title": "",
            "state": "error",
            "text": "",
            "error": str(e),
        }

    print(json.dumps(payload, ensure_ascii=False))
    return 0 if payload.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
