#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

/** 对外分享「找不同」静态站（走已放行的白板端口，避免单独开端口） */
const SPOT_DIFF_STATIC_ROOT = path.resolve(
  process.env.SPOT_DIFF_STATIC_ROOT || "/root/.openclaw/workspace/spot-diff"
);
const {
  getOauthAuthorizeUrl,
  exchangeOauthCode,
  readStoredUserToken,
  getTokenStorePath,
  getWhiteboardOauthConfig,
} = require("../lib/feishu-user-token");
const {
  DEFAULT_WHITEBOARD_ID,
  writeSwimlaneToWhiteboard,
} = require("../lib/feishu-whiteboard-write");

const PORT = Math.max(
  1,
  Number(process.env.FEISHU_WHITEBOARD_PORT || process.env.PORT || 8091)
);
const HOST = (process.env.FEISHU_WHITEBOARD_HOST || "0.0.0.0").trim();
const SERVICE_TOKEN = (process.env.FEISHU_WHITEBOARD_SERVICE_TOKEN || "").trim();

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(html);
}

function renderCallbackHtml(result, extra = {}) {
  const code = extra.code || "";
  const state = extra.state || "";
  const message = result.ok
    ? "授权成功，refresh token 已写入云端。后续可直接复用。"
    : `授权失败：${result.msg || result.error || "unknown_error"}`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>Feishu Whiteboard OAuth</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; line-height: 1.6; color: #111827; }
    pre, code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
    pre { padding: 12px; white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body>
  <h1>Feishu Whiteboard OAuth</h1>
  <p>${message}</p>
  <p><strong>code:</strong></p>
  <pre>${code || "(empty)"}</pre>
  <p><strong>state:</strong> <code>${state}</code></p>
  <p><strong>token store:</strong> <code>${getTokenStorePath()}</code></p>
</body>
</html>`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) {
        reject(new Error("body_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function isAuthorized(req) {
  if (!SERVICE_TOKEN) return true;
  const auth = String(req.headers.authorization || "");
  return auth === `Bearer ${SERVICE_TOKEN}`;
}

async function handleHealth(_req, res) {
  const stored = readStoredUserToken();
  const now = Date.now();
  sendJson(res, 200, {
    ok: true,
    service: "feishu-whiteboard-service",
    port: PORT,
    defaultWhiteboardId: DEFAULT_WHITEBOARD_ID,
    oauth: {
      redirectUri: getWhiteboardOauthConfig().redirectUri,
      authorizeUrl: getOauthAuthorizeUrl(),
      tokenStore: getTokenStorePath(),
      hasStoredToken: Boolean(stored && stored.refresh_token),
      accessTokenValid:
        Boolean(stored && stored.access_token) &&
        Number(stored?.access_token_expire_at || 0) > now + 120000,
      refreshTokenValid:
        Boolean(stored && stored.refresh_token) &&
        Number(stored?.refresh_token_expire_at || 0) > now + 120000,
      scope: stored?.scope || "",
      updatedAt: stored?.updated_at || null,
    },
  });
}

async function handleAuthorize(_req, res) {
  sendJson(res, 200, {
    ok: true,
    authorizeUrl: getOauthAuthorizeUrl(),
    redirectUri: getWhiteboardOauthConfig().redirectUri,
  });
}

async function handleCallback(reqUrl, res) {
  const code = (reqUrl.searchParams.get("code") || "").trim();
  const state = (reqUrl.searchParams.get("state") || "").trim();
  if (!code) {
    sendHtml(
      res,
      400,
      renderCallbackHtml({ ok: false, error: "missing_code" }, { code, state })
    );
    return;
  }
  const result = await exchangeOauthCode(code, {
    redirectUri: getWhiteboardOauthConfig().redirectUri,
  });
  sendHtml(res, result.ok ? 200 : 400, renderCallbackHtml(result, { code, state }));
}

function spotDiffContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function handleSpotDiffStatic(reqUrl, res) {
  const rootResolved = path.resolve(SPOT_DIFF_STATIC_ROOT);
  let rel = decodeURIComponent(reqUrl.pathname.replace(/^\/spot-diff\/?/, "") || "index.html");
  if (rel.includes("\0") || rel.includes("..")) {
    sendJson(res, 400, { ok: false, error: "bad_path" });
    return;
  }
  let full = path.resolve(path.join(rootResolved, path.normalize(rel)));
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
    sendJson(res, 403, { ok: false, error: "forbidden" });
    return;
  }
  try {
    let st = await fs.promises.stat(full);
    if (st.isDirectory()) {
      full = path.join(full, "index.html");
      st = await fs.promises.stat(full);
    }
    if (!st.isFile()) {
      sendJson(res, 404, { ok: false, error: "not_found" });
      return;
    }
    const buf = await fs.promises.readFile(full);
    res.writeHead(200, {
      "Content-Type": spotDiffContentType(full),
      "Cache-Control": "public, max-age=120",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(buf);
  } catch (e) {
    if (e && e.code === "ENOENT") {
      sendJson(res, 404, { ok: false, error: "not_found" });
    } else {
      sendJson(res, 500, { ok: false, error: e && e.message ? e.message : "read_error" });
    }
  }
}

async function handleReplay(req, res) {
  if (!isAuthorized(req)) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  const rawBody = await readBody(req);
  let payload = {};
  if (rawBody.trim()) {
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "invalid_json", message: error.message });
      return;
    }
  }
  const result = await writeSwimlaneToWhiteboard({
    whiteboardId: payload.whiteboardId || DEFAULT_WHITEBOARD_ID,
    oauthCode: payload.oauthCode || "",
    redirectUri: payload.redirectUri || getWhiteboardOauthConfig().redirectUri,
    offsetX: payload.offsetX,
    offsetY: payload.offsetY,
    dryRun: Boolean(payload.dryRun),
  });
  sendJson(res, result.ok ? 200 : 400, result);
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
    if (req.method === "GET" && reqUrl.pathname === "/feishu-whiteboard/health") {
      await handleHealth(req, res);
      return;
    }
    if (req.method === "GET" && reqUrl.pathname === "/feishu-whiteboard/authorize") {
      await handleAuthorize(req, res);
      return;
    }
    if (
      req.method === "GET" &&
      (reqUrl.pathname === "/feishu-whiteboard/oauth/callback" ||
        reqUrl.pathname === "/feishu/oauth/callback")
    ) {
      await handleCallback(reqUrl, res);
      return;
    }
    if (req.method === "POST" && reqUrl.pathname === "/feishu-whiteboard/replay") {
      await handleReplay(req, res);
      return;
    }
    if (req.method === "GET" && reqUrl.pathname.startsWith("/spot-diff")) {
      await handleSpotDiffStatic(reqUrl, res);
      return;
    }
    sendJson(res, 404, { ok: false, error: "not_found", path: reqUrl.pathname });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "internal_error" });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `[feishu-whiteboard-service] listening on ${HOST}:${PORT}\n`
  );
});
