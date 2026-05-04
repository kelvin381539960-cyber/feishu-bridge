"use strict";

function trimStr(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeRuntimeMode(runtimeConfig, envelope) {
  const fromEnvelope = envelope && envelope.channelConstraints && typeof envelope.channelConstraints.runtimeMode === "string"
    ? envelope.channelConstraints.runtimeMode
    : "";
  const fromConfig = runtimeConfig && typeof runtimeConfig.channelRuntimeMode === "string"
    ? runtimeConfig.channelRuntimeMode
    : "";
  const raw = trimStr(fromEnvelope || fromConfig);
  return raw === "plugin-native" ? "plugin-native" : "legacy-bridge";
}

function normalizeMessageIdentity(data, extracted) {
  const message = (data && data.message) || {};
  return {
    chatId: trimStr((extracted && extracted.chatId) || message.chat_id),
    messageId: trimStr((extracted && extracted.messageId) || message.message_id),
    parentId: trimStr(message.parent_id),
    messageType: trimStr((extracted && extracted.messageType) || message.message_type),
  };
}

function normalizeDispatch(dispatch) {
  const base = dispatch || {};
  const opts = base.opts && typeof base.opts === "object" ? base.opts : {};
  return {
    task: typeof base.task === "string" ? base.task : "",
    opts,
    route: base.route || (opts && opts.routeHint) || {},
  };
}

function createCompatAdapter(deps) {
  const d = deps || {};

  return function normalizeCompatContext(input) {
    const i = input || {};
    const identity = normalizeMessageIdentity(i.data, i.extracted);
    const envelope = typeof d.buildEnvelope === "function"
      ? d.buildEnvelope({
          data: i.data,
          extracted: i.extracted,
          routing: i.routing,
          runtimeConfig: i.runtimeConfig,
          task: i.task,
          userTask: i.userTask,
          receivedAtMs: i.receivedAtMs,
          classification: i.classification,
        })
      : null;
    const runtimeMode = normalizeRuntimeMode(i.runtimeConfig, envelope);

    return {
      data: i.data || {},
      extracted: i.extracted || {},
      routing: i.routing || {},
      runtimeConfig: i.runtimeConfig || {},
      envelope,
      runtimeMode,
      chatId: identity.chatId,
      messageId: identity.messageId,
      parentId: identity.parentId,
      messageType: identity.messageType,
      normalizeDispatch,
    };
  };
}

module.exports = {
  createCompatAdapter,
  normalizeDispatch,
  normalizeMessageIdentity,
  normalizeRuntimeMode,
};
