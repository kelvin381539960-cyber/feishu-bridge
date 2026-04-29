#!/usr/bin/env node
/**
 * 使用与 WS/HTTP 机器人相同的 FEISHU_APP_ID + SECRET 读取云文档纯文本。
 * 国际版 Lark：请设 FEISHU_LARK_DOMAIN=lark 或 FEISHU_API_BASE=https://open.larksuite.com/open-apis
 *
 * 用法：
 *   node scripts/feishu-docx-read.js C2OTdD1XIoqzdPxJ74OlWKcSgXd
 *   node scripts/feishu-docx-read.js 'https://xxx.larksuite.com/docx/C2OTdD1XIoqzdPxJ74OlWKcSgXd?...'
 */
const path = require("path");
const { fetchDocxRawContent } = require(path.join(
  __dirname,
  "..",
  "lib",
  "feishu-tenant.js"
));

function extractDocId(arg) {
  const s = String(arg || "").trim();
  if (!s) return "";
  const m = s.match(/\/docx\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9]+$/.test(s) && s.length >= 20) return s;
  return s;
}

async function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error(
      "用法: node scripts/feishu-docx-read.js <document_id 或 docx 完整 URL>"
    );
    process.exit(2);
  }
  const documentId = extractDocId(raw);
  const out = await fetchDocxRawContent(documentId);
  if (!out.ok) {
    console.error(
      "[feishu-docx-read] 失败",
      JSON.stringify(
        {
          documentId,
          error: out.error,
          status: out.status,
          code: out.code,
          msg: out.msg,
        },
        null,
        2
      )
    );
    process.exit(1);
  }
  process.stdout.write(out.content);
  if (out.content && !out.content.endsWith("\n")) process.stdout.write("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
