"use strict";

/**
 * 飞书新版文档（docx）导出：调研 / 报告类任务将 Cursor 回复同步为云文档并回群链接。
 * Markdown → 飞书块见 `feishu-docx-markdown.js`。
 * @see docs/feishu-cursor-research-doc-implementation-plan.md
 */

const axios = require("axios");
const crypto = require("node:crypto");
const {
  getTenantAccessToken,
  getFeishuApiBase,
  fetchDocxRawContent,
} = require("./feishu-tenant");
const { grantAutoAdminForFile } = require("./feishu-drive-permission");
const { markdownToFeishuDescendants } = require("./feishu-docx-markdown");
const { buildResearchImageAppendix, bindPendingImages } = require("./feishu-docx-image");
const { buildResearchChatSummary, extractFirstH1Text } = require("./feishu-research-chat-summary");

const MAX_TITLE_LEN = 800;
const DEFAULT_BODY_MAX = 120000;
const CHUNK_SIZE = 1500;
const BATCH_DESCENDANTS = 20;
const RATE_MS = 320;
const DEFAULT_MAX_BLOCKS = 600;
const DESCENDANT_BATCH_RETRIES = 3;

function debugExport(logger, label, obj) {
  if ((process.env.FEISHU_DOC_EXPORT_DEBUG || "").trim() !== "1") return;
  (logger.log || console.log).call(
    logger,
    `[feishu-docx-export][debug] ${label}`,
    obj != null ? JSON.stringify(obj) : ""
  );
}

function prependDocBlock(replyBody, docUrl, headline) {
  if (!docUrl) return replyBody;
  const h = headline || "云文档（可点开）";
  return `📄 ${h}：${docUrl}\n---\n\n${replyBody}`;
}

function exportEnabled(env) {
  const e = env || process.env;
  const a = String(e.FEISHU_CLOUD_DOC_EXPORT || "").trim();
  const b = String(e.FEISHU_RESEARCH_DOC_EXPORT || "").trim();
  return a === "1" || b === "1";
}

function plainOnlyMode() {
  return (process.env.FEISHU_DOC_EXPORT_PLAIN_ONLY || "").trim() === "1";
}

function maxExportChars() {
  const n = Number(process.env.FEISHU_DOCS_EXPORT_MAX_CHARS || String(DEFAULT_BODY_MAX));
  if (!Number.isFinite(n) || n < 2000) return DEFAULT_BODY_MAX;
  return Math.min(n, 500000);
}

function maxExportBlocks() {
  const n = Number(process.env.FEISHU_DOC_EXPORT_MAX_BLOCKS || String(DEFAULT_MAX_BLOCKS));
  if (!Number.isFinite(n) || n < 50) return DEFAULT_MAX_BLOCKS;
  return Math.min(n, 10000);
}

