"use strict";

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
      o.shouldSkipGroupMessageWithoutAtBot || (() => false),
    sendText: async (chatId, text) => {
      calls.sentText.push({ chatId, text });
      return { ok: true };
    },
    sendReply: async (chatId, text) => {
      calls.sentReply.push({ chatId, text });
      return { ok: true };
    },
    addReaction: async (messageId, emoji) => {
      calls.reactions.push({ messageId, emoji });
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
};
