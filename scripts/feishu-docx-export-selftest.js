#!/usr/bin/env node
/**
 * 自检：用当前进程的 FEISHU_APP_ID/密钥 尝试创建一篇空云文档（仅标题）。
 * 用于确认 docx 创建权限与 folder_token 是否正确。
 *
 *   set -a && source /etc/feishu-ws-cursor-bot.env && set +a
 *   node scripts/feishu-docx-export-selftest.js
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

const axios = require("axios");
const { getTenantAccessToken, getFeishuApiBase } = require(path.join(
  __dirname,
  "..",
  "lib",
  "feishu-tenant"
));

async function main() {
  const tok = await getTenantAccessToken();
  if (!tok) {
    console.error("no tenant token: check FEISHU_APP_ID and secret file");
    process.exit(2);
  }
  const body = { title: `[selftest] feishu-docx-export ${new Date().toISOString()}` };
  const ft = (process.env.FEISHU_DOCS_EXPORT_FOLDER_TOKEN || "").trim();
  if (ft) body.folder_token = ft;
  const r = await axios.post(`${getFeishuApiBase()}/docx/v1/documents`, body, {
    headers: {
      Authorization: `Bearer ${tok}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    timeout: 30000,
    validateStatus: () => true,
  });
  if (r.status >= 400 || !r.data || r.data.code !== 0) {
    console.error("create failed", r.status, r.data);
    process.exit(1);
  }
  const doc = r.data.data && r.data.data.document;
  const id = doc && (doc.document_id || doc.documentId);
  const domain = (process.env.FEISHU_LARK_DOMAIN || "feishu").trim().toLowerCase();
  const origin =
    (process.env.FEISHU_DOC_PORTAL_ORIGIN || "").trim().replace(/\/$/, "") ||
    (domain === "lark" ? "https://larksuite.com" : "https://feishu.cn");
  console.log("ok document_id=", id);
  console.log("try open:", `${origin}/docx/${id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
