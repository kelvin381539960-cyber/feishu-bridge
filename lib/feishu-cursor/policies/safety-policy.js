"use strict";

function evaluateSafetyPolicy(input) {
  const i = input || {};
  const classification = i.classification || {};
  const messageType = String(i.messageType || "");
  const parentContextInjected = !!i.parentContextInjected;
  const reasons = [];

  let permissionMode;
  let cleanCwd = false;
  let forceFull = false;
  let profileOverride;

  if (classification.requiresFullRunner) {
    forceFull = true;
    reasons.push("classification_requires_full_runner");
  }

  if (classification.requiresTooling) {
    forceFull = true;
    reasons.push("classification_requires_tooling");
  }

  if (parentContextInjected) {
    forceFull = true;
    reasons.push("parent_context_injected");
  }

  if (messageType === "interactive") {
    permissionMode = "deny";
    cleanCwd = true;
    profileOverride = "fast";
    reasons.push("interactive_sandboxed");
  }

  if (classification.needsClarification) {
    forceFull = true;
    reasons.push("classification_needs_clarification");
  }

  return {
    permissionMode,
    cleanCwd,
    forceFull,
    profileOverride,
    reasons,
  };
}

module.exports = {
  evaluateSafetyPolicy,
};
