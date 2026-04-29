/**
 * 将飞书「接收消息」事件解析为:
 *   { text?, chatId, messageType, messageId?, media?, messageCreateTimeMs? }
 *   或 { skip, reason, ... }
 *
 * 所有消息类型都会返回 chatId + messageType + media 元数据，
 * 由调用方（feishu-ws-cursor.js）决定如何处理媒体。
 */

function messageCreateTimeMsFromMessage(msg) {
  if (!msg || msg.create_time == null || msg.create_time === "") return undefined;
  const n = Number(msg.create_time);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
}

// --- Post (rich text) extraction ---

function extractTextFromPost(parsed) {
  let title = "";
  let contentArr = null;

  if (parsed.content && Array.isArray(parsed.content)) {
    title = parsed.title || "";
    contentArr = parsed.content;
  } else {
    const locale =
      parsed.zh_cn || parsed.en_us ||
      parsed[Object.keys(parsed).find((k) => parsed[k] && parsed[k].content)];
    if (locale) {
      title = locale.title || "";
      contentArr = locale.content;
    }
  }
  if (!contentArr || !Array.isArray(contentArr)) return title || "";

  const lines = [];
  if (title) lines.push(title);
  for (const para of contentArr) {
    if (!Array.isArray(para)) continue;
    const parts = [];
    for (const node of para) {
      if (!node || !node.tag) continue;
      switch (node.tag) {
        case "text":    if (node.text) parts.push(node.text); break;
        // Bug fix: 原写法 text(href) 导致 FEISHU_URL_RE 捡到带尾括号的脏 URL；改为 text href（空格分隔）
        case "a":       if (node.text) parts.push(node.text);
                        if (node.href) parts.push(` ${node.href}`); break;
        case "at":      if (node.user_name) parts.push(`@${node.user_name}`); break;
        case "code_block": if (node.text) parts.push(`\`\`\`\n${node.text}\n\`\`\``); break;
        case "emotion": if (node.emoji_type) parts.push(`[${node.emoji_type}]`); break;
        case "img":     parts.push("[图片]"); break;
        case "media":   parts.push("[视频]"); break;
        case "hr":      parts.push("---"); break;
      }
    }
    if (parts.length) lines.push(parts.join(""));
  }
  return lines.join("\n").trim();
}

/**
 * 从 post 富文本 JSON 中收集所有 `at` 节点的 user_id（与机器人 open_id 同形，如 ou_…）。
 * 飞书部分客户端发「带 @」的群消息时 message.mentions 可能为空，但正文里仍有 at 节点。
 */
function collectAtUserIdsFromPostContent(parsed) {
  const ids = [];
  if (!parsed || typeof parsed !== "object") return ids;

  function scanLineArray(contentArr) {
    if (!Array.isArray(contentArr)) return;
    for (const para of contentArr) {
      if (!Array.isArray(para)) continue;
      for (const node of para) {
        if (node && node.tag === "at" && node.user_id) {
          ids.push(String(node.user_id).trim());
        }
      }
    }
  }

  if (parsed.content && Array.isArray(parsed.content)) {
    scanLineArray(parsed.content);
  }
  const tryLoc = (loc) => {
    if (loc && Array.isArray(loc.content)) scanLineArray(loc.content);
  };
  tryLoc(parsed.zh_cn);
  tryLoc(parsed.en_us);
  for (const k of Object.keys(parsed)) {
    if (k === "content" || k === "title") continue;
    const v = parsed[k];
    if (v && typeof v === "object" && Array.isArray(v.content)) {
      scanLineArray(v.content);
    }
  }
  return ids;
}

function collectAtUserIdsFromMessageContent(messageType, rawContent) {
  if (messageType !== "post" || rawContent == null) return [];
  try {
    const p = typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;
    return collectAtUserIdsFromPostContent(p);
  } catch (_) {
    return [];
  }
}

// --- Merge-forward extraction ---

function extractTextFromMergeForward(parsed) {
  if (!parsed) return "";
  const parts = [];
  if (parsed.title) parts.push(parsed.title);
  const msgs = parsed.messages || parsed.message_list;
  if (Array.isArray(msgs)) {
    for (const m of msgs) {
      const sender = (m.sender_name || m.sender || "").trim();
      const body = extractTextFromMessageContent(m.message_type || "text", m.content);
      if (body) parts.push(sender ? `${sender}: ${body}` : body);
    }
  }
  return parts.join("\n").trim();
}

