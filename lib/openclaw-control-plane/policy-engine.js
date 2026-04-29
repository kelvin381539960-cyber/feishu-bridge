"use strict";

const { buildRelayDecision } = require("../feishu-cursor/policies/relay-policy");
const { resolvePromptRequest } = require("../feishu-cursor/policies/prompt-policy");
const { evaluateSafetyPolicy } = require("../feishu-cursor/policies/safety-policy");

function resolveOpenclawPolicies(input) {
  const i = input || {};
  const classification = i.classification || {};
  const relayDecision = buildRelayDecision(
    i.userTask,
    i.message,
    i.botOpenId,
    i.isRelayLikeTask,
    i.runtimeConfig && i.runtimeConfig.relayPolicyMode
  );
  const safety = evaluateSafetyPolicy({
    classification,
    messageType: i.messageType,
    parentContextInjected: i.parentContextInjected,
  });
  const prompt = resolvePromptRequest({
    task: i.task,
    routing: i.routing,
    forceFull: i.forceFull,
    messageType: i.messageType,
    classification,
    safety,
    normalizeCursorTask: i.normalizeCursorTask,
    appendFeishuOpenIdMentionHint: i.appendFeishuOpenIdMentionHint,
    resolveCursorAgentProfile: i.resolveCursorAgentProfile,
  });
  return {
    relayDecision,
    safety,
    prompt,
  };
}

module.exports = {
  resolveOpenclawPolicies,
};
