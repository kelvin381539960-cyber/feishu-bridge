"""Playwright browser wrapper with optional persistent login profile."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

from playwright.async_api import async_playwright, Page, Browser, BrowserContext

from . import config


@dataclass
class PageResult:
    url: str
    title: str
    text: str
    html: str
    links: list[dict[str, str]] = field(default_factory=list)
    screenshot: bytes | None = None
    page_state: str = "content"


class BrowserSession:
    """Manages a Chromium instance with optional persistent profile."""

    def __init__(
        self,
        headless: bool | None = None,
        *,
        persistent: bool = False,
        user_data_dir: str | None = None,
        login_bootstrap_url: str | None = None,
    ):
        self._headless = config.BROWSER_HEADLESS_DEFAULT if headless is None else headless
        self._persistent = persistent
        self._user_data_dir = user_data_dir or config.BROWSER_USER_DATA_DIR
        self._login_bootstrap_url = login_bootstrap_url or config.BROWSER_LOGIN_BOOTSTRAP_URL
        self._pw = None
        self._browser: Browser | None = None
        self._ctx: BrowserContext | None = None

    async def start(self):
        self._pw = await async_playwright().start()
        launch_args = {
            "headless": self._headless,
            "user_agent": config.USER_AGENT,
            "viewport": {"width": 1280, "height": 900},
            "ignore_https_errors": True,
        }
        if self._persistent:
            os.makedirs(self._user_data_dir, exist_ok=True)
            self._ctx = await self._pw.chromium.launch_persistent_context(
                self._user_data_dir,
                **launch_args,
            )
            self._browser = self._ctx.browser
        else:
            self._browser = await self._pw.chromium.launch(headless=self._headless)
            self._ctx = await self._browser.new_context(
                user_agent=config.USER_AGENT,
                viewport={"width": 1280, "height": 900},
                ignore_https_errors=True,
            )

    async def close(self):
        if self._ctx:
            await self._ctx.close()
        if self._browser and not self._persistent:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()

    async def __aenter__(self):
        await self.start()
        return self

    async def __aexit__(self, *exc):
        await self.close()

    async def fetch_page(
        self,
        url: str,
        *,
        wait_ms: int = 2000,
        screenshot: bool = False,
    ) -> PageResult:
        page: Page = await self._ctx.new_page()
        try:
            resp = await page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=config.DEFAULT_TIMEOUT_MS,
            )
            if resp and resp.status >= 400:
                raise RuntimeError(f"HTTP {resp.status} for {url}")

            await page.wait_for_timeout(wait_ms)

            # Auto-scroll to trigger lazy loading
            await _auto_scroll(page)

            title = await page.title()
            text = await page.inner_text("body")
            html = await page.content()
            links = await _extract_links(page, url)
            page_state = _detect_page_state(page.url, title, text, html)

            shot = None
            if screenshot:
                shot = await page.screenshot(full_page=True)

            return PageResult(
                url=page.url,
                title=title,
                text=_clean_text(text),
                html=html,
                links=links,
                screenshot=shot,
                page_state=page_state,
            )
        finally:
            await page.close()

    async def bootstrap_login(self, wait_ms: int = 5000) -> PageResult:
        return await self.fetch_page(
            self._login_bootstrap_url,
            wait_ms=wait_ms,
            screenshot=False,
        )


async def _auto_scroll(page: Page, max_scrolls: int = 5):
    """Scroll down incrementally to trigger lazy-loaded content."""
    for _ in range(max_scrolls):
        prev_height = await page.evaluate("document.body.scrollHeight")
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await page.wait_for_timeout(800)
        new_height = await page.evaluate("document.body.scrollHeight")
        if new_height == prev_height:
            break


async def _extract_links(page: Page, base_url: str) -> list[dict[str, str]]:
    """Pull all <a> links with href and visible text."""
    raw = await page.evaluate("""
        () => Array.from(document.querySelectorAll('a[href]')).map(a => ({
            href: a.href,
            text: (a.innerText || '').trim().slice(0, 120)
        }))
    """)
    seen = set()
    links = []
    for item in raw:
        href = item.get("href", "")
        if not href or href.startswith("javascript:") or href.startswith("#"):
            continue
        full = urljoin(base_url, href)
        if full in seen:
            continue
        seen.add(full)
        links.append({"url": full, "text": item.get("text", "")})
    return links


_WS_RE = re.compile(r"[ \t]+")
_NL_RE = re.compile(r"\n{3,}")
_LOGIN_RE = re.compile(
    r"(switch to feishu to log in|scan qr code|continue with sso|email address|phone number|sign in|登录|扫码)",
    re.I,
)
_DENIED_RE = re.compile(
    r"(no permission|permission denied|access denied|申请访问|无权限|没有权限|不可访问)",
    re.I,
)
_NOT_FOUND_RE = re.compile(
    r"(\b404\b|page not found|not found|页面不存在|文档不存在)",
    re.I,
)


def _clean_text(text: str) -> str:
    text = _WS_RE.sub(" ", text)
    text = _NL_RE.sub("\n\n", text)
    return text.strip()


def _detect_page_state(url: str, title: str, text: str, html: str) -> str:
    url = url or ""
    title = title or ""
    text = text or ""
    html = html or ""
    text_head = text[:2000]
    html_head = html[:2000]
    sample = "\n".join(s for s in [url, title, text_head, html_head] if s)

    is_login_url = "/accounts/page/login" in url or "accounts.larksuite.com/accounts" in url
    is_login_shell = "passport/static/login" in html
    login_text_signals = (
        _LOGIN_RE.search(sample)
        and "welcome to lark" in text.lower()
        and ("email address" in text.lower() or "phone number" in text.lower())
    )
    if is_login_url or is_login_shell or login_text_signals:
        return "login_required"
    if _DENIED_RE.search(sample):
        return "permission_denied"
    if _NOT_FOUND_RE.search(sample):
        return "not_found"
    if not (text or "").strip():
        return "empty"
    return "content"
