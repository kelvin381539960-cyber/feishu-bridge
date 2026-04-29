#!/usr/bin/env python3
"""Validate whether the persistent browser profile can still access Feishu/Lark pages."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai_crawler import config  # noqa: E402
from ai_crawler.browser import BrowserSession  # noqa: E402


async def _main() -> int:
    parser = argparse.ArgumentParser(
        description="Check if the persistent Feishu browser profile is healthy.",
    )
    parser.add_argument(
        "--url",
        default="",
        help="Optional Feishu/Lark document URL to verify after opening the bootstrap page",
    )
    parser.add_argument("--wait-ms", type=int, default=3000, help="Post-load wait time")
    args = parser.parse_args()

    payload = {
        "profile_dir": config.BROWSER_USER_DATA_DIR,
        "profile_exists": os.path.isdir(config.BROWSER_USER_DATA_DIR),
    }

    async with BrowserSession(persistent=True) as browser:
        bootstrap = await browser.bootstrap_login(wait_ms=args.wait_ms)
        payload["bootstrap"] = {
            "url": bootstrap.url,
            "title": bootstrap.title,
            "state": bootstrap.page_state,
        }
        if args.url:
            page = await browser.fetch_page(args.url, wait_ms=args.wait_ms)
            payload["target"] = {
                "url": page.url,
                "title": page.title,
                "state": page.page_state,
                "text_preview": page.text[:500],
            }

    ok = payload["bootstrap"]["state"] != "login_required"
    if args.url:
        ok = ok and payload["target"]["state"] == "content"
    payload["ok"] = ok
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
