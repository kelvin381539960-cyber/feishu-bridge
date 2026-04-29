#!/usr/bin/env node
/**
 * 将本地 Markdown 导出为飞书云文档（docx），每次运行新建一篇。
 *
 *   set -a && source /etc/feishu-ws-cursor-bot.env && set +a
 *   node scripts/export-md-to-feishu-docx.js [path/to/file.md] [--title "..."] [--folder <folder_token>]
 *
 * 未传 md 路径时默认：docs/aix-ai-chatbot-plan-v2.md
 *
 * 环境变量（与仓库内 docx 导出一致）：
 *   FEISHU_APP_ID / FEISHU_APP_SECRET（必需）
 *   FEISHU_DOCS_EXPORT_FOLDER_TOKEN（可选；--folder 优先）
 *   FEISHU_DOC_PORTAL_ORIGIN（可选；不设则按 FEISHU_LARK_DOMAIN 拼默认门户）
 *   FEISHU_DOC_EXPORT_PLAIN_ONLY / FEISHU_DOC_EXPORT_MAX_BLOCKS / FEISHU_DOCS_EXPORT_MAX_CHARS
 *
 * 文档归属（可选）：默认用 tenant token（机器人名下）。若配置 FEISHU_DRIVE_USER_TOKEN_STORE
 * 则优先用用户 OAuth token 创建云文档，文件会归在你个人名下。见 lib/feishu-drive-write-token.js。
 *
 * 退出码：0 成功；2 无 token；3 读 md 失败；4 创建文档失败；5 写入失败
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const axios = require("axios");
const { getFeishuApiBase } = require(path.join(__dirname, "..", "lib", "feishu-tenant"));
const { getBearerTokenForCloudWrite } = require(path.join(__dirname, "..", "lib", "feishu-drive-write-token"));
const { grantAutoAdminForFile } = require(path.join(__dirname, "..", "lib", "feishu-drive-permission"));
const docxExport = require(path.join(__dirname, "..", "lib", "feishu-docx-export"));
const { buildDescendantsFromBody } = docxExport;
const { verifyDocxReadableAfterWrite } = docxExport._test;
const { extractFirstH1Text } = require(path.join(__dirname, "..", "lib", "feishu-research-chat-summary"));

const MAX_TITLE_LEN = 800;
const BATCH_DESCENDANTS = 20;
const RATE_MS = 320;
const DESCENDANT_BATCH_RETRIES = 3;

/** @type {{ token: string, source?: string, kind?: string } | null} */
let _cloudWriteTokenCache = null;
async function getCloudWriteToken() {
  if (!_cloudWriteTokenCache) {
    _cloudWriteTokenCache = await getBearerTokenForCloudWrite();
    if (_cloudWriteTokenCache.kind === "user") {
      process.stderr.write(
        `[export-md-to-feishu-docx] 使用用户 token 写云文档 (${_cloudWriteTokenCache.source})\n`
      );
    }
  }
  return _cloudWriteTokenCache.token;
}

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  /** @type {{ mdPath: string, title: string | null, folder: string | null }} */
  const out = { mdPath: "", title: null, folder: null };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--title") {
      if (i + 1 >= argv.length) {
        console.error("用法错误: --title 需要参数");
        process.exit(1);
      }
      out.title = argv[++i];
      continue;
    }
    if (a === "--folder") {
      if (i + 1 >= argv.length) {
        console.error("用法错误: --folder 需要参数");
        process.exit(1);
      }
      out.folder = argv[++i];
      continue;
    }
    if (a === "-h" || a === "--help") {
      console.log(`用法: node scripts/export-md-to-feishu-docx.js [file.md] [--title "..."] [--folder <folder_token>]
默认 file.md: docs/aix-ai-chatbot-plan-v2.md`);
      process.exit(0);
    }
    if (a.startsWith("-")) {
      console.error("未知参数:", a);
      process.exit(1);
    }
    if (out.mdPath) {
      console.error("只能指定一个 markdown 文件路径");
      process.exit(1);
    }
    out.mdPath = a;
  }
  if (!out.mdPath) {
    out.mdPath = path.join(__dirname, "..", "docs", "aix-ai-chatbot-plan-v2.md");
  }
  return out;
}