// --- Interactive (card) extraction ---

function extractTextFromInteractive(parsed) {
  const parts = [];
  const pushPart = (v) => {
    const s = String(v || "").trim();
    if (!s) return;
    parts.push(s);
  };

  if (parsed.title) pushPart(parsed.title);
  if (parsed.header && parsed.header.title && parsed.header.title.content) {
    pushPart(parsed.header.title.content);
  }

  function walkAny(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const one of node) walkAny(one);
      return;
    }
    if (typeof node !== "object") return;

    if (node.tag === "div" && node.text && node.text.content) pushPart(node.text.content);
    else if (node.tag === "markdown" && node.content) pushPart(node.content);
    else if (node.tag === "plain_text" && node.content) pushPart(node.content);
    else if (node.tag === "text" && node.text) pushPart(node.text);
    else if (node.text && typeof node.text === "string") pushPart(node.text);
    else if (node.text && typeof node.text === "object" && node.text.content) {
      pushPart(node.text.content);
    } else if (node.content && typeof node.content === "string") {
      pushPart(node.content);
    }

    if (node.elements) walkAny(node.elements);
    if (node.fields) walkAny(node.fields);
    if (node.columns) walkAny(node.columns);
    if (node.rows) walkAny(node.rows);
  }

  walkAny(parsed.elements);
  if (parsed.body && parsed.body.elements) walkAny(parsed.body.elements);

  let out = parts.join("\n").trim();
  if (out.length > 12000) out = out.slice(0, 11980) + "\n…(已截断)";
  return out;
}

function extractTextFromMessageContent(messageType, rawContent) {
  if (!rawContent) return "";
  try {
    const p = typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;
    switch (messageType) {
      case "text":          return (p && p.text) || "";
      case "post":          return extractTextFromPost(p);
      case "merge_forward": return extractTextFromMergeForward(p);
      case "interactive":   return extractTextFromInteractive(p);
      default:              return "";
    }
  } catch (_) {
    return "";
  }
}

/**
 * GET /im/v1/messages/:message_id 返回的 items[] 中单条子消息。
 * 与 feishu-ws-cursor.js processMedia(merge_forward) 内联解析对齐，并补充未知类型的 JSON 摘要，
 * 避免「会话记录」等富文本在 extractTextFromMessageContent 首遍解析为空时丢上下文。
 */
function extractTextFromImApiItem(item) {
  if (!item || !item.body || item.body.content == null || item.body.content === "") return "";
  const mt = item.msg_type || "text";
  const raw = item.body.content;
  let t = extractTextFromMessageContent(mt, raw);
  if (t) return t;
  try {
    const c = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (mt === "text" && c && c.text) return String(c.text);
    if (mt === "post") {
      const title = c.title || (c.zh_cn && c.zh_cn.title) || (c.en_us && c.en_us.title) || "";
      const lines = [];
      if (title) lines.push(title);
      const content = c.content || (c.zh_cn && c.zh_cn.content) || (c.en_us && c.en_us.content);
      if (Array.isArray(content)) {
        for (const para of content) {
          if (!Array.isArray(para)) continue;
          lines.push(
            para.map((n) => (n && (n.text || n.unescaped_text || "")) || "").join("")
          );
        }
      }
      if (lines.length) return lines.join("\n");
    }
    if (mt === "interactive") {
      const title = c.header && c.header.title && c.header.title.content;
      if (title) return String(title);
    }
  } catch (_) {}
  if (mt === "text") return "";
  try {
    const s = typeof raw === "string" ? raw : JSON.stringify(raw);
    if (s && s.length > 10) return `[${mt}]\n${s.slice(0, 8000)}`;
  } catch (_) {}
  return "";
}

/**
 * 解析 fetchMessage（GET /im/v1/messages/:id）返回体的正文（多 item 拼成一段）。
 */
function extractTextFromFetchedMessageData(data) {
  if (!data) return "";
  let items = data.items;
  if (!items || !items.length) {
    if (data.body && data.body.content != null && data.body.content !== "") {
      items = [{ msg_type: data.msg_type || "text", body: data.body }];
    }
  }
  if (!items || !items.length) return "";
  const parts = [];
  for (const item of items) {
    const one = extractTextFromImApiItem(item);
    if (one) parts.push(one);
  }
  return parts.join("\n\n").trim();
}

