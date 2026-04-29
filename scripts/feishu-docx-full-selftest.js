#!/usr/bin/env node
/**
 * 端到端自检：与 pipeline 相同路径创建飞书云文档并写入 Markdown 正文（调研类）。
 *
 *   node scripts/feishu-docx-full-selftest.js
 *
 * 依赖：/etc/feishu-ws-cursor-bot.env + secret；需 FEISHU_CLOUD_DOC_EXPORT=1 或本脚本临时设为 1。
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

const { maybeAppendFeishuResearchDocUrl } = require(path.join(
  __dirname,
  "..",
  "lib",
  "feishu-docx-export"
));

/** 示例调研课题：短篇幅、结构完整，便于肉眼看正文是否写入 */
const SAMPLE_USER_TASK =
  "技术调研：边缘计算在跨境支付风控中的落地与边界";

const SAMPLE_REPLY = `# ${SAMPLE_USER_TASK}

## 摘要

本笔记为 **feishu-bridge 云文档导出** 的端到端自检样例：若你在飞书中打开链接能看到本节及以下内容，说明 \`createDocument\` + \`resolveParentBlockId\` + \`createDescendants\` 链路正常。

## 背景与问题

- 支付机构需在低延迟下完成风控评分。
- 边缘节点可减少回源延迟，但带来一致性与合规审计难点。

## 初步结论

| 维度 | 说明 |
|------|------|
| 延迟 | 边缘推理可降低 P99 决策时延 |
| 合规 | 需明确哪些特征可在边缘计算、哪些必须回中心留存 |

## 后续工作

1. 对照监管对「数据出境 / 留存」的要求划分边界。
2. 与现有 KYC / 交易链路做 PoC。

\`\`\`text
# 自检标记（脚本生成）
feishu-docx-full-selftest OK ${new Date().toISOString()}
\`\`\`

> 若正文为空仅有标题，请查 journalctl 中 \`feishu-docx-export\` 与根块重试逻辑。
`;

async function main() {
  if ((process.env.FEISHU_CLOUD_DOC_EXPORT || "").trim() !== "1") {
    process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
  }

  const res = await maybeAppendFeishuResearchDocUrl({
    userTask: SAMPLE_USER_TASK,
    replyBody: SAMPLE_REPLY,
    exportKind: "research",
    logger: console,
  });

  if (res.exportSkipped) {
    console.error("export skipped:", res);
    process.exit(2);
  }

  const urlMatch = String(res.replyBody || "").match(
    /https?:\/\/[^\s]+\/docx\/[A-Za-z0-9]+/
  );
  const docUrl = res.docUrl || (urlMatch && urlMatch[0]) || "";
  console.log("");
  console.log("ok full export");
  console.log("doc_url:", docUrl || "(see replyBody below)");
  console.log("");
  console.log("--- reply preview (first 800 chars) ---");
  console.log(String(res.replyBody || "").slice(0, 800));
  if (!docUrl) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
