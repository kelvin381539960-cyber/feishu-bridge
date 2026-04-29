/**
 * 租户 token + 发文本消息（飞书 Cursor 专线 WS/HTTP 进程共用 env：FEISHU_APP_ID / SECRET）。
 */
const fs = require("fs");
const axios = require("axios");
const {
  buildZhCnPostContentFromText,
  buildZhCnPostRichFromText,
} = require("./feishu-im-post");
const { buildInteractiveCardPayload } = require("./feishu-im-card");

function resolveAppSecret() {
  let s = (process.env.FEISHU_APP_SECRET || "").trim();
  if (s) return s;
  const path =
    (process.env.FEISHU_APP_SECRET_FILE || "").trim() ||
    "/etc/feishu-ws-cursor-bot.secret";
  try {
    if (path && fs.existsSync(path)) {
      s = fs.readFileSync(path, "utf8").trim();
    }
  } catch (e) {
    console.error("[feishu-tenant] read secret file failed", path, e.message);
  }
  return s;
}

function getFeishuApiBase() {
  const explicit = (process.env.FEISHU_API_BASE || "").trim();
  if (explicit) return explicit;
  const d = (process.env.FEISHU_LARK_DOMAIN || "feishu").trim().toLowerCase();
  if (d === "lark") return "https://open.larksuite.com/open-apis";
  return "https://open.feishu.cn/open-apis";
}

let tenantTokenCache = { token: null, expireAt: 0 };
let botSelfOpenIdCache = { id: null, failed: false };

async function getTenantAccessToken() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = resolveAppSecret();
  if (!appId || !appSecret) return null;
  const now = Date.now() / 1000;
  if (tenantTokenCache.token && tenantTokenCache.expireAt > now + 120) {
    return tenantTokenCache.token;
  }
  const base = getFeishuApiBase();
  const r = await axios.post(
    `${base}/auth/v3/tenant_access_token/internal`,
    { app_id: appId, app_secret: appSecret },
    { timeout: 15000, validateStatus: () => true }
  );
  if (r.status >= 400 || !r.data || r.data.code !== 0) {
    console.error(
      "[feishu-tenant] tenant_access_token failed",
      r.status,
      r.data && r.data.code,
      r.data && r.data.msg
    );
    return null;
  }
  const exp = Number(r.data.expire) || 7200;
  tenantTokenCache = {
    token: r.data.tenant_access_token,
    expireAt: now + exp,
  };
  return tenantTokenCache.token;
}

/**
 * 当前应用机器人的 open_id（与事件里 message.mentions[].id.open_id 同域可比）。
 * 失败时缓存 failed，避免每次群消息都打 API。
 */
async function getBotSelfOpenId() {
  if (botSelfOpenIdCache.id) return botSelfOpenIdCache.id;
  if (botSelfOpenIdCache.failed) return null;
  const tok = await getTenantAccessToken();
  if (!tok) {
    botSelfOpenIdCache.failed = true;
    return null;
  }
  const r = await axios.get(`${getFeishuApiBase()}/bot/v3/info`, {
    headers: { Authorization: `Bearer ${tok}` },
    timeout: 15000,
    validateStatus: () => true,
  });
  const oid = r.data && r.data.bot && r.data.bot.open_id;
  if (r.data && r.data.code === 0 && oid) {
    botSelfOpenIdCache.id = String(oid);
    return botSelfOpenIdCache.id;
  }
  console.error(
    "[feishu-tenant] bot/v3/info failed",
    r.status,
    r.data && r.data.code,
    r.data && r.data.msg
  );
  botSelfOpenIdCache.failed = true;
  return null;
}

function replyMessageFormat() {
  const s = (process.env.FEISHU_REPLY_MESSAGE_FORMAT || "interactive")
    .trim()
    .toLowerCase();
  if (s === "post" || s === "text" || s === "interactive") return s;
  return "interactive";
}

/**
 * 发送飞书交互卡片（消息卡片 JSON）。
 * @param {string} chatId
 * @param {object} cardRoot buildInteractiveCardPayload 返回的 card 对象
 * @returns {Promise<boolean>} 是否发送成功（code===0）
 */
