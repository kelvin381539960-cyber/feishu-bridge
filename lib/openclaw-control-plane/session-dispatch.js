"use strict";

const { resolveGatewayRoute } = require("./route-policy");
const {
  buildFeishuIdempotencyKey,
  buildFeishuSessionKey,
  normalizeRuntimeMode,
} = require("../brain/compat/compat-adapter");

function trimStr(v) {
  return String(v == null ? "" : v).trim();
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
        channelRuntimeMode: normalizeRuntimeMode(i.runtimeConfig, envelope),
      },
    },
  };
}

module.exports = {
  buildFeishuIdempotencyKey,
  buildFeishuSessionKey,
  buildOpenclawDispatchRequest,
};