// --- Media metadata extraction ---

function extractMedia(messageType, rawContent, messageId) {
  if (messageType === "merge_forward") {
    return { type: "merge_forward", messageId };
  }
  if (messageType === "sticker") {
    try {
      const p = typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;
      return { type: "sticker", emojiType: p && p.emoji_type };
    } catch (_) {
      return { type: "sticker", emojiType: "" };
    }
  }
  if (!rawContent) return null;
  try {
    const p = typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;
    switch (messageType) {
      case "image":
        return { type: "image", imageKey: p.image_key };
      case "file":
        return { type: "file", fileKey: p.file_key, fileName: p.file_name || "file", messageId };
      case "audio":
        return { type: "audio", fileKey: p.file_key, fileName: p.file_name || "audio", messageId, duration: p.duration };
      case "media":
        return { type: "video", fileKey: p.file_key, fileName: p.file_name || "video", messageId, imageKey: p.image_key, duration: p.duration };
      case "sticker":
        return { type: "sticker", emojiType: p.emoji_type };
      case "share_chat":
        return { type: "share_chat", chatId: p.chat_id, chatName: p.name };
      case "share_user":
        return { type: "share_user", userId: p.user_id };
      case "merge_forward":
        return { type: "merge_forward", messageId };
      default:
        return null;
    }
  } catch (_) {
    return null;
  }
}

// --- Core parse function ---

function parseMessageFields(msg, extra) {
  const chatId = msg.chat_id || (extra && extra.chat_id);
  if (!chatId) {
    return { skip: true, reason: "no_chat_id", messageKeys: Object.keys(msg || {}) };
  }

  const messageType = msg.message_type || "text";
  const messageId = msg.message_id || (extra && extra.message_id);
  const raw = msg.content;
  const messageCreateTimeMs = messageCreateTimeMsFromMessage(msg);

  const TEXT_TYPES = new Set(["text", "post", "interactive"]);
  const MEDIA_TYPES = new Set(["image", "file", "audio", "media", "sticker", "share_chat", "share_user", "merge_forward"]);

  const out = { chatId: String(chatId), messageType };
  if (messageId) out.messageId = String(messageId);
  if (messageCreateTimeMs != null) out.messageCreateTimeMs = messageCreateTimeMs;

  if (TEXT_TYPES.has(messageType)) {
    const text = extractTextFromMessageContent(messageType, raw);
    if (!text) return { skip: true, reason: "empty_text" };
    out.text = String(text);
    if (messageType === "interactive") {
      try {
        const p = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (p && p.card_link && typeof p.card_link.url === "string" && /mail/i.test(p.card_link.url)) {
          out.cardType = "mail";
        } else if (p && p.title && !p.header) {
          out.cardType = "share";
        }
      } catch (_) {}
    }
    return out;
  }

  if (MEDIA_TYPES.has(messageType)) {
    out.text = "";
    out.media = extractMedia(messageType, raw, messageId);
    return out;
  }

  return { skip: true, reason: "unknown_type", message_type: messageType, chatId: String(chatId) };
}

// --- Public API (unchanged signatures) ---

function parseWebhookImBody(body) {
  const header = body.header || {};
  const eventType = header.event_type || "";
  if (eventType && eventType !== "im.message.receive_v1") {
    return { skip: true, reason: "event_type", eventType };
  }
  const ev = body.event;
  if (!ev || !ev.message) return { skip: true, reason: "no_event_message" };
  const senderType = ev.sender && ev.sender.sender_type;
  if (senderType === "app" || senderType === "bot") {
    return { skip: true, reason: "from_bot" };
  }
  return parseMessageFields(ev.message, ev);
}

function parseWsImDispatchPayload(data) {
  if (!data || !data.message) return { skip: true, reason: "no_message" };
  const senderType = data.sender && data.sender.sender_type;
  if (senderType === "app" || senderType === "bot") {
    return { skip: true, reason: "from_bot" };
  }
  return parseMessageFields(data.message);
}

module.exports = {
  messageCreateTimeMsFromMessage,
  extractTextFromMessageContent,
  extractTextFromImApiItem,
  extractTextFromFetchedMessageData,
  parseWebhookImBody,
  parseWsImDispatchPayload,
  collectAtUserIdsFromPostContent,
  collectAtUserIdsFromMessageContent,
};
