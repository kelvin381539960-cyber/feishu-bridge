"use strict";

function selectRunner(input) {
  const i = input || {};
  const prompt = i.prompt || {};
  const classification = i.classification || {};
  const runtimeConfig = i.runtimeConfig || {};

  const runnerType = "openclaw";
  let agentProfile = prompt.profile || "full";
  let permissionMode = prompt.permissionMode;
  let cleanCwd = !!prompt.cleanCwd;
  let degradeReason = "";

  if (classification.taskSubtype === "interactive_card") {
    agentProfile = "fast";
    permissionMode = "deny";
    cleanCwd = true;
  }

  if (classification.requiresTooling || classification.requiresFullRunner) {
    agentProfile = "full";
  }

  if (classification.needsClarification && agentProfile === "fast") {
    agentProfile = "full";
    degradeReason = "clarification_requires_full";
  }

  return {
    runnerType,
    backendMode: runnerType,
    agentProfile,
    permissionMode,
    cleanCwd,
    degradeReason,
  };
}

module.exports = {
  selectRunner,
};