function portalBase() {
  const explicit = (process.env.FEISHU_DOC_PORTAL_ORIGIN || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const domain = (process.env.FEISHU_LARK_DOMAIN || "feishu").trim().toLowerCase();
  if (domain === "lark") return "https://larksuite.com";
  return "https://feishu.cn";
}

function buildDocxUrl(documentId) {
  const id = String(documentId || "").trim();
  if (!id) return "";
  return `${portalBase()}/docx/${encodeURIComponent(id)}`;
}

function resolveDocumentTitle(cliTitle, markdown, mdPath) {
  const fromCli = cliTitle && String(cliTitle).trim();
  if (fromCli) return fromCli.slice(0, MAX_TITLE_LEN);
  const h1 = extractFirstH1Text(markdown);
  if (h1) return h1.slice(0, MAX_TITLE_LEN);
  const base = path.basename(mdPath, path.extname(mdPath)) || "export";
  return base.slice(0, MAX_TITLE_LEN);
}

async function createDocument(title, folderTokenOverride) {
  const tok = await getCloudWriteToken();
  if (!tok) return { ok: false, error: "no_token" };
  const body = { title: String(title || "doc").slice(0, MAX_TITLE_LEN) };
  const ft = (folderTokenOverride || process.env.FEISHU_DOCS_EXPORT_FOLDER_TOKEN || "").trim();
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
    return {
      ok: false,
      error: "create_failed",
      status: r.status,
      code: r.data && r.data.code,
      msg: r.data && r.data.msg,
    };
  }
  const doc = r.data.data && r.data.data.document;
  const documentId = doc && (doc.document_id || doc.documentId);
  if (!documentId) return { ok: false, error: "no_document_id", raw: r.data };
  return { ok: true, documentId };
}

/**
 * 创建嵌套块（descendant）时，父块 ID 的取值与「在文档根下创建子块」规则一致：
 * 官方说明：对文档根创建子块时，可将 `document_id` 作为 path 中的 block_id。
 * 部分租户下若用 page 根块的 block_id 会返回 1770001 invalid param，故优先使用 document_id。
 * @param {string} documentId
 */
async function resolveParentBlockId(documentId) {
  const id = String(documentId || "").trim();
  if (!id) return { ok: false, error: "no_document_id" };
  return { ok: true, parentBlockId: id };
}

function normalizeDescendantBlocksForApi(descendants, topLevelIds) {
  const list = Array.isArray(descendants) ? descendants : [];
  const normalized = [];
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const o = { ...b };
    // 必须确保每个块都有 children 数组（即使为空），否则 API 可能校验失败
    if (!Array.isArray(o.children)) o.children = [];
    normalized.push(o);
  }
  
  const children_id = topLevelIds || normalized.map((b) => b.block_id).filter(Boolean);
  return { ok: true, normalized, children_id };
}

