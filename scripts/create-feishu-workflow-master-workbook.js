#!/usr/bin/env node
"use strict";

/**
 * 生成「AI 工作流治理」飞书在线表格：
 * - 子表 00_总表：五类 workflow + 全链路分层总览；「文件名」列用 HYPERLINK 跳到对应子表
 * - 其余子表：每个源码/配置文件一份，逐行写入便于阅读
 *
 * 依赖：与 feishu-ws-cursor-bot 相同租户凭证（source /etc/feishu-ws-cursor-bot.env）
 *
 * 文档归属：默认用 tenant_access_token（机器人「小智」）创建。若希望文件归到你个人名下，
 * 配置 `FEISHU_DRIVE_USER_TOKEN_STORE`（用户 OAuth token JSON，格式同白板 token 文件），
 * 见 `lib/feishu-drive-write-token.js` 与 deploy/env 示例说明。
 *
 * 用法：
 *   node scripts/create-feishu-workflow-master-workbook.js --csv-only docs/ai-workflow-governance-master-table.csv
 *   set -a && source /etc/feishu-ws-cursor-bot.env && set +a && node scripts/create-feishu-workflow-master-workbook.js
 */

const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");

const { getFeishuApiBase } = require(path.join(__dirname, "..", "lib", "feishu-tenant"));
const { getBearerTokenForCloudWrite } = require(path.join(__dirname, "..", "lib", "feishu-drive-write-token"));
const { MASTER_ROWS } = require("./workflow-governance-master-data");
const { sanitizeSheetTitle } = require("./workflow-governance-master-shared");

const REPO_ROOT = path.join(__dirname, "..");

function portalBase() {
  const explicit = (process.env.FEISHU_DOC_PORTAL_ORIGIN || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const domain = (process.env.FEISHU_LARK_DOMAIN || "feishu").trim().toLowerCase();
  return domain === "lark" ? "https://larksuite.com" : "https://feishu.cn";
}

function spreadsheetUrl(token) {
  return `${portalBase()}/sheets/${encodeURIComponent(token)}`;
}

function parseArgs(argv) {
  const out = { csvOnly: false, csvPath: "" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--csv-only") {
      out.csvOnly = true;
      out.csvPath = argv[i + 1] || "";
      i++;
    }
  }
  return out;
}

function mustReadFile(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`file not found: ${relPath}`);
  }
  return fs.readFileSync(abs, "utf8");
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const p = String(r.path || "").trim();
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(r);
  }
  return out;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function csvEscape(cell) {
  const s = String(cell == null ? "" : cell);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsvBom(filePath, rows) {
  const header = [
    "涉及工作流",
    "架构分层",
    "文件名",
    "路径",
    "职责",
    "备注",
    "子表名(与飞书脚本一致)",
  ];
  const lines = [header.join(",")];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const sheetTitle = sanitizeSheetTitle(r.file, i);
    lines.push(
      [
        csvEscape(r.workflows),
        csvEscape(r.layer),
        csvEscape(r.file),
        csvEscape(r.path),
        csvEscape(r.desc),
        csvEscape(r.note),
        csvEscape(sheetTitle),
      ].join(",")
    );
  }
  const body = "\ufeff" + lines.join("\n") + "\n";
  fs.writeFileSync(filePath, body, "utf8");
}

async function feishuRequest(method, url, token, data, params) {
  const res = await axios({
    method,
    url,
    data,
    params,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    timeout: 120000,
    validateStatus: () => true,
  });
  if (res.status >= 400 || !res.data || res.data.code !== 0) {
    throw new Error(
      `Feishu API failed: ${method} ${url} status=${res.status} code=${res.data && res.data.code} msg=${res.data && res.data.msg}`
    );
  }
  return res.data;
}

async function createSpreadsheet(accessToken, title) {
  const base = getFeishuApiBase();
  const data = await feishuRequest("post", `${base}/sheets/v3/spreadsheets`, accessToken, {
    title: String(title || "AI Workflow Governance"),
  });
  const s = data.data && data.data.spreadsheet;
  const token =
    (s && (s.spreadsheet_token || s.spreadsheetToken || s.token)) ||
    (data.data && (data.data.spreadsheet_token || data.data.spreadsheetToken));
  if (!token) throw new Error("create spreadsheet succeeded but token missing");
  return token;
}

async function querySheets(accessToken, spreadsheetToken) {
  const base = getFeishuApiBase();
  const data = await feishuRequest(
    "get",
    `${base}/sheets/v3/spreadsheets/${encodeURIComponent(spreadsheetToken)}/sheets/query`,
    accessToken
  );
  return (data.data && data.data.sheets) || [];
}

async function sheetsBatchUpdate(accessToken, spreadsheetToken, requests) {
  const base = getFeishuApiBase();
  await feishuRequest(
    "post",
    `${base}/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheetToken)}/sheets_batch_update`,
    accessToken,
    { requests }
  );
}

async function addSheet(accessToken, spreadsheetToken, title) {
  await sheetsBatchUpdate(accessToken, spreadsheetToken, [
    {
      addSheet: {
        properties: {
          title: String(title),
        },
      },
    },
  ]);
}

async function renameSheet(accessToken, spreadsheetToken, sheetId, title) {
  await sheetsBatchUpdate(accessToken, spreadsheetToken, [
    {
      updateSheet: {
        properties: {
          sheetId,
          title: String(title),
        },
      },
    },
  ]);
}

