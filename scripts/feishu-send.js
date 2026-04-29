#!/usr/bin/env node
/**
 * Standalone script to send a text message to a Feishu/Lark chat.
 * Designed to be called from `at`, cron, or any external scheduler.
 *
 * Usage:  node feishu-send.js <chat_id> <message>
 * Env:    FEISHU_APP_ID, FEISHU_APP_SECRET (or FEISHU_APP_SECRET_FILE),
 *         FEISHU_LARK_DOMAIN (feishu|lark, default feishu)
 *
 * Exits 0 on success, 1 on failure.
 */
const fs = require("fs");
const https = require("https");
const http = require("http");
const { URL } = require("url");

const chatId = process.argv[2];
const message = process.argv.slice(3).join(" ");

if (!chatId || !message) {
  console.error("usage: feishu-send.js <chat_id> <message text>");
  process.exit(2);
}

const appId = (process.env.FEISHU_APP_ID || "").trim();

function resolveAppSecret() {
  let s = (process.env.FEISHU_APP_SECRET || "").trim();
  if (s) return s;
  const p =
    (process.env.FEISHU_APP_SECRET_FILE || "").trim() ||
    "/etc/feishu-ws-cursor-bot.secret";
  try {
    if (p && fs.existsSync(p)) s = fs.readFileSync(p, "utf8").trim();
  } catch (_) {}
  return s;
}

function apiBase() {
  const d = (process.env.FEISHU_LARK_DOMAIN || "feishu").trim().toLowerCase();
  return d === "lark"
    ? "https://open.larksuite.com/open-apis"
    : "https://open.feishu.cn/open-apis";
}

function jsonPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "https:" ? https : http;
    const payload = JSON.stringify(body);
    const req = mod.request(
      u,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(payload),
          ...headers,
        },
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (_) {
            resolve({ raw: data, statusCode: res.statusCode });
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("request timeout"));
    });
    req.write(payload);
    req.end();
  });
}

async function main() {
  const appSecret = resolveAppSecret();
  if (!appId || !appSecret) {
    console.error("FEISHU_APP_ID or app secret not configured");
    process.exit(1);
  }

  const base = apiBase();

  const tokenRes = await jsonPost(
    `${base}/auth/v3/tenant_access_token/internal`,
    { app_id: appId, app_secret: appSecret }
  );
  if (!tokenRes || tokenRes.code !== 0) {
    console.error("tenant_access_token failed:", JSON.stringify(tokenRes));
    process.exit(1);
  }
  const token = tokenRes.tenant_access_token;

  const sendRes = await jsonPost(
    `${base}/im/v1/messages?receive_id_type=chat_id`,
    {
      receive_id: chatId,
      msg_type: "text",
      content: JSON.stringify({ text: message }),
    },
    { Authorization: `Bearer ${token}` }
  );

  if (!sendRes || sendRes.code !== 0) {
    console.error("send failed:", JSON.stringify(sendRes));
    process.exit(1);
  }
  console.log("ok");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
