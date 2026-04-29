#!/usr/bin/env node
"use strict";

/**
 * 可选：批量网页截图 HTTP 服务（127.0.0.1）。供 OpenClaw agent / curl 调用。
 * 依赖：npm install playwright && npx playwright install chromium
 * 文档：docs/feishu-research-screenshot-capture.md
 */

const http = require("http");

const PORT = Number(process.env.FEISHU_SCREENSHOT_SERVER_PORT || 17654) || 17654;
const MAX_CONCURRENCY = Math.max(
  1,
  Math.min(8, Number(process.env.FEISHU_SCREENSHOT_MAX_CONCURRENCY || 2) || 2)
);
const TIMEOUT_MS = Math.max(
  5000,
  Math.min(120000, Number(process.env.FEISHU_SCREENSHOT_TIMEOUT_MS || 45000) || 45000)
);
const EXTRA_WAIT_MS = Math.max(
  0,
  Math.min(10000, Number(process.env.FEISHU_SCREENSHOT_EXTRA_WAIT_MS || 1800) || 1800)
);

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    return null;
  }
}

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(s),
  });
  res.end(s);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeViewport(viewport) {
  const v = viewport && typeof viewport === "object" ? viewport : {};
  const width = Math.max(800, Math.min(2200, Number(v.width) || 1440));
  const height = Math.max(600, Math.min(2200, Number(v.height) || 960));
  return { width, height };
}

function normalizeTargets(body) {
  if (Array.isArray(body && body.targets)) {
    return body.targets
      .map((target) => ({
        url: String(target && target.url ? target.url : "").trim(),
        selectors: Array.isArray(target && target.selectors)
          ? target.selectors.map((selector) => String(selector || "").trim()).filter(Boolean).slice(0, 12)
          : [],
        viewport: normalizeViewport(target && target.viewport),
        waitMs: Math.max(0, Math.min(10000, Number(target && target.waitMs) || EXTRA_WAIT_MS)),
      }))
      .filter((target) => /^https?:\/\//i.test(target.url));
  }
  if (Array.isArray(body && body.urls)) {
    return body.urls
      .map((url) => String(url || "").trim())
      .filter((url) => /^https?:\/\//i.test(url))
      .map((url) => ({ url, selectors: [], viewport: normalizeViewport(body && body.viewport), waitMs: EXTRA_WAIT_MS }));
  }
  return [];
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const step = 640;
      const timer = setInterval(() => {
        const maxScroll = Math.max(
          document.body ? document.body.scrollHeight : 0,
          document.documentElement ? document.documentElement.scrollHeight : 0
        );
        window.scrollBy(0, step);
        total += step;
        if (total >= maxScroll + step) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 120);
    });
  });
}

async function trySelectorScreenshot(page, selector) {
  const trimmed = String(selector || "").trim();
  if (!trimmed) return null;
  try {
    const locator = page.locator(trimmed).first();
    await locator.waitFor({ state: "visible", timeout: 2000 });
    const box = await locator.boundingBox();
    if (!box || box.width < 40 || box.height < 40) return null;
    const buf = await locator.screenshot({ type: "png" });
    if (!buf || !buf.length) return null;
    return { ok: true, pngBase64: buf.toString("base64"), captureMode: "selector", selectorUsed: trimmed };
  } catch {
    return null;
  }
}

async function captureOne(browser, target, requestTimeoutMs) {
  const context = await browser.newContext({ viewport: normalizeViewport(target && target.viewport) });
  const page = await context.newPage();
  const timeoutMs = Math.max(5000, Math.min(180000, Number(requestTimeoutMs) || TIMEOUT_MS));
  try {
    await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await sleep(target.waitMs || EXTRA_WAIT_MS);
    await autoScroll(page).catch(() => {});
    await sleep(500);

    const selectors = Array.isArray(target && target.selectors) ? target.selectors : [];
    for (const selector of selectors) {
      const shot = await trySelectorScreenshot(page, selector);
      if (shot) return { url: target.url, ...shot };
    }

    const buf = await page.screenshot({ type: "png", fullPage: true });
    return { url: target.url, ok: true, pngBase64: buf.toString("base64"), captureMode: "full_page", selectorUsed: "" };
  } catch (e) {
    return { url: target.url, ok: false, error: String(e && e.message ? e.message : e) };
  } finally {
    await context.close().catch(() => {});
  }
}

async function runPool(pw, targets, requestTimeoutMs) {
  const out = new Array(targets.length);
  const browser = await pw.chromium.launch({ headless: true });
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= targets.length) return;
      out[i] = await captureOne(browser, targets[i], requestTimeoutMs);
    }
  }

  try {
    const workers = [];
    for (let k = 0; k < Math.min(MAX_CONCURRENCY, targets.length); k += 1) workers.push(worker());
    await Promise.all(workers);
    return out;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function handleCapture(pw, req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return json(res, 400, { ok: false, error: "invalid_json" });
  }

  const targets = normalizeTargets(body);
  if (!targets.length) return json(res, 400, { ok: false, error: "targets_or_urls_required" });
  if (targets.length > 40) return json(res, 400, { ok: false, error: "too_many_targets_max_40" });
  if (!pw) {
    return json(res, 503, {
      ok: false,
      error: "playwright_not_installed",
      hint: "npm install playwright && npx playwright install chromium",
    });
  }
  try {
    const results = await runPool(pw, targets, body && body.timeoutMs);
    return json(res, 200, { ok: true, results });
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e && e.message ? e.message : e) });
  }
}

const pw = loadPlaywright();

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  if (req.method === "GET" && u.pathname === "/health") {
    return json(res, 200, { ok: true, playwright: !!pw, selectorCapture: true });
  }
  if (req.method === "POST" && u.pathname === "/capture") {
    return handleCapture(pw, req, res);
  }
  json(res, 404, { ok: false, error: "not_found" });
});

server.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(
    `[feishu-research-screenshot-server] listening http://127.0.0.1:${PORT} playwright=${!!pw}`
  );
});
