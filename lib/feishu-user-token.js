"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { getFeishuApiBase } = require("./feishu-tenant");

const DEFAULT_TOKEN_STORE = "/etc/feishu-whiteboard-bot.token.json";

function getTokenStorePath() {
  return (
    (process.env.FEISHU_WHITEBOARD_TOKEN_STORE || "").trim() ||
    DEFAULT_TOKEN_STORE
  );
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch (_) {
    // ignore chmod failure on unsupported fs
  }
}

function getWhiteboardOauthConfig() {
  const clientId = (process.env.FEISHU_APP_ID || "").trim();
  const clientSecret =
    (process.env.FEISHU_APP_SECRET || "").trim() ||
    (() => {
      const secretFile = (
        process.env.FEISHU_APP_SECRET_FILE || "/etc/feishu-ws-cursor-bot.secret"
      ).trim();
      if (!secretFile || !fs.existsSync(secretFile)) return "";
      return fs.readFileSync(secretFile, "utf8").trim();
    })();
  const redirectUri = (
    process.env.FEISHU_WHITEBOARD_REDIRECT_URI ||
    process.env.WHITEBOARD_REDIRECT_URI ||
    "https://your-domain.example.com/feishu-whiteboard/oauth/callback"
  ).trim();
  return {
    clientId,
    clientSecret,
    redirectUri,
    tokenStore: getTokenStorePath(),
  };
}

function readStoredUserToken() {
  return readJsonFile(getTokenStorePath());
}

function readStoredUserTokenAt(storePath) {
  const p = String(storePath || "").trim();
  if (!p) return null;
  return readJsonFile(p);
}

function persistUserTokenAt(storePath, data) {
  const p = String(storePath || "").trim();
  if (!p) {
    throw new Error("persistUserTokenAt: empty storePath");
  }
  const now = Date.now();
  const refreshExpiresIn =
    Number(data.refresh_expires_in) ||
    Number(data.refresh_token_expires_in) ||
    0;
  const payload = {
    access_token: data.access_token || "",
    refresh_token: data.refresh_token || "",
    scope: data.scope || "",
    token_type: data.token_type || "",
    user_id: data.user_id || "",
    open_id: data.open_id || "",
    tenant_key: data.tenant_key || "",
    name: data.name || "",
    refresh_expires_in: refreshExpiresIn,
    expires_in: Number(data.expires_in) || 0,
    access_token_expire_at: now + (Number(data.expires_in) || 0) * 1000,
    refresh_token_expire_at: now + refreshExpiresIn * 1000,
    updated_at: new Date(now).toISOString(),
  };
  writeJsonFile(p, payload);
  return payload;
}

function persistUserToken(data) {
  return persistUserTokenAt(getTokenStorePath(), data);
}

async function exchangeOauthCode(code, options = {}) {
  const cfg = getWhiteboardOauthConfig();
  const redirectUri = (options.redirectUri || cfg.redirectUri || "").trim();
  const res = await axios.post(
    `${getFeishuApiBase()}/authen/v2/oauth/token`,
    {
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code: String(code || "").trim(),
      redirect_uri: redirectUri,
    },
    {
      headers: { "Content-Type": "application/json; charset=utf-8" },
      timeout: 30000,
      validateStatus: () => true,
    }
  );
  if (res.status >= 400 || !res.data || !res.data.access_token) {
    return {
      ok: false,
      status: res.status,
      code: res.data && res.data.code,
      msg:
        (res.data && (res.data.msg || res.data.error_description)) ||
        (res.data && res.data.error) ||
        "oauth_exchange_failed",
      body: res.data,
    };
  }
  const payload = res.data.data || res.data;
  const storePath = String(options.tokenStorePath || "").trim() || getTokenStorePath();
  return { ok: true, data: persistUserTokenAt(storePath, payload) };
}

async function refreshUserAccessTokenAt(storePath, refreshToken) {
  const cfg = getWhiteboardOauthConfig();
  const p = String(storePath || "").trim();
  const stored = p ? readStoredUserTokenAt(p) : readStoredUserToken();
  const token = String(refreshToken || stored?.refresh_token || "").trim();
  if (!token) {
    return { ok: false, error: "no_refresh_token" };
  }
  const res = await axios.post(
    `${getFeishuApiBase()}/authen/v2/oauth/token`,
    {
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token",
      refresh_token: token,
    },
    {
      headers: { "Content-Type": "application/json; charset=utf-8" },
      timeout: 30000,
      validateStatus: () => true,
    }
  );
  const body = res.data || {};
  const data = body.data || body;
  if (res.status >= 400 || !data || !data.access_token) {
    return {
      ok: false,
      status: res.status,
      code: body.code,
      msg:
        body.msg ||
        body.error_description ||
        body.error ||
        "refresh_access_token_failed",
      body,
    };
  }
  const outPath = p || getTokenStorePath();
  return { ok: true, data: persistUserTokenAt(outPath, data) };
}

async function refreshUserAccessToken(refreshToken = "") {
  return refreshUserAccessTokenAt("", refreshToken);
}

async function getValidUserAccessTokenFromStore(storePath) {
  const p = String(storePath || "").trim();
  if (!p) {
    return { ok: false, error: "empty_store_path" };
  }
  const stored = readStoredUserTokenAt(p);
  const now = Date.now();
  if (
    stored &&
    stored.access_token &&
    Number(stored.access_token_expire_at || 0) > now + 120000
  ) {
    return { ok: true, token: stored.access_token, source: "store" };
  }
  if (stored && stored.refresh_token) {
    const refreshed = await refreshUserAccessTokenAt(p, stored.refresh_token);
    if (refreshed.ok) {
      return {
        ok: true,
        token: refreshed.data.access_token,
        source: "refresh_token",
      };
    }
    return refreshed;
  }
  return { ok: false, error: "no_user_token" };
}

async function getValidUserAccessToken() {
  const stored = readStoredUserToken();
  const now = Date.now();
  if (
    stored &&
    stored.access_token &&
    Number(stored.access_token_expire_at || 0) > now + 120000
  ) {
    return { ok: true, token: stored.access_token, source: "store" };
  }
  if (stored && stored.refresh_token) {
    const refreshed = await refreshUserAccessToken(stored.refresh_token);
    if (refreshed.ok) {
      return {
        ok: true,
        token: refreshed.data.access_token,
        source: "refresh_token",
      };
    }
    return refreshed;
  }
  return { ok: false, error: "no_user_token" };
}

function getOauthAuthorizeUrl(options = {}) {
  const cfg = getWhiteboardOauthConfig();
  const scope =
    (options.scope ||
      process.env.FEISHU_WHITEBOARD_OAUTH_SCOPE ||
      "board:whiteboard:node:create offline_access").trim();
  const state = (options.state || "whiteboard_write").trim();
  const redirectUri = encodeURIComponent(options.redirectUri || cfg.redirectUri);
  return `https://accounts.larksuite.com/open-apis/authen/v1/authorize?client_id=${encodeURIComponent(
    cfg.clientId
  )}&redirect_uri=${redirectUri}&scope=${encodeURIComponent(
    scope
  )}&state=${encodeURIComponent(state)}`;
}

module.exports = {
  DEFAULT_TOKEN_STORE,
  exchangeOauthCode,
  getOauthAuthorizeUrl,
  getTokenStorePath,
  getValidUserAccessToken,
  getValidUserAccessTokenFromStore,
  getWhiteboardOauthConfig,
  persistUserToken,
  persistUserTokenAt,
  readStoredUserToken,
  readStoredUserTokenAt,
  refreshUserAccessToken,
  refreshUserAccessTokenAt,
};
