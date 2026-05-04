"use strict";

const { normalizeDispatch } = require("../compat/compat-adapter");
const defaultPlanner = require("../../openclaw-control-plane/request-planner");
const defaultIntentRouter = require("../../openclaw-control-plane/intent-router");

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

  function classify(input) {
    return classifyIntent(input || {});
  }

  return {
    prePlan,
    finalPlan,
    classify,
  };
}

module.exports = {
  createPlanner,
  normalizePlan,
};