async function createDescendants(documentId, parentBlockId, descendants) {
  const tok = await getCloudWriteToken();
  if (!tok) return { ok: false, error: "no_token" };
  const prep = normalizeDescendantBlocksForApi(descendants);
  if (!prep.ok) return prep;
  const url = `${getFeishuApiBase()}/docx/v1/documents/${encodeURIComponent(
    documentId
  )}/blocks/${encodeURIComponent(parentBlockId)}/descendant`;
  const r = await axios.post(
    url,
    { index: -1, children_id: prep.children_id, descendants: prep.normalized },
    {
      headers: {
        Authorization: `Bearer ${tok}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      timeout: 120000,
      validateStatus: () => true,
    }
  );
  if (r.status >= 400 || !r.data || r.data.code !== 0) {
    return {
      ok: false,
      error: "descendant_failed",
      status: r.status,
      code: r.data && r.data.code,
      msg: r.data && r.data.msg,
    };
  }
  return { ok: true };
}

async function createDescendantsWithRetries(documentId, parentBlockId, batch) {
  /** @type {{ ok?: boolean } & Record<string, unknown>} */
  let last = { ok: false };
  for (let a = 0; a < DESCENDANT_BATCH_RETRIES; a += 1) {
    if (a > 0) await sleep(400 * a);
    last = await createDescendants(documentId, parentBlockId, batch);
    if (last && last.ok) return last;
  }
  return last;
}

async function deleteDriveFileBestEffort(fileToken) {
  const tok = fileToken && String(fileToken).trim();
  if (!tok) return;
  const t = await getCloudWriteToken();
  if (!t) return;
  try {
    await axios.delete(`${getFeishuApiBase()}/drive/v1/files/${encodeURIComponent(tok)}`, {
      headers: { Authorization: `Bearer ${t}` },
      timeout: 30000,
      validateStatus: () => true,
    });
  } catch (_) {
    /* ignore */
  }
}

/**
 * 添加协作者（编辑权限）到文档
 * @param {string} documentId - 文档 ID
 * @param {string} userId - 用户 open_id
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function addDocumentCollaborator(documentId, userId) {
  const tok = await getCloudWriteToken();
  if (!tok) return { ok: false, error: "no_token" };
  if (!userId) return { ok: false, error: "no_user_id" };
  
  const url = `${getFeishuApiBase()}/drive/v1/permissions/${encodeURIComponent(documentId)}/members`;
  const body = {
    member_type: "openid",
    member_id: userId,
    perm: "edit", // 编辑权限
  };
  
  const r = await axios.post(url, body, {
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json; charset=utf-8" },
    timeout: 30000,
    validateStatus: () => true,
  });
  
  if (r.status >= 400 || !r.data || r.data.code !== 0) {
    return {
      ok: false,
      error: "add_collaborator_failed",
      status: r.status,
      code: r.data && r.data.code,
      msg: r.data && r.data.msg,
    };
  }
  return { ok: true };
}

/**
 * 设置文档公开分享权限（任何人可编辑）
 * @param {string} documentId - 文档 ID
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function setDocumentPublicEdit(documentId) {
  const tok = await getCloudWriteToken();
  if (!tok) return { ok: false, error: "no_token" };
  
  const url = `${getFeishuApiBase()}/drive/v1/permissions/${encodeURIComponent(documentId)}/public`;
  const body = {
    external_access: false, // 不对外部租户开放
    security_entity: "anyone_can_edit", // 任何人可编辑（指同租户内）
    comment_entity: "anyone", // 任何人可评论
    share_entity: "tenant", // 同租户内可访问
    link_share_entity: "tenant_read", // 链接分享：租户内可读（可降级为 edit）
  };
  
  const r = await axios.patch(url, body, {
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json; charset=utf-8" },
    timeout: 30000,
    validateStatus: () => true,
  });
  
  if (r.status >= 400 || !r.data || r.data.code !== 0) {
    // 某些租户可能不支持此设置，静默失败
    return {
      ok: false,
      error: "set_public_failed",
      status: r.status,
      code: r.data && r.data.code,
      msg: r.data && r.data.msg,
    };
  }
  return { ok: true };
}

async function main() {
  loadEnvFile("/etc/feishu-ws-cursor-bot.env");

  const { mdPath, title: cliTitle, folder } = parseArgs(process.argv);

  let markdown;
  try {
    markdown = fs.readFileSync(mdPath, "utf8");
  } catch (e) {
    console.error("无法读取 markdown:", mdPath, e && e.message);
    process.exit(3);
  }
  if (!String(markdown || "").trim()) {
    console.error("markdown 为空:", mdPath);
    process.exit(3);
  }

  if (folder) process.env.FEISHU_DOCS_EXPORT_FOLDER_TOKEN = folder;

  const tok = await getCloudWriteToken();
  if (!tok) {
    console.error("no tenant token: 检查 FEISHU_APP_ID / FEISHU_APP_SECRET（可先 source /etc/feishu-ws-cursor-bot.env）");
    process.exit(2);
  }

  const docTitle = resolveDocumentTitle(cliTitle, markdown, mdPath);
  const created = await createDocument(docTitle, folder);
  if (!created.ok) {
    console.error("创建云文档失败:", created);
    process.exit(4);
  }
  const { documentId } = created;
  await grantAutoAdminForFile(documentId, "docx", console, process.env);

  const parentRes = await resolveParentBlockId(documentId);
  if (!parentRes.ok || !parentRes.parentBlockId) {
    console.error("未解析到文档根块，无法写入正文:", parentRes);
    await deleteDriveFileBestEffort(documentId);
    process.exit(5);
  }
  const parentBlockId = parentRes.parentBlockId;

  const rawDescendants = buildDescendantsFromBody(markdown);
  
  for (let off = 0; off < rawDescendants.length; off += BATCH_DESCENDANTS) {
    const batch = rawDescendants.slice(off, off + BATCH_DESCENDANTS);
    const wr = await createDescendantsWithRetries(documentId, parentBlockId, batch);
    if (!wr.ok) {
      console.error("写入块失败 offset=", off, wr);
      await deleteDriveFileBestEffort(documentId);
      process.exit(5);
    }
    await sleep(RATE_MS);
  }

  // 默认校验阈值 60 字对小文档过严；CLI 未显式设置时放宽，避免短 md 导出误杀
  if (!(process.env.FEISHU_DOC_EXPORT_VERIFY_MIN_CHARS || "").trim()) {
    process.env.FEISHU_DOC_EXPORT_VERIFY_MIN_CHARS = "30";
  }
  const verify = await verifyDocxReadableAfterWrite(documentId, console);
  if (!verify.ok) {
    console.error("写后校验未通过:", verify.hint || verify);
    await deleteDriveFileBestEffort(documentId);
    process.exit(5);
  }

  const docUrl = buildDocxUrl(documentId);
  console.log("document_id=", documentId);
  console.log("url=", docUrl);
  if (!(process.env.FEISHU_DOC_PORTAL_ORIGIN || "").trim()) {
    console.log(
      "提示: 未设置 FEISHU_DOC_PORTAL_ORIGIN 时使用默认门户域名；若浏览器打不开，请设为企业主域（如 https://xxx.feishu.cn 或 Lark 租户域）。"
    );
  }

  // 设置文档权限（同租户内可编辑）
  const shareRes = await setDocumentPublicEdit(documentId);
  if (shareRes.ok) {
    console.log("权限: 已设置为同租户内成员可编辑");
  } else {
    // 静默失败，提示用户手动设置
    console.log("提示: 如需编辑权限，请在文档右上角「分享」中手动添加协作者");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
