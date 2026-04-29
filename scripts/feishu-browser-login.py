#!/usr/bin/env python3
"""Open a persistent browser profile so the operator can log into Feishu/Lark once."""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ai_crawler.browser import BrowserSession  # noqa: E402


async def _main() -> int:
    parser = argparse.ArgumentParser(
        description="Launch the persistent browser profile and wait for manual login.",
    )
    parser.add_argument(
        "--url",
        default="",
        help="Optional URL to open instead of the default Feishu/Lark bootstrap page",
    )
    parser.add_argument(
        "--wait-ms",
        type=int,
        default=5000,
        help="Initial wait after opening the login bootstrap URL",
    )
    args = parser.parse_args()

    async with BrowserSession(headless=False, persistent=True) as browser:
        if args.url:
            page = await browser._ctx.new_page()
            await page.goto(args.url, wait_until="domcontentloaded")
            await page.wait_for_timeout(args.wait_ms)
        else:
            page = await browser.bootstrap_login(wait_ms=args.wait_ms)
        print("已打开登录/授权页。")
        print(f"当前页面: {page.url}")
        if sys.stdin.isatty():
            print("请在浏览器中完成登录，然后回到终端按回车退出。")
            await asyncio.to_thread(input)
        else:
            print("当前为后台模式；请在 VNC 虚拟桌面中完成登录，完成后用 stop 脚本结束会话。")
            while True:
                await asyncio.sleep(3600)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
