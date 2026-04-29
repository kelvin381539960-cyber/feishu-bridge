"use strict";

/**
 * 云文档创建后：按环境变量为协作者授予「可管理」等权限（Drive v1 permission-member）。
 * 与 `deploy/feishu-ws-cursor-bot.env.example` 中 FEISHU_DOC_ADMIN_* / FEISHU_DOC_OWNER_* 对齐。
 *
 * 未配置任何 open_id / 邮箱 / 群时，本模块为 **no-op**（不请求飞书），导出流程仍可继续。
 */

const axios = require("axios");
const { getTenantAccessToken, getFeishuApiBase } = require("./feishu-tenant");

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function splitList(raw) {
  return String(raw || "")
    .split(/[,|;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function collectAdminOpenIds(env) {
  const e = env || process.env;
  const ids = new Set();
  for (const key of [
    "FEISHU_DOC_ADMIN_OPEN_IDS",
    "FEISHU_DOC_OWNER_OPEN_IDS",
    "FEISHU_DRIVE_GRANT_OPEN_IDS",
  ]) {
    for (const id of splitList(e[key])) ids.add(id);
  }
  return Array.from(ids);
}

function collectAdminEmails(env) {
  const e = env || process.env;
  const emails = new Set();
  for (const key of ["FEISHU_DOC_ADMIN_EMAILS", "FEISHU_DOC_OWNER_EMAILS"]) {
    for (const em of splitList(e[key])) emails.add(em.toLowerCase());
  }
  return Array.from(emails);
}

function grantChatId(env) {
  return trimStr((env || process.env).FEISHU_DOC_EXPORT_GRANT_CHAT_ID);
}

function debugOn(env) {
  return trimStr((env || process.env).FEISHU_DOC_EXPORT_DEBUG) === "1";
}

/**
 * 通过邮箱解析 open_id（需应用具备 contact:user.id:readonly 等通讯录权限之一）。
 * @param {string[]} emails
 * @param {import("node:process").Env} [env]
 * @returns {Promise<string[]>}
 */
async function resolveEmailsToOpenIds(emails, env, logger) {
  const lg = logger || console;
  const list = (emails || []).filter(Boolean).slice(0, 50);
  if (!list.length) return [];
  const tok = await getTenantAccessToken();
  if (!tok) {
    (lg.warn || console.warn).call(lg, "[feishu-drive-permission] batch_get_id skipped: no token");
    return [];
  }
  const base = getFeishuApiBase();
  const r = await axios.post(
    `${base}/contact/v3/users/batch_get_id?user_id_type=open_id`,
    { emails: list, include_resigned: false },
    {
      headers: {
        Authorization: `Bearer ${tok}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      timeout: 20000,
      validateStatus: () => true,
    }
  );
  if (r.status >= 400 || !r.data || r.data.code !== 0) {
    (lg.warn || console.warn).call(lg, "[feishu-drive-permission] batch_get_id failed", {
      status: r.status,
      code: r.data && r.data.code,
      msg: r.data && r.data.msg,
    });
    return [];
  }
  const userList = (r.data.data && r.data.data.user_list) || [];
  const out = [];
  for (const u of userList) {
    const oid = trimStr(u && u.user_id);
    if (oid) out.push(oid);
  }
  return out;
}

/**
 * POST /drive/v1/permissions/:token/members?type=docx
 * @param {string} fileToken
 * @param {string} docType
 * @param {string} memberType
 * @param {string} memberId
 * @param {string} perm
 * @param {string} collaboratorType user | chat
 * @param {import("node:process").Env} [env]
 */
async function addPermissionMember(
  fileToken,
  docType,
  memberType,
  memberId,
  perm,
  collaboratorType,
  env,
  logger
) {
  const lg = logger || console;
  const tok = await getTenantAccessToken();
  if (!tok) return { ok: false, error: "no_token" };
  const base = getFeishuApiBase();
  const typeQ = encodeURIComponent(trimStr(docType) || "docx");
  const url = `${base}/drive/v1/permissions/${encodeURIComponent(
    trimStr(fileToken)
  )}/members?type=${typeQ}`;
  const body = {
    member_type: memberType,
    member_id: trimStr(memberId),
    perm,
    type: collaboratorType,
  };
  const r = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${tok}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    timeout: 20000,
    validateStatus: () => true,
  });
  if (r.status >= 400 || !r.data || r.data.code !== 0) {
    (lg.warn || console.warn).call(lg, "[feishu-drive-permission] add member failed", {
      memberType,
      status: r.status,
      code: r.data && r.data.code,
      msg: r.data && r.data.msg,
    });
    return { ok: false, code: r.data && r.data.code, msg: r.data && r.data.msg };
  }
  return { ok: true };
}

/**
 * 新建 docx 后，为配置的 open_id / 邮箱对应用户 / 群授予协作者权限。
 *
 * @param {string} documentId 云文档 token（与 docx 创建接口返回一致）
 * @param {string} fileType 查询参数 type，一般为 docx
 * @param {{ log?: Function, warn?: Function, error?: Function }} [logger]
 * @param {import("node:process").Env} [env]
 * @returns {Promise<void>}
 */
async function grantAutoAdminForFile(documentId, fileType, logger, env) {
  const lg = logger || console;
  const e = env || process.env;
  const token = trimStr(documentId);
  if (!token) return;

  const docType = trimStr(fileType) || "docx";
  const openIds = new Set(collectAdminOpenIds(e));
  const emails = collectAdminEmails(e);
  if (emails.length) {
    const fromEmail = await resolveEmailsToOpenIds(emails, e, lg);
    for (const oid of fromEmail) openIds.add(oid);
  }

  const chatId = grantChatId(e);
  if (!openIds.size && !chatId) {
    if (debugOn(e)) {
      (lg.log || console.log).call(
        lg,
        "[feishu-drive-permission] skip grant: no FEISHU_DOC_ADMIN_OPEN_IDS / FEISHU_DOC_ADMIN_EMAILS / FEISHU_DOC_EXPORT_GRANT_CHAT_ID"
      );
    }
    return;
  }

  for (const oid of openIds) {
    await addPermissionMember(token, docType, "openid", oid, "full_access", "user", e, lg);
  }
  if (chatId) {
    await addPermissionMember(token, docType, "openchat", chatId, "edit", "chat", e, lg);
  }
}

module.exports = {
  grantAutoAdminForFile,
  collectAdminOpenIds,
  collectAdminEmails,
  resolveEmailsToOpenIds,
};