async function writeValues(accessToken, spreadsheetToken, range, values) {
  const base = getFeishuApiBase();
  await feishuRequest(
    "put",
    `${base}/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheetToken)}/values`,
    accessToken,
    {
      valueRange: {
        range,
        values,
      },
    }
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeFormulaString(s) {
  return String(s || "").replace(/"/g, '""');
}

async function bestEffortSetTenantEditable(accessToken, fileToken) {
  const base = getFeishuApiBase();
  try {
    await feishuRequest(
      "patch",
      `${base}/drive/v1/permissions/${encodeURIComponent(fileToken)}/public`,
      accessToken,
      {
        external_access: false,
        security_entity: "anyone_can_edit",
        comment_entity: "anyone_can_edit",
        share_entity: "same_tenant",
        link_share_entity: "tenant_editable",
      },
      { type: "sheet" }
    );
  } catch (_) {
    /* ignore */
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const rows = dedupeRows(MASTER_ROWS);

  if (args.csvOnly) {
    const outPath =
      args.csvPath && args.csvPath.trim()
        ? path.isAbsolute(args.csvPath)
          ? args.csvPath
          : path.join(REPO_ROOT, args.csvPath)
        : path.join(REPO_ROOT, "docs", "ai-workflow-governance-master-table.csv");
    writeCsvBom(outPath, rows);
    process.stdout.write(`wrote ${outPath} (${rows.length} rows)\n`);
    return;
  }

  const who = await getBearerTokenForCloudWrite();
  const accessToken = who.token;
  if (!accessToken) throw new Error("no access token; check FEISHU_APP_ID/secret or FEISHU_DRIVE_USER_TOKEN_STORE");
  process.stderr.write(
    `[create-feishu-workflow-master-workbook] auth=${who.kind || "?"} source=${who.source || "?"}\n`
  );

  const title = `AI工作流治理总表-${new Date().toISOString().slice(0, 10)}`;
  const spreadsheetToken = await createSpreadsheet(accessToken, title);
  await sleep(300);

  let sheets = await querySheets(accessToken, spreadsheetToken);
  if (!sheets.length) throw new Error("no sheets");
  const first = sheets[0];
  await renameSheet(accessToken, spreadsheetToken, first.sheet_id, "00_总表");
  await sleep(200);

  const sheetTitles = [];
  for (let i = 0; i < rows.length; i++) {
    let t = sanitizeSheetTitle(rows[i].file, i);
    while (sheetTitles.includes(t)) t = sanitizeSheetTitle(`${rows[i].file}_${i + 1}`, i);
    sheetTitles.push(t);
    await addSheet(accessToken, spreadsheetToken, t);
    await sleep(200);
  }

  sheets = await querySheets(accessToken, spreadsheetToken);
  const titleToMeta = new Map(sheets.map((s) => [s.title, { sheet_id: s.sheet_id, title: s.title }]));

  const indexMeta = titleToMeta.get("00_总表");
  if (!indexMeta) throw new Error("index sheet 00_总表 not found");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const st = sheetTitles[i];
    const meta = titleToMeta.get(st);
    if (!meta) throw new Error(`sheet not found for title=${st}`);

    let content;
    try {
      content = mustReadFile(row.path);
    } catch (e) {
      content = `<<读取失败: ${e.message}>>`;
    }
    const lines = content.split(/\r?\n/);
    const metaBlock = [
      [`文件名: ${row.file}`],
      [`路径: ${row.path}`],
      [`涉及工作流: ${row.workflows}`],
      [`分层: ${row.layer}`],
      [""],
      ["内容（逐行）:"],
    ];
    await writeValues(accessToken, spreadsheetToken, `${meta.sheet_id}!A1:A${metaBlock.length}`, metaBlock);
    await sleep(200);

    const renderedLines = lines.map((line, idx) => [`${String(idx + 1).padStart(5, "0")} | ${line}`]);
    const batches = chunk(renderedLines, 400);
    let start = metaBlock.length + 1;
    for (const b of batches) {
      const end = start + b.length - 1;
      await writeValues(accessToken, spreadsheetToken, `${meta.sheet_id}!A${start}:A${end}`, b);
      await sleep(220);
      start = end + 1;
    }
  }

  const header = [["涉及工作流", "架构分层", "文件名(可点击)", "路径", "职责", "备注", "sheet_id"]];
  const body = [];
  const formulaRows = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const st = sheetTitles[i];
    const meta = titleToMeta.get(st);
    if (!meta) throw new Error(`sheet meta missing ${st}`);
    const rowIdx = i + 2;
    const disp = escapeFormulaString(r.file);
    const formula = `=HYPERLINK("#" & G${rowIdx} & "!A1", "${disp}")`;
    body.push([r.workflows, r.layer, "", r.path, r.desc, r.note, meta.sheet_id]);
    formulaRows.push({ rowIdx, formula });
  }

  await writeValues(
    accessToken,
    spreadsheetToken,
    `${indexMeta.sheet_id}!A1:G${rows.length + 1}`,
    header.concat(body)
  );
  await sleep(300);

  for (const { rowIdx, formula } of formulaRows) {
    await writeValues(accessToken, spreadsheetToken, `${indexMeta.sheet_id}!C${rowIdx}:C${rowIdx}`, [[formula]]);
    await sleep(120);
  }

  await bestEffortSetTenantEditable(accessToken, spreadsheetToken);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        spreadsheetToken,
        url: spreadsheetUrl(spreadsheetToken),
        rowCount: rows.length,
        sheetCount: sheets.length,
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
