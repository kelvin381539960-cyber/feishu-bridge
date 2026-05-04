"use strict";

const {
  normalizeDispatch,
  withDispatchOpts,
  withDispatchRouteReasonCodes,
  withGatewayRequest,
} = require("../compat/compat-adapter");
const defaultPlanner = require("../../openclaw-control-plane/request-planner");
const defaultIntentRouter = require("../../openclaw-control-plane/intent-router");
const { resolveOpenclawPolicies } = require("../../openclaw-control-plane/policy-engine");
const { planExecutionBroker } = require("../../openclaw-control-plane/execution-broker");

function normalizePlan(plan) {
  const p = plan || {};
  return {
    ...p,
    dispatch: normalizeDispatch(p.dispatch),
  };
}

function createPlanner(deps) {
  const d = deps || {};
  const planExecution = d.planOpenclawExecution || defaultPlanner.planOpenclawExecution;
  const classifyIntent = d.classifyOpenclawIntent || defaultIntentRouter.classifyOpenclawIntent;

  function prePlan(input) {
    return normalizePlan(planExecution({ ...(input || {}), planningPhase: "prePlan" }));
  }

  function finalPlan(input) {
    return normalizePlan(planExecution({ ...(input || {}), planningPhase: "finalPlan" }));
  }

  function rebaseFinalPlan(input) {
    const i = input || {};
    const basePlan = i.basePlan || {};
    const classification = i.classification || basePlan.classification || {};
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

    return normalizePlan({
      classification,
      relayDecision: basePlan.relayDecision || relayDecision,
      safety,
      prompt,
      runner,
      dispatch,
    });
  }

  function classify(input) {
    return classifyIntent(input || {});
  }

  return {
    prePlan,
    finalPlan,
    rebaseFinalPlan,
    classify,
    withDispatchOpts,
    withDispatchRouteReasonCodes,
    withGatewayRequest,
  };
}

module.exports = {
  createPlanner,
  normalizePlan,
};