async function sendFeishuInteractiveCardToChat(chatId, cardRoot) {
  const tok = await getTenantAccessToken();
  if (!tok) {
    console.error("[feishu-tenant] no token, skip interactive send");
    return false;
  }
  // 防御：交互卡片不应带 title/header 条；旧进程或误合并若带上，飞书会渲染蓝色标题栏。
  let card = cardRoot;
  if (card && typeof card === "object" && card.header != null) {
    card = { ...card };
    delete card.header;
  }
  let contentStr;
  try {
    contentStr = JSON.stringify(card);
  } catch (e) {
    console.error("[feishu-tenant] interactive stringify failed", e && e.message);
    return false;
  }
  const payload = {
    receive_id: chatId,
    msg_type: "interactive",
    content: contentStr,
  };
  const send = await axios.post(
    `${getFeishuApiBase()}/im/v1/messages`,
    payload,
    {
      params: { receive_id_type: "chat_id" },
      headers: {
        Authorization: `Bearer ${tok}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      timeout: 25000,
      validateStatus: () => true,
    }
  );
  if (send.status >= 400 || !send.data || send.data.code !== 0) {
    console.error(
      "[feishu-tenant] im/v1/messages interactive failed",
      send.status,
      send.data && send.data.code,
      send.data && send.data.msg
    );
    return false;
  }
  return true;
}

async function sendFeishuTextToChat(chatId, text) {
  const tok = await getTenantAccessToken();
  if (!tok) {
    console.error("[feishu-tenant] no token, skip send");
    return;
  }
  const payload = {
    receive_id: chatId,
    msg_type: "text",
    content: JSON.stringify({
      text: String(text).slice(0, 60000),
    }),
  };
  const send = await axios.post(
    `${getFeishuApiBase()}/im/v1/messages`,
    payload,
    {
      params: { receive_id_type: "chat_id" },
      headers: {
        Authorization: `Bearer ${tok}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      timeout: 20000,
      validateStatus: () => true,
    }
  );
  if (send.status >= 400 || !send.data || send.data.code !== 0) {
    console.error(
      "[feishu-tenant] im/v1/messages failed",
      send.status,
      send.data && send.data.code,
      send.data && send.data.msg
    );
  }
}

/**
 * 在用户原消息上添加表情回复（不出现在聊天记录为新气泡）。emoji_type 见飞书「表情文案说明」。
 * @param {string} messageId
 * @param {string} [emojiType] 默认 Typing（处理中/输入中）
 * @returns {Promise<boolean>}
 */
async function addFeishuMessageReaction(messageId, emojiType) {
  const tok = await getTenantAccessToken();
  if (!tok || !messageId) {
    console.error("[feishu-tenant] add reaction: no token or message_id");
    return false;
  }
  const et = String(emojiType || "Typing").trim();
  const r = await axios.post(
    `${getFeishuApiBase()}/im/v1/messages/${encodeURIComponent(
      String(messageId)
    )}/reactions`,
    { reaction_type: { emoji_type: et } },
    {
      headers: {
        Authorization: `Bearer ${tok}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      timeout: 15000,
      validateStatus: () => true,
    }
  );
  if (r.status >= 400 || !r.data || r.data.code !== 0) {
    console.error(
      "[feishu-tenant] im/v1/messages/.../reactions failed",
      messageId,
      r.data && r.data.code,
      r.data && r.data.msg
    );
    return false;
  }
  return true;
}

/**
 * 拉取群用户成员 open_id（分页合并）。飞书该接口不返回机器人，机器人需用 mentions 或 FEISHU_BOT_OPEN_ID_MAP。
 * @param {string} chatId
 * @param {{ maxLines?: number, maxPages?: number }} [opts]
 * @returns {Promise<{ lines: string[], error?: string }>}
 */
async function fetchChatMemberOpenIdLines(chatId, opts) {
  const maxLines = Math.min(200, Math.max(10, Number(opts && opts.maxLines) || 80));
  const maxPages = Math.min(10, Math.max(1, Number(opts && opts.maxPages) || 3));
  const lines = [];
  const tok = await getTenantAccessToken();
  if (!tok) {
    return { lines: [], error: "no_token" };
  }
  let pageToken = "";
  for (let page = 0; page < maxPages; page++) {
    const r = await axios.get(
      `${getFeishuApiBase()}/im/v1/chats/${encodeURIComponent(
        String(chatId)
      )}/members`,
      {
        headers: { Authorization: `Bearer ${tok}` },
        params: {
          page_size: 100,
          member_id_type: "open_id",
          ...(pageToken ? { page_token: pageToken } : {}),
        },
        timeout: 20000,
        validateStatus: () => true,
      }
    );
    if (r.status >= 400 || !r.data || r.data.code !== 0) {
      const msg = (r.data && r.data.msg) || String(r.status);
      return { lines, error: msg };
    }
    const data = r.data.data || {};
    const items = data.items || [];
    for (const it of items) {
      if (lines.length >= maxLines) break;
      const name = (it.name || "").trim();
      const mid = (it.member_id || "").trim();
      if (mid) {
        lines.push(`- ${name || "(无昵称)"}  ${mid}`);
      }
    }
    pageToken = data.page_token || "";
    if (!pageToken || lines.length >= maxLines) break;
  }
  return { lines };
}

function imReplyMaxChars() {
  const n = Number(process.env.FEISHU_IM_REPLY_MAX_CHARS || "120000");
  if (!Number.isFinite(n) || n < 8000) return 60000;
  return Math.min(n, 500000);
}

function detectUsageFooterLine(text) {
  const raw = String(text || "");
  const lines = raw.split(/\r?\n/);
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length) return "";
  const last = lines[lines.length - 1].trim();
  return last.split(" · ").length >= 4 ? last : "";
}

async function sendFeishuChatReply(chatId, text) {
  const body = String(text).slice(0, imReplyMaxChars());
  const fmt = replyMessageFormat();
  const footerLine = detectUsageFooterLine(body);
  console.log(
    "[feishu-usage-footer] send",
    JSON.stringify({
      chatId,
      fmt,
      hasFooter: !!footerLine,
      footerLine: footerLine || "",
    })
  );

  if (fmt === "interactive") {
    try {
      const { card } = buildInteractiveCardPayload(body);
      const ok = await sendFeishuInteractiveCardToChat(chatId, card);
      if (ok) {
        console.log(
          "[feishu-usage-footer] interactive_ok",
          JSON.stringify({ chatId, hasFooter: !!footerLine })
        );
        return;
      }
    } catch (e) {
      console.error("[feishu-tenant] interactive card build/send error", e && e.message);
    }
  }

  if (fmt === "post" || fmt === "interactive") {
    const postAt = buildZhCnPostContentFromText(body);
    const postRich = postAt || buildZhCnPostRichFromText(body);
    if (postRich) {
      const tok = await getTenantAccessToken();
      if (!tok) {
        console.error("[feishu-tenant] no token, skip send");
        return;
      }
      const payload = {
        receive_id: chatId,
        msg_type: "post",
        content: JSON.stringify(postRich),
      };
      const send = await axios.post(
        `${getFeishuApiBase()}/im/v1/messages`,
        payload,
        {
          params: { receive_id_type: "chat_id" },
          headers: {
            Authorization: `Bearer ${tok}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          timeout: 20000,
          validateStatus: () => true,
        }
      );
      if (send.status >= 400 || !send.data || send.data.code !== 0) {
        console.error(
          "[feishu-tenant] im/v1/messages post failed, fallback text",
          send.status,
          send.data && send.data.code,
          send.data && send.data.msg
        );
        return sendFeishuTextToChat(chatId, body);
      }
      console.log(
        "[feishu-usage-footer] post_ok",
        JSON.stringify({ chatId, hasFooter: !!footerLine })
      );
      return;
    }
  }

  console.log(
    "[feishu-usage-footer] text_fallback",
    JSON.stringify({ chatId, hasFooter: !!footerLine })
  );
  return sendFeishuTextToChat(chatId, body);
}

