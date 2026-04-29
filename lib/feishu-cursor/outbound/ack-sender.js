"use strict";

async function sendTaskAck(input) {
  const i = input || {};
  const mode = String(i.ackMode || "reaction").trim().toLowerCase();
  const stage = String(i.stage || "received").trim().toLowerCase() || "received";
  const chatId = i.chatId;
  const messageId = i.messageId;
  const sendFeishuTextToChat = i.sendFeishuTextToChat;
  const addFeishuMessageReaction = i.addFeishuMessageReaction;
  const getCursorTaskAckMessage = i.getCursorTaskAckMessage;

  if (mode === "off" || mode === "none" || mode === "0") {
    return { sent: false, mode, stage };
  }

  if (mode === "text") {
    const ack = getCursorTaskAckMessage();
    if (ack) await sendFeishuTextToChat(chatId, ack);
    return { sent: !!ack, mode: "text", stage };
  }

  const emoji = String(i.reactionEmoji || "Typing").trim() || "Typing";
  if (messageId) {
    const ok = await addFeishuMessageReaction(messageId, emoji);
    if (ok) return { sent: true, mode: "reaction", stage };
    if (!i.allowFallbackText) return { sent: false, mode: "reaction", stage };
  }

  const ack = getCursorTaskAckMessage();
  if (ack) await sendFeishuTextToChat(chatId, ack);
  return { sent: !!ack, mode: "fallback_text", stage };
}

module.exports = {
  sendTaskAck,
};
