#!/usr/bin/env node
/**
 * 使用 lib/feishu-im-card.js 将 Markdown 风格正文转为交互卡片并发送（与机器人主路径一致）。
 *
 *   set -a && source /etc/feishu-ws-cursor-bot.env && set +a
 *   node scripts/feishu-send-card-from-markdown-example.js <chat_id>
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

const { buildInteractiveCardPayload } = require(path.join(
  __dirname,
  "..",
  "lib",
  "feishu-im-card"
));
const { getTenantAccessToken, getFeishuApiBase } = require(path.join(
  __dirname,
  "..",
  "lib",
  "feishu-tenant"
));

const chatId = process.argv[2];
if (!chatId) {
  console.error(
    "usage: node scripts/feishu-send-card-from-markdown-example.js <chat_id>"
  );
  process.exit(2);
}

const md = `回复 Hanjie Zhang：给我补充一些 app 界面截图

✅ **UI 截图已补充完成！**

飞书文档已更新：[文档](https://feishu.cn/docx/demo)

---

### 📸 新增内容

| 样式 | 说明 |
|------|------|
| A | 示例 A |
| B | 示例 B |
`;

async function main() {
  const { card } = buildInteractiveCardPayload(md);
  const tok = await getTenantAccessToken();
  if (!tok) {
    console.error("no tenant token");
    process.exit(2);
  }
  const r = await axios.post(
    `${getFeishuApiBase()}/im/v1/messages`,
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
  console.log("ok", r.data.data && r.data.data.message_id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
