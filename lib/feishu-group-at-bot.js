/**
 * 群聊中仅在用户 @ 本机器人时处理；私聊（p2p）不强制 @。
 * 依赖 message.mentions[].id.open_id，或与 post 正文里 at 节点的 user_id（见 collectAtUserIdsFromMessageContent）。
 */

const { collectAtUserIdsFromMessageContent } = require("./feishu-im-parse");

function isP2PChatType(chatType) {
  const t = String(chatType || "").toLowerCase();
  return t === "p2p" || t === "p2p_chat";
}

function mentionsIncludeBotOpenId(message, botOpenId) {
  if (!message || !botOpenId) return false;
  const want = String(botOpenId).trim();
  const mentions = message.mentions;
  if (Array.isArray(mentions) && mentions.length) {
    const ok = mentions.some((m) => {
      const oid = m && m.id && m.id.open_id;
      return oid === want;
    });
    if (ok) return true;
  }
  const mt = message.message_type || "text";
  const raw = message.content;
  const fromPost = collectAtUserIdsFromMessageContent(mt, raw);
  if (fromPost.includes(want)) return true;
  return false;
}

/**
 * @returns {boolean} true = 应跳过本条（不触发 Cursor、不发 ack）
 */
function shouldSkipGroupMessageWithoutAtBot(message, botOpenId) {
  if (!message) return true;
  if (isP2PChatType(message.chat_type)) return false;
  if (!botOpenId) return true;
  return !mentionsIncludeBotOpenId(message, botOpenId);
}

module.exports = {
  isP2PChatType,
  mentionsIncludeBotOpenId,
  shouldSkipGroupMessageWithoutAtBot,
};
