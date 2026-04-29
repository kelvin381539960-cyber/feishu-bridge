"use strict";

const { resolveGatewayRoute } = require("./route-policy");

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function resolveRuntimeMode(envelope) {
  const mode =
    envelope &&
    envelope.channelConstraints &&
    typeof envelope.channelConstraints.runtimeMode === "string"
      ? envelope.channelConstraints.runtimeMode.trim()
      : "";
  return mode === "plugin-native" ? "plugin-native" : "legacy-bridge";
}

/** Allow only safe URL-ish segment chars; empty input stays empty. */
function sanitizeSessionNamespace(ns) {
  const s = trimStr(ns);
  if (!s) return "";
  const safe = s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return safe || "ns";
}

function getSessionNamespace(runtimeConfig) {
  const cfg = runtimeConfig || {};
  return sanitizeSessionNamespace(cfg.openclawFeishuSessionNamespace);
}

function buildFeishuSessionRest(envelope, runtimeConfig) {
  const chatId =
    envelope &&
    envelope.replyTarget &&
    typeof envelope.replyTarget.chatId === "string" &&
    envelope.replyTarget.chatId.trim()
      ? envelope.replyTarget.chatId.trim()
      : "default";
  const mode = resolveRuntimeMode(envelope);
  const ns = getSessionNamespace(runtimeConfig);
  const prefix = mode === "plugin-native" ? "feishu-plugin" : "feishu";
  if (!ns) {
    return mode === "plugin-native" ? `feishu-plugin:${chatId}` : `feishu:${chatId}`;
  }
  return `${prefix}:${ns}:${chatId}`;
}

function buildFeishuSessionKey(envelope, route, runtimeConfig) {
  const rest = buildFeishuSessionRest(envelope, runtimeConfig);
  const agentId =
    route && typeof route.agentId === "string" && route.agentId.trim()
      ? route.agentId.trim()
      : "";
  return agentId ? `agent:${agentId}:${rest}` : rest;
}

function buildFeishuIdempotencyKey(envelope, route, runtimeConfig) {
  const messageId =
    envelope && typeof envelope.sourceMessageId === "string"
      ? envelope.sourceMessageId.trim()
      : "";
  const mode = resolveRuntimeMode(envelope);
  if (!messageId) return "";
  const agentKey =
    route && typeof route.agentId === "string" && route.agentId.trim()
      ? route.agentId.trim()
      : "main";
  const ns = getSessionNamespace(runtimeConfig);
  const basePrefix = mode === "plugin-native" ? "feishu-plugin-msg:" : "feishu-msg:";
  if (!ns) {
    return `${basePrefix}${agentKey}:${messageId}`;
  }
  return `${basePrefix}${agentKey}:${ns}:${messageId}`;
}

function buildOpenclawDispatchRequest(input) {
  const i = input || {};
  const envelope = i.envelope || {};
  const prompt = i.prompt || {};
  const runner = i.runner || {};
  /** Prefer userTask so light/heavy routing does not flip when memory is prepended to prompt.task. */
  const routeTask =
    envelope && typeof envelope.userTask === "string" && trimStr(envelope.userTask)
      ? trimStr(envelope.userTask)
      : trimStr(prompt.task);
  const route = resolveGatewayRoute({
    classification: i.classification,
    task: routeTask,
    runtimeConfig: i.runtimeConfig,
  });
  const sessionId = buildFeishuSessionKey(envelope, route, i.runtimeConfig);

  return {
    task: typeof prompt.task === "string" ? prompt.task : "",
    route,
    opts: {
      chatId:
        envelope && envelope.replyTarget && typeof envelope.replyTarget.chatId === "string"
          ? envelope.replyTarget.chatId
          : "",
      messageId: typeof envelope.sourceMessageId === "string" ? envelope.sourceMessageId : "",
      sessionId,
      agentProfile: runner.agentProfile,
      permissionMode: runner.permissionMode,
      cleanCwd: runner.cleanCwd,
      routeHint: route,
      gatewayRequest: {
        sessionKey: sessionId,
        idempotencyKey: buildFeishuIdempotencyKey(envelope, route, i.runtimeConfig),
        channelRuntimeMode: resolveRuntimeMode(envelope),
      },
    },
  };
}

module.exports = {
  buildFeishuIdempotencyKey,
  buildFeishuSessionKey,
  buildOpenclawDispatchRequest,
};
