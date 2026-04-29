"use strict";

const { parseWsImDispatchPayload } = require("../feishu-im-parse");
const {
  sendFeishuTextToChat,
  addFeishuMessageReaction,
  sendFeishuChatReply,
  getBotSelfOpenId,
  fetchChatMemberOpenIdLines,
} = require("../feishu-tenant");
const { shouldSkipGroupMessageWithoutAtBot } = require("../feishu-group-at-bot");
const { appendFeishuTimingToReplyBody } = require("../feishu-reply-timing");
const { downloadImage, downloadResource, fetchMessage, cleanupFile } = require("../feishu-media");
const { formatCursorAdhocReply, getCursorTaskAckMessage } = require("../run-reply-format");

function createFeishuChannelPluginRuntime() {
  return {
    parseInboundEvent: parseWsImDispatchPayload,
    sendText: sendFeishuTextToChat,
    addReaction: addFeishuMessageReaction,
    sendReply: sendFeishuChatReply,
    getBotSelfOpenId,
    fetchChatMemberOpenIdLines,
    shouldSkipGroupMessageWithoutAtBot,
    appendTiming: appendFeishuTimingToReplyBody,
    formatReply: formatCursorAdhocReply,
    getAckMessage: getCursorTaskAckMessage,
    downloadImage,
    downloadResource,
    fetchMessage,
    cleanupFile,
  };
}

module.exports = {
  createFeishuChannelPluginRuntime,
};
