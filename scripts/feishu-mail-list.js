#!/usr/bin/env node
/**
 * 路径 B：使用租户 token + 指定企业邮箱列出飞书/Lark 邮件（需开放平台邮件 scope + 邮件数据权限）。
 *
 * 环境（与 feishu-ws-cursor-bot 一致）：
 *   FEISHU_APP_ID、密钥（FEISHU_APP_SECRET 或默认 secret 文件）
 *   FEISHU_LARK_DOMAIN=feishu|lark
 *
 * 必填其一：
 *   FEISHU_MAIL_USER_MAILBOX — 企业邮箱（租户身份下不可用 me）
 *   或命令行：--mailbox user@company.com
 *
 * 用法：
 *   set -a && source /etc/feishu-ws-cursor-bot.env && set +a
 *   node scripts/feishu-mail-list.js
 *   node scripts/feishu-mail-list.js --page-size 10 --folder INBOX
 *   node scripts/feishu-mail-list.js --ids-only
 *
 * 说明：列表接口只返回 message_id；默认会对每条再请求 metadata，需相应字段权限（主题/地址等）。
 */

"use strict";

const path = require("path");
const axios = require("axios");
const {
  getTenantAccessToken,
  getFeishuApiBase,
} = require(path.join(__dirname, "..", "lib", "feishu-tenant"));

function usage() {
  console.error(`Usage: feishu-mail-list.js [options]

Options:
  --mailbox ADDR     Override FEISHU_MAIL_USER_MAILBOX
  --page-size N      1..20 (default 10)
  --folder ID        e.g. INBOX
  --only-unread
  --page-token T     Pagination from previous run
  --ids-only         Only print message ids from list API (no detail calls)
  --format F         Detail format: metadata | full | plain_text_full (default metadata)
  --json             Print JSON array to stdout
  -h, --help
`);
}

function parseArgs(argv) {
  const out = {
    mailbox: (process.env.FEISHU_MAIL_USER_MAILBOX || "").trim(),
    pageSize: 10,
    folderId: null,
    onlyUnread: false,
    pageToken: null,
    idsOnly: false,
    format: "metadata",
    json: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      usage();
      process.exit(0);
    }
    if (a === "--mailbox" && argv[i + 1]) {
      out.mailbox = argv[++i].trim();
    } else if (a === "--page-size" && argv[i + 1]) {
      out.pageSize = Math.min(20, Math.max(1, parseInt(argv[++i], 10) || 10));
    } else if (a === "--folder" && argv[i + 1]) {
      out.folderId = argv[++i];
    } else if (a === "--page-token" && argv[i + 1]) {
      out.pageToken = argv[++i];
    } else if (a === "--only-unread") {
      out.onlyUnread = true;
    } else if (a === "--ids-only") {
      out.idsOnly = true;
    } else if (a === "--format" && argv[i + 1]) {
      out.format = argv[++i];
    } else if (a === "--json") {
      out.json = true;
    }
  }
  return out;
}

function decodePreview(b64) {
  if (!b64 || typeof b64 !== "string") return "";
  try {
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const s = Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8");
    return s.replace(/\s+/g, " ").trim().slice(0, 200);
  } catch (_) {
    return "";
  }
}

async function mailList(base, token, mailbox, opts) {
  const url = `${base}/mail/v1/user_mailboxes/${encodeURIComponent(mailbox)}/messages`;
  const params = { page_size: opts.pageSize };
  if (opts.pageToken) params.page_token = opts.pageToken;
  if (opts.folderId) params.folder_id = opts.folderId;
  if (opts.onlyUnread) params.only_unread = true;
  const r = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    params,
    timeout: 30000,
    validateStatus: () => true,
  });
  return r;
}

async function mailGet(base, token, mailbox, messageId, format) {
  const url = `${base}/mail/v1/user_mailboxes/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}`;
  const r = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    params: { format },
    timeout: 30000,
    validateStatus: () => true,
  });
  return r;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.mailbox) {
    console.error(
      "Missing mailbox: set FEISHU_MAIL_USER_MAILBOX or pass --mailbox user@company.com"
    );
    process.exit(2);
  }
  if (opts.mailbox.toLowerCase() === "me") {
    console.error(
      "Path B uses tenant token: user_mailbox_id cannot be 'me'. Use your corporate email."
    );
    process.exit(2);
  }

  const token = await getTenantAccessToken();
  if (!token) {
    console.error("Failed to get tenant_access_token (check FEISHU_APP_ID / secret).");
    process.exit(1);
  }
  const base = getFeishuApiBase();

  const listRes = await mailList(base, token, opts.mailbox, opts);
  const ld = listRes.data;
  if (listRes.status >= 400 || !ld || ld.code !== 0) {
    console.error(
      "mail list failed:",
      listRes.status,
      ld && ld.code,
      ld && ld.msg
    );
    process.exit(1);
  }

  const ids = Array.isArray(ld.data && ld.data.items) ? ld.data.items : [];
  const pageToken = ld.data && ld.data.page_token;
  const hasMore = ld.data && ld.data.has_more;

  if (opts.idsOnly) {
    const payload = { items: ids, page_token: pageToken, has_more: hasMore };
    if (opts.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log("message_id:");
      ids.forEach((id) => console.log(id));
      if (pageToken) console.log("page_token:", pageToken);
      if (hasMore) console.log("has_more: true");
    }
    return;
  }

  const rows = [];
  for (const mid of ids) {
    const gr = await mailGet(base, token, opts.mailbox, mid, opts.format);
    const gd = gr.data;
    if (gr.status >= 400 || !gd || gd.code !== 0) {
      rows.push({
        message_id: mid,
        error: gd && gd.msg,
        code: gd && gd.code,
      });
      continue;
    }
    const m = (gd.data && gd.data.message) || {};
    rows.push({
      message_id: mid,
      subject: m.subject || "",
      internal_date: m.internal_date || "",
      from: m.head_from
        ? `${m.head_from.name || ""} <${m.head_from.mail_address || ""}>`.trim()
        : "",
      preview: decodePreview(m.body_preview),
    });
  }

  const out = {
    mailbox: opts.mailbox,
    page_token: pageToken,
    has_more: hasMore,
    messages: rows,
  };
  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log("mailbox:", opts.mailbox);
  if (pageToken) console.log("next page_token:", pageToken);
  if (hasMore) console.log("has_more: true");
  console.log("");
  rows.forEach((r, i) => {
    console.log(`--- ${i + 1} ---`);
    if (r.error) {
      console.log("message_id:", r.message_id);
      console.log("error:", r.code, r.error);
      return;
    }
    console.log("message_id:", r.message_id);
    console.log("date:", r.internal_date);
    console.log("from:", r.from);
    console.log("subject:", r.subject);
    if (r.preview) console.log("preview:", r.preview);
  });
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
