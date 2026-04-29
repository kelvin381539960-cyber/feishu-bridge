#!/usr/bin/env node
/**
 * 直接向指定 chat_id 发送一条「交互卡片」示例（与 examples/feishu-interactive-card-sample.json 同结构）。
 *
 * 用法：
 *   set -a && source /etc/feishu-ws-cursor-bot.env && set +a
 *   node scripts/feishu-send-interactive-example.js <chat_id>
 *
 * 依赖：FEISHU_APP_ID + secret；需应用具备发送消息权限。
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");

function loadEnvFile(p) {
  if (!fs.existsSync(p)) return;
  const s = fs.readFileSync(p, "utf8");
  for (const line of s.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnvFile("/etc/feishu-ws-cursor-bot.env");

const { getTenantAccessToken, getFeishuApiBase } = require(path.join(
  __dirname,
  "..",
  "lib",
  "feishu-tenant"
));

const chatId = process.argv[2];
if (!chatId) {
  console.error("usage: node scripts/feishu-send-interactive-example.js <chat_id>");
  process.exit(2);
}

const samplePath = path.join(
  __dirname,
  "..",
  "examples",
  "feishu-interactive-card-sample.json"
);
const card = JSON.parse(fs.readFileSync(samplePath, "utf8"));

async function main() {
  const tok = await getTenantAccessToken();
  if (!tok) {
    console.error("no tenant token");
    process.exit(2);
  }
  const base = getFeishuApiBase();
  const r = await axios.post(
    `${base}/im/v1/messages`,
    {
      receive_id: chatId,
      msg_type: "interactive",
      content: JSON.stringify(card),
    },
    {
      params: { receive_id_type: "chat_id" },
      headers: {
        Authorization: `Bearer ${tok}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      timeout: 25000,
      validateStatus: () => true,
    }
  );
  if (r.status >= 400 || !r.data || r.data.code !== 0) {
    console.error("send failed", r.status, JSON.stringify(r.data));
    process.exit(1);
  }
  console.log("ok message_id=", r.data.data && r.data.data.message_id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
