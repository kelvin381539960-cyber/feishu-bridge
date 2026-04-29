#!/usr/bin/env node
/**
 * 发送一条与线上一致的「调研概要 + 云文档链接」交互卡片（用于验收 UI）。
 * 正文为 buildResearchChatSummary 生成，与 pipeline 云文档导出成功后的聊天形态一致。
 *
 * 用法：
 *   set -a && source /etc/feishu-ws-cursor-bot.env && set +a
 *   node scripts/feishu-send-research-summary-demo.js <chat_id> [doc_url]
 *
 * doc_url 默认 https://feishu.cn/docx/demo-research-token（可换真实云文档链接）
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

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

const { buildResearchChatSummary } = require(path.join(
  __dirname,
  "..",
  "lib",
  "feishu-research-chat-summary"
));
const { sendFeishuChatReply } = require(path.join(__dirname, "..", "lib", "feishu-tenant"));

const chatId = process.argv[2];
const docUrl =
  process.argv[3] ||
  process.env.FEISHU_DEMO_DOC_URL ||
  "https://feishu.cn/docx/demo-research-token";

if (!chatId) {
  console.error(
    "usage: node scripts/feishu-send-research-summary-demo.js <chat_id> [doc_url]"
  );
  process.exit(2);
}

const SAMPLE_FULL_MARKDOWN = [
  "# 马来西亚与菲律宾信贷/银行/信用卡类 App「即将到期还款」用语调研",
  "",
  "> 调研日期：2026-04-14 | 作者：Cursor Agent",
  "",
  "## 澄清假设与待确认问题",
  "",
  "## 1. 背景与定义",
  "",
  "## 2. 马来西亚常见表述",
  "",
  "## 3. 菲律宾常见表述",
  "",
  "## 4. 对比与建议",
  "",
  "## 参考资料",
  "",
].join("\n");

async function main() {
  const body = buildResearchChatSummary({
    fullMarkdown: SAMPLE_FULL_MARKDOWN,
    docUrl,
    fallbackTitle: "马来西亚与菲律宾信贷/银行/信用卡类 App「即将到期还款」用语调研",
  });
  await sendFeishuChatReply(chatId, body);
  console.log("ok sent research summary card");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
