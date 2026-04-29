#!/usr/bin/env node
/**
 * 读取飞书 Spreadsheet 的本地命令行工具。
 *
 * 用法：
 *   node scripts/feishu-sheet-read.js <spreadsheet_id 或 sheets 完整 URL>
 */
const path = require("path");
const { readFeishuSpreadsheet } = require(path.join(
  __dirname,
  "..",
  "lib",
  "feishu-online-doc.js"
));

function extractSpreadsheetToken(arg) {
  const s = String(arg || "").trim();
  if (!s) return "";
  const m = s.match(/\/sheets?\/([A-Za-z0-9_-]+)/) || s.match(/\/spreadsheet\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return s;
}

async function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error("用法: node scripts/feishu-sheet-read.js <spreadsheet_id 或 sheets 完整 URL>");
    process.exit(2);
  }
  const spreadsheetToken = extractSpreadsheetToken(raw);
  const out = await readFeishuSpreadsheet(spreadsheetToken);
  if (!out.ok) {
    console.error(
      "[feishu-sheet-read] 失败",
      JSON.stringify(
        {
          spreadsheetToken,
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
  process.stdout.write(out.content || "");
  if (out.content && !out.content.endsWith("\n")) process.stdout.write("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
