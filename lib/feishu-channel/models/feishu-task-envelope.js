"use strict";

function safeTrim(v) {
  return String(v == null ? "" : v).trim();
}

function normalizeReplyTarget(extracted, data) {
  const message = (data && data.message) || {};
  return {
    channel: "feishu",
    chatId: safeTrim(extracted && extracted.chatId),
    messageId: safeTrim(extracted && extracted.messageId),
    parentId: safeTrim(message.parent_id),
    messageType: safeTrim(extracted && extracted.messageType),
  };
}

function buildFeishuTaskEnvelope(input) {
  const i = input || {};
  const extracted = i.extracted || {};
  const data = i.data || {};
  const message = data.message || {};
  const routing = i.routing || {};
  const classification = i.classification || null;
  const safety = i.safety || null;
  const runner = i.runner || null;

  return {
    source: "feishu",
    sourceMessageId: safeTrim(extracted.messageId || message.message_id),
    sourceChatId: safeTrim(extracted.chatId || message.chat_id),
    sourceThreadKey: safeTrim(message.parent_id || extracted.chatId || message.chat_id),
    messageType: safeTrim(extracted.messageType || message.message_type),
    rawMessage: message || null,
    sender: data.sender || null,
    media: extracted.media || null,
    mentions: Array.isArray(message.mentions) ? message.mentions.slice() : [],
    text: typeof extracted.text === "string" ? extracted.text : "",
    task: typeof i.task === "string" ? i.task : "",
    userTask: typeof i.userTask === "string" ? i.userTask : "",
    normalizedTask: typeof i.normalizedTask === "string" ? i.normalizedTask : "",
    replyTarget: normalizeReplyTarget(extracted, data),
    classification,
    safety,
    runner,
    channelConstraints: {
      runtimeMode: safeTrim(i.runtimeMode || "legacy-bridge"),
      groupRequireAtBot: !!i.groupRequireAtBot,
      routingMode: routing && routing.direct ? "direct" : "prefix",
      routingPrefix: safeTrim(routing && routing.prefix),
      fullTaskPrefixes: Array.isArray(i.fullTaskPrefixes) ? i.fullTaskPrefixes.slice() : [],
    },
    timestamps: {
      receivedAtMs:
        typeof i.receivedAtMs === "number" && Number.isFinite(i.receivedAtMs)
          ? i.receivedAtMs
          : Date.now(),
      messageCreateTimeMs:
        typeof extracted.messageCreateTimeMs === "number" &&
        Number.isFinite(extracted.messageCreateTimeMs)
          ? extracted.messageCreateTimeMs
          : undefined,
    },
  };
}

module.exports = {
  buildFeishuTaskEnvelope,
};