/**
 * 通过开放平台 docx v1 读取云文档纯文本（需应用具备 docx:document 或 docx:document:readonly 等权限）。
 * @param {string} documentId 文档 token，即链接中 /docx/ 后第一段（27 字符级）
 * @returns {Promise<{ ok: true, content: string } | { ok: false, status?: number, code?: number, msg?: string, error?: string }>}
 */
async function fetchDocxRawContent(documentId) {
  const tok = await getTenantAccessToken();
  if (!tok) {
    return { ok: false, error: "no_token" };
  }
  const id = String(documentId || "").trim();
  if (!id) {
    return { ok: false, error: "no_document_id" };
  }
  const r = await axios.get(
    `${getFeishuApiBase()}/docx/v1/documents/${encodeURIComponent(
      id
    )}/raw_content`,
    {
      headers: { Authorization: `Bearer ${tok}` },
      timeout: 30000,
      validateStatus: () => true,
    }
  );
  if (r.status >= 400 || !r.data || r.data.code !== 0) {
    return {
      ok: false,
      status: r.status,
      code: r.data && r.data.code,
      msg: r.data && r.data.msg,
    };
  }
  const content =
    r.data.data && r.data.data.content != null
      ? String(r.data.data.content)
      : "";
  return { ok: true, content };
}

module.exports = {
  getFeishuApiBase,
  resolveAppSecret,
  getTenantAccessToken,
  getBotSelfOpenId,
  sendFeishuTextToChat,
  sendFeishuInteractiveCardToChat,
  addFeishuMessageReaction,
  sendFeishuChatReply,
  fetchChatMemberOpenIdLines,
  fetchDocxRawContent,
};
