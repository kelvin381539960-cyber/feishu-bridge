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
  const mode = normalizeRuntimeMode(runtimeConfig, envelope);
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
  const mode = normalizeRuntimeMode(runtimeConfig, envelope);
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

function normalizeMessageIdentity(data, extracted) {
  const message = (data && data.message) || {};
  return {
    chatId: trimStr((extracted && extracted.chatId) || message.chat_id),
    messageId: trimStr((extracted && extracted.messageId) || message.message_id),
    parentId: trimStr(message.parent_id),
    messageType: trimStr((extracted && extracted.messageType) || message.message_type),
  };
}

function cloneRoute(route) {
  const r = route && typeof route === "object" ? { ...route } : {};
  if (Array.isArray(r.reasonCodes)) r.reasonCodes = r.reasonCodes.slice();
  return r;
}

function cloneOpts(opts) {
  const o = opts && typeof opts === "object" ? { ...opts } : {};
  if (o.gatewayRequest && typeof o.gatewayRequest === "object") {
    o.gatewayRequest = { ...o.gatewayRequest };
  }
  if (o.routeHint && typeof o.routeHint === "object") {
    o.routeHint = cloneRoute(o.routeHint);
  }
  return o;
}

function normalizeDispatch(dispatch) {
  const base = dispatch || {};
  const opts = cloneOpts(base.opts);
  const route = cloneRoute(base.route || (opts && opts.routeHint) || {});
  return {
    task: typeof base.task === "string" ? base.task : "",
    opts,
    route,
  };
}

function withDispatchOpts(dispatch, extraOpts) {
  const normalized = normalizeDispatch(dispatch);
  const extra = cloneOpts(extraOpts);
  return {
    ...normalized,
    opts: {
      ...normalized.opts,
      ...extra,
      gatewayRequest:
        extra.gatewayRequest && typeof extra.gatewayRequest === "object"
          ? { ...(normalized.opts.gatewayRequest || {}), ...extra.gatewayRequest }
          : normalized.opts.gatewayRequest,
    },
  };
}

function withGatewayRequest(dispatch, gatewayPatch) {
  const normalized = normalizeDispatch(dispatch);
  return {
    ...normalized,
    opts: {
      ...normalized.opts,
      gatewayRequest: {
        ...((normalized.opts && normalized.opts.gatewayRequest) || {}),
        ...(gatewayPatch || {}),
      },
    },
  };
}

function withDispatchRouteReasonCodes(dispatch, reasonCodes) {
  const normalized = normalizeDispatch(dispatch);
  const existing = Array.isArray(normalized.route.reasonCodes) ? normalized.route.reasonCodes : [];
  const incoming = Array.isArray(reasonCodes) ? reasonCodes : [];
  return {
    ...normalized,
    route: {
      ...normalized.route,
      reasonCodes: Array.from(new Set([...existing, ...incoming])),
    },
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
      buildSessionKey: (route) => buildFeishuSessionKey(envelope, route, i.runtimeConfig),
      buildIdempotencyKey: (route) => buildFeishuIdempotencyKey(envelope, route, i.runtimeConfig),
    };
  };
}

module.exports = {
  buildFeishuIdempotencyKey,
  buildFeishuSessionKey,
  buildFeishuSessionRest,
  createCompatAdapter,
  normalizeDispatch,
  normalizeMessageIdentity,
  normalizeRuntimeMode,
  sanitizeSessionNamespace,
  withDispatchOpts,
  withDispatchRouteReasonCodes,
  withGatewayRequest,
};
