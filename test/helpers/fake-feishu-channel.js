"use strict";

function maybeFail(value, fallbackMessage) {
  if (!value) return null;
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  return new Error(fallbackMessage);
}

function defaultShouldSkipGroupMessageWithoutAtBot(message, botOpenId) {
  const mentions = (message && Array.isArray(message.mentions) && message.mentions) || [];
  if (!botOpenId) return true;
  return !mentions.some((mention) => {
    const id = mention && mention.id;
    return (
      (id && id.open_id === botOpenId) ||
      mention.open_id === botOpenId ||
      mention.openId === botOpenId
    );
  });
}

function createFakeFeishuChannel(options) {
  const o = options || {};
  const calls = {
    sentText: [],
    sentReply: [],
    reactions: [],
    downloads: [],
    fetchedMessages: [],
    fetchedMembers: [],
  };

  return {
    calls,
    parseInboundEvent: o.parseInboundEvent,
    shouldSkipGroupMessageWithoutAtBot:
      o.shouldSkipGroupMessageWithoutAtBot || defaultShouldSkipGroupMessageWithoutAtBot,
    sendText: async (chatId, text) => {
      calls.sentText.push({ chatId, text });
      const err = maybeFail(o.failSendText, "fake sendText failed");
      if (err) throw err;
      return { ok: true };
    },
    sendReply: async (chatId, text) => {
      calls.sentReply.push({ chatId, text });
      const err = maybeFail(o.failSendReply, "fake sendReply failed");
      if (err) throw err;
      return { ok: true };
    },
    addReaction: async (messageId, emoji) => {
      calls.reactions.push({ messageId, emoji });
      const err = maybeFail(o.failReaction, "fake addReaction failed");
      if (err) throw err;
      if (o.reactionResult === false) return false;
      return true;
    },
    getBotSelfOpenId: async () => o.botOpenId || "ou_fake_bot",
    fetchChatMemberOpenIdLines: async (chatId) => {
      calls.fetchedMembers.push({ chatId });
      return o.memberLines || "";
    },
    getAckMessage: () => o.ackMessage || "⏳",
    formatReply: o.formatReply || (() => "OK"),
    appendTiming: o.appendTiming || ((body) => body),
    downloadImage: async (payload) => {
      calls.downloads.push({ type: "image", payload });
      return o.downloadImageResult || null;
    },
    downloadResource: async (payload) => {
      calls.downloads.push({ type: "resource", payload });
      return o.downloadResourceResult || null;
    },
    fetchMessage: async (messageId) => {
      calls.fetchedMessages.push({ messageId });
      return o.fetchMessageResult || {};
    },
    cleanupFile: async (filePath) => {
      calls.downloads.push({ type: "cleanup", filePath });
      return true;
    },
  };
}

module.exports = {
  createFakeFeishuChannel,
  defaultShouldSkipGroupMessageWithoutAtBot,
};
