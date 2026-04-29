#!/usr/bin/env node
/**
 * 使用租户 token 向 Lark/Feishu 电子表格追加一行（values_append）。
 *
 * 依赖：与 feishu-ws-cursor-bot 相同的环境变量（FEISHU_APP_ID、密钥文件、FEISHU_LARK_DOMAIN 等）。
 * 应用须具备「电子表格」相关权限，例如 sheets:spreadsheet（写入）或按开放平台提示开通。
 *
 * 用法：
 *   set -a && source /etc/feishu-ws-cursor-bot.env && set +a
 *   node scripts/feishu-sheet-append-row.js <spreadsheetToken> --json '["列A","列B",...]'
 *
 * 可选：指定子表标题（默认第一个非隐藏 sheet）
 *   node scripts/feishu-sheet-append-row.js <token> --sheet "验证记录" --json '[...]'
 */

"use strict";

const axios = require("axios");
const path = require("path");

const { getTenantAccessToken, getFeishuApiBase } = require(path.join(__dirname, "..", "lib", "feishu-tenant"));

function colLetter(n) {
  let s = "";
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s || "A";
}

function parseArgs(argv) {
  const out = { token: null, sheetTitle: null, json: null };
  const rest = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sheet" && argv[i + 1]) {
      out.sheetTitle = argv[++i];
    } else if (a === "--json" && argv[i + 1]) {
      out.json = argv[++i];
    } else if (!a.startsWith("-")) {
      rest.push(a);
    }
  }
  out.token = rest[0] || null;
  return out;
}

async function main() {
  const { token, sheetTitle, json: jsonStr } = parseArgs(process.argv);
  if (!token || !jsonStr) {
    console.error(
      "用法: node scripts/feishu-sheet-append-row.js <spreadsheetToken> --json '[\"a\",\"b\"]' [--sheet 子表名]"
    );
    process.exit(2);
  }
  let values;
  try {
    values = JSON.parse(jsonStr);
  } catch (e) {
    console.error("无效 JSON:", e.message);
    process.exit(2);
  }
  if (!Array.isArray(values) || !values.length) {
    console.error("--json 须为非空 JSON 数组");
    process.exit(2);
  }
  const row = values.map((c) => (c == null ? "" : String(c)));

  const tok = await getTenantAccessToken();
  if (!tok) {
    console.error("无法获取 tenant_access_token，检查 FEISHU_APP_ID / 密钥");
    process.exit(1);
  }
  const base = getFeishuApiBase();
  const headers = { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };

  const q = await axios.get(`${base}/sheets/v3/spreadsheets/${encodeURIComponent(token)}/sheets/query`, {
    headers: { Authorization: `Bearer ${tok}` },
    timeout: 30000,
    validateStatus: () => true,
  });
  if (q.data.code !== 0) {
    console.error("sheets/query 失败:", q.data.code, q.data.msg);
    console.error(
      "若提示 scope：请在 Lark 开发者后台为该应用开通电子表格/云文档相关权限并重新授权租户。"
    );
    process.exit(1);
  }
  const sheets = (q.data.data && q.data.data.sheets) || [];
  let sheet = sheets.find((s) => s && !s.hidden) || sheets[0];
  if (sheetTitle) {
    const found = sheets.find((s) => s && (s.title || "").trim() === sheetTitle.trim());
    if (!found) {
      console.error("未找到子表:", sheetTitle, "可选:", sheets.map((s) => s.title).join(", "));
      process.exit(1);
    }
    sheet = found;
  }
  if (!sheet || !sheet.sheet_id) {
    console.error("无可用子表");
    process.exit(1);
  }

  const endCol = colLetter(row.length);
  const range = `${sheet.sheet_id}!A1:${endCol}1`;
  const url = `${base}/sheets/v2/spreadsheets/${encodeURIComponent(token)}/values_append?insertDataOption=INSERT_ROWS`;
  const body = { valueRange: { range, values: [row] } };

  const r = await axios.post(url, body, { headers, timeout: 30000, validateStatus: () => true });
  if (r.data.code !== 0) {
    console.error("values_append 失败:", r.data.code, r.data.msg, r.data);
    process.exit(1);
  }
  console.log("已追加一行:", sheet.title || sheet.sheet_id, "列数:", row.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