function exportModes(env) {
  const e = env || process.env;
  const raw = String(e.FEISHU_DOC_EXPORT_MODES || "research,report").trim();
  const parts = raw.split(/[,|]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const set = new Set(parts.length ? parts : ["research", "report"]);
  return set;
}

/**
 * @param {string} userTask
 * @param {{ isResearchLikeTask?: (t:string)=>boolean, isReportLikeTask?: (t:string)=>boolean }} detectors
 * @param {{ taskType?: string } | null} [classification] pipeline 里 classifyTask 结果；优先于纯关键词，避免「已判为 research 但未命中 isResearchLikeTask」时不导出云文档
 * @returns {'research'|'report'|null}
 */
function resolveFeishuDocExportKind(userTask, detectors, classification) {
  if (!exportEnabled()) return null;
  const d = detectors || {};
  const modes = exportModes();
  const c = classification || {};
  const wk = String(c.workflowKey || "").trim();
  const sub = String(c.taskSubtype || "").trim();
  const tt = String(c.taskType || "").trim();

  if (modes.has("research") && (wk === "research" || tt === "research")) return "research";
  if (modes.has("report") && (sub === "report_export" || tt === "report")) return "report";

  const task = String(userTask || "");
  if (modes.has("research") && typeof d.isResearchLikeTask === "function" && d.isResearchLikeTask(task)) {
    return "research";
  }
  if (modes.has("report") && typeof d.isReportLikeTask === "function" && d.isReportLikeTask(task)) {
    return "report";
  }
  return null;
}

function parseLongReplyExportMinChars(env) {
  const e = env || process.env;
  const n = Number(String(e.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS || "").trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 2_000_000);
}

/**
 * 非空时仅这些 chat_id 允许「长回复自动落云文档」；空或未设表示不限制。
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Set<string> | null}
 */
function parseLongReplyChatAllowlist(env) {
  const e = env || process.env;
  const raw = String(e.FEISHU_DOC_EXPORT_LONG_REPLY_CHAT_IDS || "").trim();
  if (!raw) return null;
  const set = new Set(raw.split(/[,|]/).map((s) => s.trim()).filter(Boolean));
  return set.size ? set : null;
}

/**
 * 当任务未命中 research/report 但回复足够长时，按 plan 复用 report 导出路径（需 FEISHU_DOC_EXPORT_MODES 含 report）。
 * @param {{ exportKind?: 'research'|'report'|null, replyBody?: string, code?: number|null, chatId?: string, env?: NodeJS.ProcessEnv }} input
 * @returns {{ exportKind: 'research'|'report'|null, longReplyForced: boolean }}
 */
function mergeLongReplyDocExportKind(input) {
  const i = input || {};
  const env = i.env || process.env;
  const cur = i.exportKind;
  if (cur === "research" || cur === "report") {
    return { exportKind: cur, longReplyForced: false };
  }

  if (!exportEnabled(env)) return { exportKind: null, longReplyForced: false };

  const min = parseLongReplyExportMinChars(env);
  if (min <= 0) return { exportKind: null, longReplyForced: false };

  const modes = exportModes(env);
  if (!modes.has("report")) return { exportKind: null, longReplyForced: false };

  const code = i.code;
  if (code != null && Number(code) !== 0) return { exportKind: null, longReplyForced: false };

  const allow = parseLongReplyChatAllowlist(env);
  const chatId = String(i.chatId || "").trim();
  if (allow && (!chatId || !allow.has(chatId))) return { exportKind: null, longReplyForced: false };

  const body = String(i.replyBody || "");
  if (body.length < min) return { exportKind: null, longReplyForced: false };

  return { exportKind: "report", longReplyForced: true };
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

/**
 * 写入完成后校验文档可被 API 读出足够正文（避免已发链接但浏览器侧「文档不存在」或空文档）。
 * 若应用无 raw_content 读权限（常见 1770032），不删文档、不拦截（避免误删已成功写入）。
 */
async function verifyDocxReadableAfterWrite(documentId, logger) {
  const lg = logger || console;
  const min = Number(process.env.FEISHU_DOC_EXPORT_VERIFY_MIN_CHARS || "60");
  const delays = [0, 500, 1500];
  /** @type {{ ok?: boolean, content?: string, msg?: string, code?: number }} */
  let lastGood = {};
  /** @type {{ ok?: boolean, content?: string, msg?: string, code?: number }} */
  let lastErr = {};
  for (const d of delays) {
    if (d > 0) await sleep(d);
    const r = await fetchDocxRawContent(documentId);
    if (!r || !r.ok) {
      lastErr = r || {};
      const c = Number(lastErr.code);
      // 无文档读权限时跳过校验，避免误删已写入的云文档
      if (c === 1770032) {
        debugExport(lg, "verify_skip_forbidden_raw_content", { documentId: String(documentId).slice(0, 12) });
        return { ok: true, skippedReason: "no_raw_content_scope" };
      }
      continue;
    }
    lastGood = r;
    const len = String(r.content || "").replace(/\s+/g, " ").trim().length;
    if (len >= min) {
      return { ok: true };
    }
  }
  const len = String((lastGood && lastGood.content) || "").replace(/\s+/g, " ").trim().length;
  if (!lastGood || !lastGood.ok) {
    return {
      ok: false,
      hint: `raw_content 读取失败 code=${lastErr.code != null ? lastErr.code : "?"} msg=${String(
        lastErr.msg || lastErr.error || "unknown"
      ).slice(0, 200)}`,
    };
  }
  return {
    ok: false,
    hint: `正文过短(${len} 字)，未达 FEISHU_DOC_EXPORT_VERIFY_MIN_CHARS=${min}`,
  };
}

function buildTitle(userTask, exportKind) {
  const envP = (process.env.FEISHU_DOCS_EXPORT_TITLE_PREFIX || "").trim();
  const prefix =
    envP ||
    (exportKind === "report" ? "[报告]" : "[调研]");
  const first =
    String(userTask || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean) || "export";
  const combined = `${prefix} ${first}`.trim();
  if (combined.length <= MAX_TITLE_LEN) return combined;
  return `${combined.slice(0, MAX_TITLE_LEN - 3)}...`;
}

function chunkTextForBlocks(fullText, maxPerChunk) {
  const text = String(fullText || "");
  const max = maxPerChunk || CHUNK_SIZE;
  const chunks = [];
  for (let i = 0; i < text.length; i += max) {
    chunks.push(text.slice(i, i + max));
  }
  if (!chunks.length) chunks.push("");
  return chunks;
}

function randomBlockId() {
  return `b_${crypto.randomBytes(10).toString("hex")}`;
}

function textBlock(content) {
  return {
    block_id: randomBlockId(),
    block_type: 2,
    text: {
      elements: [{ text_run: { content: content } }],
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 云文档全部写入成功后，飞书聊天是否只发「概要 + 链接」（默认开启） */
function chatSummaryOnly() {
  const v = (process.env.FEISHU_DOC_EXPORT_CHAT_SUMMARY_ONLY || "1").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * 写入失败时尽力删除云文档，避免用户打开空文档或半成品。
 * @param {string} fileToken docx document_id 通常可作为 drive file_token
 */
async function deleteDriveFileBestEffort(fileToken, logger) {
  const lg = logger || console;
  const tok = fileToken && String(fileToken).trim();
  if (!tok) return;
  const t = await getTenantAccessToken();
  if (!t) return;
  try {
    const r = await axios.delete(
      `${getFeishuApiBase()}/drive/v1/files/${encodeURIComponent(tok)}`,
      {
        headers: { Authorization: `Bearer ${t}` },
        timeout: 30000,
        validateStatus: () => true,
      }
    );
    if (r.status >= 400 || !r.data || r.data.code !== 0) {
      debugExport(lg, "delete_file_skipped", {
        status: r.status,
        code: r.data && r.data.code,
        msg: r.data && r.data.msg,
      });
    }
  } catch (e) {
    debugExport(lg, "delete_file_err", { err: String((e && e.message) || e) });
  }
}

function resolveExportDocumentTitle(exportText, userTask, exportKind) {
  const h1 = extractFirstH1Text(String(exportText || ""));
  if (h1) return h1.slice(0, MAX_TITLE_LEN);
  return buildTitle(userTask || "", exportKind);
}

async function createDescendantsWithRetries(documentId, parentBlockId, batch, logger) {
  const lg = logger || console;
  /** @type {{ ok?: boolean } & Record<string, unknown>} */
  let last = { ok: false };
  for (let a = 0; a < DESCENDANT_BATCH_RETRIES; a += 1) {
    if (a > 0) await sleep(400 * a);
    last = await createDescendants(documentId, parentBlockId, batch);
    if (last && last.ok) return last;
    debugExport(lg, "descendant_batch_retry", {
      attempt: a + 1,
      err: last.error || last.msg,
      code: last.code,
    });
  }
  return last;
}

async function createDocument(title) {
  const tok = await getTenantAccessToken();
  if (!tok) return { ok: false, error: "no_token" };
  const body = { title: String(title || "doc").slice(0, MAX_TITLE_LEN) };
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

async function resolveParentBlockId(documentId) {
  const tok = await getTenantAccessToken();
  if (!tok) return { ok: false, error: "no_token" };
  // 新建 docx 后立刻 list blocks，items 可能短暂为空；若把 documentId 当 parent 调 descendant 会失败，正文写不进去只剩标题。
  const backoffMs = [0, 300, 600, 1200, 2000];
  let lastErr = /** @type {{ error: string, status?: number, code?: number, msg?: string }} | null */ (null);
  for (let i = 0; i < backoffMs.length; i += 1) {
    if (backoffMs[i] > 0) await sleep(backoffMs[i]);
    const r = await axios.get(
      `${getFeishuApiBase()}/docx/v1/documents/${encodeURIComponent(
        documentId
      )}/blocks?page_size=50`,
      { headers: { Authorization: `Bearer ${tok}` }, timeout: 30000, validateStatus: () => true }
    );
    if (r.status >= 400 || !r.data || r.data.code !== 0) {
      lastErr = {
        error: "list_blocks_failed",
        status: r.status,
        code: r.data && r.data.code,
        msg: r.data && r.data.msg,
      };
      continue;
    }
    const items = (r.data.data && r.data.data.items) || [];
    const page = items.find((b) => b && Number(b.block_type) === 1);
    if (page && page.block_id) return { ok: true, parentBlockId: page.block_id };
    if (items[0] && items[0].block_id) return { ok: true, parentBlockId: items[0].block_id };
    lastErr = { error: "blocks_empty", msg: `items.length=${items.length}` };
  }
  return { ok: false, ...lastErr };
}

/**
 * 飞书 docx「创建子块」接口要求 body 含 children_id（顶层子块临时 id 列表），
 * 且每个 descendant 需带 children 数组（可为空）。仅传 descendants 会返回 99992402。
 * @see https://open.feishu.cn/document/docs/docs/document-block/create-2
 */
function normalizeDescendantBlocksForApi(descendants) {
  const list = Array.isArray(descendants) ? descendants : [];
  const normalized = [];
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const o = { ...b };
    if (!Array.isArray(o.children)) o.children = [];
    normalized.push(o);
  }
  const children_id = normalized.map((b) => b.block_id).filter(Boolean);
  if (children_id.length !== normalized.length) {
    return { ok: false, error: "descendant_missing_block_id", normalized: null, children_id: null };
  }
  return { ok: true, normalized, children_id };
}

async function createDescendants(documentId, parentBlockId, descendants) {
  const tok = await getTenantAccessToken();
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

function appendFailureFooter(replyBody, err, truncated) {
  if ((process.env.FEISHU_RESEARCH_DOC_EXPORT_APPEND_FAILURE || "").trim() !== "1") {
    return replyBody;
  }
  const msg = (err && (err.msg || err.error)) || "unknown";
  let s = `${replyBody}\n\n（云文档导出失败：${msg}）`;
  if (truncated) s += "\n（同步正文过长已截断）";
  return s;
}

function buildDescendantsFromBody(exportText) {
  if (plainOnlyMode()) {
    return chunkTextForBlocks(exportText, CHUNK_SIZE).map((chunk) => textBlock(chunk));
  }
  let blocks = markdownToFeishuDescendants(exportText);
  const cap = maxExportBlocks();
  if (blocks.length > cap) {
    const head = blocks.slice(0, cap - 1);
    head.push(
      textBlock(
        `…（以下还有 ${blocks.length - cap + 1} 个块未写入，已超出 FEISHU_DOC_EXPORT_MAX_BLOCKS=${cap}）`
      )
    );
    blocks = head;
  }
  return blocks;
}

/**
 * @param {{ userTask: string, replyBody: string, exportKind: 'research'|'report'|null, logger?: { log: Function, error: Function } }} input
 * @returns {Promise<{ replyBody: string, docUrl?: string, exportSkipped?: boolean, memoryReplyBody?: string, exportOk?: boolean }>}
 */
async function maybeAppendFeishuResearchDocUrl(input) {
  const i = input || {};
  const logger = i.logger || console;
  const replyBody = String(i.replyBody || "");
  const exportKind = i.exportKind || null;

  if (!exportEnabled()) {
    debugExport(logger, "skip_disabled", {
      FEISHU_CLOUD_DOC_EXPORT: process.env.FEISHU_CLOUD_DOC_EXPORT,
      FEISHU_RESEARCH_DOC_EXPORT: process.env.FEISHU_RESEARCH_DOC_EXPORT,
    });
    return { replyBody, exportSkipped: true };
  }
  if (!exportKind) {
    debugExport(logger, "skip_no_kind", {
      hint: "任务需命中调研/报告关键词，或检查 FEISHU_DOC_EXPORT_MODES",
      userTaskHead: String(i.userTask || "").slice(0, 120),
    });
    return { replyBody, exportSkipped: true };
  }

  debugExport(logger, "start", { exportKind, bodyChars: replyBody.length });

  const maxChars = maxExportChars();
  const truncated = replyBody.length > maxChars;
  const exportText = truncated ? replyBody.slice(0, maxChars) : replyBody;
  const title = resolveExportDocumentTitle(exportText, i.userTask, exportKind);

  try {
    const created = await createDocument(title);
    if (!created.ok) {
      logger.error("[feishu-docx-export] create failed", created);
      debugExport(logger, "create_failed", created);
      let body = appendFailureFooter(replyBody, created, truncated);
      if (
        body === replyBody &&
        (process.env.FEISHU_DOC_EXPORT_SHOW_ERRORS || "").trim() !== "0"
      ) {
        const msg = (created.msg || created.error || "unknown").slice(0, 400);
        body = `⚠️ 云文档未创建：${msg}\n（可设 FEISHU_DOC_EXPORT_DEBUG=1 打日志；开放平台检查 docx 写权限与 folder_token）\n\n---\n\n${replyBody}`;
      }
      return { replyBody: body };
    }
    const { documentId } = created;
    await grantAutoAdminForFile(documentId, "docx", logger, process.env);

    const parentRes = await resolveParentBlockId(documentId);
    if (!parentRes.ok || !parentRes.parentBlockId) {
      logger.error("[feishu-docx-export] no root block for descendants", parentRes);
      await deleteDriveFileBestEffort(documentId, logger);
      let body =
        "⚠️ 云文档未能准备写入（未解析到文档根块），已取消本次云文档，**不会发送空链或半成品**。**以下为助手完整回复。**";
      body += `\n\n---\n\n${replyBody}`;
      if (truncated) body += `\n\n（原文过长，此处已按 ${maxChars} 字截断后再尝试导出）`;
      return { replyBody: body };
    }
    const parentBlockId = parentRes.parentBlockId;

    const descendants = buildDescendantsFromBody(exportText);
    for (let off = 0; off < descendants.length; off += BATCH_DESCENDANTS) {
      const batch = descendants.slice(off, off + BATCH_DESCENDANTS);
      const wr = await createDescendantsWithRetries(documentId, parentBlockId, batch, logger);
      if (!wr.ok) {
        logger.error("[feishu-docx-export] descendant batch failed", off, wr);
        await deleteDriveFileBestEffort(documentId, logger);
        const detail = String((wr && (wr.msg || wr.error)) || "unknown").slice(0, 400);
        let body = `⚠️ 云文档正文写入失败（${detail}），已删除不完整文档，**不会发送半成品链接**。**以下为助手完整回复。**`;
        body += `\n\n---\n\n${replyBody}`;
        if (truncated) body += `\n\n（原文过长，已截断至 ${maxChars} 字后再导出）`;
        return { replyBody: body };
      }
      await sleep(RATE_MS);
    }

    if (exportKind === "research") {
      try {
        const appendix = await buildResearchImageAppendix(exportText, logger);
        const appendixBlocks = Array.isArray(appendix && appendix.blocks) ? appendix.blocks : [];
        for (let off = 0; off < appendixBlocks.length; off += BATCH_DESCENDANTS) {
          const batch = appendixBlocks.slice(off, off + BATCH_DESCENDANTS);
          const wr = await createDescendantsWithRetries(documentId, parentBlockId, batch, logger);
          if (!wr.ok) {
            logger.error("[feishu-docx-export] image appendix batch failed", off, wr);
            break;
          }
          await sleep(RATE_MS);
        }
        await bindPendingImages(documentId, appendix && appendix.pendingImages, logger);
      } catch (e) {
        logger.error("[feishu-docx-export] image appendix skipped", e && e.message);
      }
    }

    const verify = await verifyDocxReadableAfterWrite(documentId, logger);
    if (!verify.ok) {
      logger.error("[feishu-docx-export] verify_after_write failed", verify);
      await deleteDriveFileBestEffort(documentId, logger);
      let body = `⚠️ 云文档写入后校验未通过（${verify.hint}）。已删除本稿，避免误发无效链接。\n若浏览器提示「文档不存在」，请在 /etc/feishu-ws-cursor-bot.env 设置 **FEISHU_DOC_PORTAL_ORIGIN** 为企业主域名（例如 \`https://贵司.feishu.cn\`），与网页端打开云文档时的域名一致。**以下为助手完整回复。**`;
      body += `\n\n---\n\n${replyBody}`;
      if (truncated) body += `\n\n（原文过长，已截断至 ${maxChars} 字后再导出）`;
      return { replyBody: body };
    }

    if (!(process.env.FEISHU_DOC_PORTAL_ORIGIN || "").trim()) {
      debugExport(logger, "portal_origin_missing", {
        hint: "未配置 FEISHU_DOC_PORTAL_ORIGIN 时，链接多为 https://feishu.cn/docx/...，企业租户浏览器中可能无法打开；请设租户主域名。",
        documentId: String(documentId).slice(0, 12),
      });
    }

    const docUrl = buildDocxUrl(documentId);
    if (!docUrl) {
      await deleteDriveFileBestEffort(documentId, logger);
      return {
        replyBody: `⚠️ 云文档链接构建失败。\n\n---\n\n${replyBody}`,
      };
    }

    let outChat = replyBody;
    /** @type {string | undefined} */
    let memoryReplyBody;
    if (chatSummaryOnly()) {
      outChat = buildResearchChatSummary({
        fullMarkdown: exportText,
        docUrl,
        fallbackTitle: title,
      });
      memoryReplyBody = replyBody;
      if (truncated) {
        outChat += `\n\n_（云文档内正文因长度上限已截断至约 ${maxChars} 字）_`;
      }
    } else {
      outChat = prependDocBlock(replyBody, docUrl, "云文档");
      if (truncated) outChat += `\n（同步至云文档的正文已截断至 ${maxChars} 字）`;
    }
    debugExport(logger, "done", {
      docUrl: docUrl || "",
      summaryOnly: chatSummaryOnly(),
    });
    return { replyBody: outChat, docUrl, memoryReplyBody, exportOk: true };
  } catch (e) {
    logger.error("[feishu-docx-export] unexpected", e && e.message);
    return {
      replyBody: appendFailureFooter(replyBody, { error: String(e.message || e) }, truncated),
    };
  }
}

module.exports = {
  maybeAppendFeishuResearchDocUrl,
  resolveFeishuDocExportKind,
  mergeLongReplyDocExportKind,
  exportEnabled,
  buildDescendantsFromBody,
  _test: {
    buildTitle,
    chunkTextForBlocks,
    buildDocxUrl,
    portalBase,
    exportModes,
    normalizeDescendantBlocksForApi,
    verifyDocxReadableAfterWrite,
  },
};
