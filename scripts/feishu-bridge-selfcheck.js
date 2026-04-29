#!/usr/bin/env node
/**
 * 在机器人所在机器上运行，检查飞书凭证、网关配置是否与 systemd 一致。
 * 用法：
 *   node scripts/feishu-bridge-selfcheck.js
 *   node scripts/feishu-bridge-selfcheck.js /path/to/feishu-ws-cursor-bot.env
 * 默认读取 /etc/feishu-ws-cursor-bot.env（与 feishu-ws-cursor-bot.service 一致）
 */
"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");

const DEFAULT_ENV_FILE = "/etc/feishu-ws-cursor-bot.env";

function loadEnvFile(p) {
  if (!p || !fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function main() {
  const envFile = process.argv[2] || process.env.FEISHU_SELF_CHECK_ENV || DEFAULT_ENV_FILE;
  loadEnvFile(envFile);

  console.log("=== feishu-bridge selfcheck ===");
  console.log("env file:", envFile, fs.existsSync(envFile) ? "" : "(missing)");
  console.log("systemd WorkingDirectory 通常为 /opt/feishu-bridge — 请确认已同步最新代码到该目录");
  console.log("");

  const appId = String(process.env.FEISHU_APP_ID || "").trim();
  const trigger = String(process.env.FEISHU_CURSOR_TRIGGER_ENABLED || "").trim();
  const mode = String(process.env.FEISHU_CURSOR_MODE || "prefix").trim().toLowerCase();
  const prefix = String(process.env.FEISHU_CURSOR_TRIGGER_PREFIX || "/figma").trim() || "/figma";
  const gw = String(process.env.OPENCLAW_GATEWAY_URL || "").trim();

  let ok = true;
  if (!appId) {
    console.log("[FAIL] FEISHU_APP_ID 未设置");
    ok = false;
  } else {
    console.log("[ok] FEISHU_APP_ID=", `${appId.slice(0, 10)}…`);
  }

  if (trigger !== "1") {
    console.log("[FAIL] FEISHU_CURSOR_TRIGGER_ENABLED 应为 1，当前=", trigger || "(empty)");
    ok = false;
  } else {
    console.log("[ok] FEISHU_CURSOR_TRIGGER_ENABLED=1");
  }

  console.log(
    "[info] FEISHU_CURSOR_MODE=",
    mode === "direct" ? "direct（任意文本触发）" : `prefix（须以「${prefix}」开头）`
  );
  if (!gw) {
    console.log("[FAIL] OPENCLAW_GATEWAY_URL 未设置");
    ok = false;
  } else {
    console.log("[ok] OPENCLAW_GATEWAY_URL=", gw);
  }

  const secretFile = String(process.env.FEISHU_APP_SECRET_FILE || "/etc/feishu-ws-cursor-bot.secret").trim();
  const secretEnv = String(process.env.FEISHU_APP_SECRET || "").trim();
  let secret = secretEnv;
  if (!secret && secretFile && fs.existsSync(secretFile)) {
    try {
      secret = fs.readFileSync(secretFile, "utf8").trim();
    } catch (_) {}
  }
  if (!secret) {
    console.log("[FAIL] 无 App Secret：请设 FEISHU_APP_SECRET 或可读文件", secretFile);
    ok = false;
  } else {
    console.log("[ok] App Secret 已配置（长度", secret.length, "）");
  }

  console.log("");
  console.log("--- 飞书 API ---");
  const { getTenantAccessToken, getBotSelfOpenId } = require("../lib/feishu-tenant");
  const token = await getTenantAccessToken();
  if (!token) {
    console.log("[FAIL] tenant_access_token 获取失败（见上方 stderr）");
    process.exit(2);
  }
  console.log("[ok] tenant_access_token 可用");
  const oid = await getBotSelfOpenId();
  if (oid) {
    console.log("[ok] bot open_id=", oid);
  } else {
    console.log("[FAIL] bot/v3/info 未拿到 open_id");
    ok = false;
  }

  console.log("");
  console.log("--- OpenClaw CLI（可选）---");
  try {
    const bin = String(process.env.OPENCLAW_BIN || "openclaw").trim() || "openclaw";
    const out = execFileSync(bin, ["gateway", "status"], {
      encoding: "utf8",
      timeout: 15000,
      env: process.env,
    });
    console.log(out.slice(0, 2000));
  } catch (e) {
    console.log(
      "[warn] openclaw gateway status 失败：",
      e && e.message ? e.message : String(e)
    );
  }

  console.log("");
  if (ok && oid) {
    console.log("结论: 凭证与触发开关看起来正常。若飞书仍无回复，请逐项确认：");
    console.log("  1) systemctl restart feishu-ws-cursor-bot 后 journalctl -u feishu-ws-cursor-bot -n 80");
    console.log("  2) prefix 模式测试消息:", `${prefix} ping`);
    console.log("  3) 群聊是否 @ 本机器人（或 FEISHU_CURSOR_GROUP_REQUIRE_AT_BOT=0）");
    console.log("  4) /opt/feishu-bridge 是否已 rsync/cp 最新 lib/ 与 feishu-ws-cursor.js");
    console.log("  5) 卡片发送失败时可试 FEISHU_REPLY_MESSAGE_FORMAT=text");
    process.exit(0);
  }
  process.exit(2);
}

main().catch((e) => {
  console.error("[FAIL]", e);
  process.exit(2);
});
