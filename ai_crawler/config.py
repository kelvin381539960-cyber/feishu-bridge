"""Crawler configuration — reads from env vars with sensible defaults."""

import os

AI_BASE_URL = os.environ.get(
    "AI_BASE_URL",
    "https://ark.cn-beijing.volces.com/api/coding",
)
AI_API_KEY = os.environ.get(
    "AI_API_KEY",
    "d1170fba-c2e3-46da-8d79-3c5119fb2985",
)
AI_MODEL = os.environ.get("AI_MODEL", "doubao-seed-2.0-pro")

# Crawl defaults
DEFAULT_MAX_PAGES = 10
DEFAULT_DEPTH = 2
DEFAULT_TIMEOUT_MS = 30_000
DEFAULT_DELAY_SEC = 1.0

# Browser
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)
BROWSER_USER_DATA_DIR = os.environ.get(
    "FEISHU_BROWSER_PROFILE_DIR",
    os.path.expanduser("~/.feishu-browser-profile"),
)
BROWSER_LOGIN_BOOTSTRAP_URL = os.environ.get(
    "FEISHU_BROWSER_LOGIN_URL",
    "https://open.larksuite.com",
)
BROWSER_HEADLESS_DEFAULT = (
    os.environ.get("FEISHU_BROWSER_HEADLESS", "1").strip().lower()
    not in {"0", "false", "no"}
)

# Content limits sent to AI (characters)
MAX_CONTENT_CHARS = 48_000
MAX_LINKS_FOR_AI = 80
