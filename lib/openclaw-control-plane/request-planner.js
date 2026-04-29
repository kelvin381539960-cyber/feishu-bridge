"use strict";

const { classifyOpenclawIntent } = require("./intent-router");
const { resolveOpenclawPolicies } = require("./policy-engine");
const { planExecutionBroker } = require("./execution-broker");

function mergeClassification(classification, merge) {
  const base = classification || {};
  if (!merge || typeof merge !== "object") return base;
  const baseReasons = Array.isArray(base.reasons) ? base.reasons : [];
  const mergeReasons = Array.isArray(merge.reasons) ? merge.reasons : [];
  const reasons = mergeReasons.length ? [...baseReasons, ...mergeReasons] : baseReasons;
  const next = { ...base, ...merge };
  if (reasons.length) next.reasons = reasons;
  return next;
}

function planOpenclawExecution(input) {
  const i = input || {};
  let classification = classifyOpenclawIntent({
    userTask: i.userTask,
    messageType: i.messageType,
    isRelayLikeTask: i.isRelayLikeTask,
    isReportLikeTask: i.isReportLikeTask,
    isResearchLikeTask: i.isResearchLikeTask,
  });
  classification = mergeClassification(classification, i.classificationMerge);
  const { relayDecision, safety, prompt } = resolveOpenclawPolicies({
    task: i.task,
    userTask: i.userTask,
    message: i.message,
    botOpenId: i.botOpenId,
    routing: i.routing,
    forceFull: i.forceFull,
    messageType: i.messageType,
    classification,
    runtimeConfig: i.runtimeConfig,
    parentContextInjected: i.parentContextInjected,
    isRelayLikeTask: i.isRelayLikeTask,
    normalizeCursorTask: i.normalizeCursorTask,
    appendFeishuOpenIdMentionHint: i.appendFeishuOpenIdMentionHint,
    resolveCursorAgentProfile: i.resolveCursorAgentProfile,
  });
  const { runner, dispatch } = planExecutionBroker({
    envelope: i.envelope,
    prompt,
    classification,
    runtimeConfig: i.runtimeConfig,
  });

  return {
    classification,
    relayDecision,
    safety,
    prompt,
    runner,
    dispatch,
  };
}

module.exports = {
  planOpenclawExecution,
};
