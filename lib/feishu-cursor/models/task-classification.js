"use strict";

const FINAL_WORKFLOW_KEYS = Object.freeze([
  "prd",
  "research",
  "code",
  "solution",
  "general",
]);

const FINAL_ROLES = Object.freeze([
  "prd",
  "research",
  "code",
  "solution",
  "general",
  "fallback",
]);

const KNOWN_TASK_SUBTYPES = Object.freeze([
  "interactive_card",
  "sheet_write",
  "sheet_read",
  "resource_read",
  "workflow_audit",
  "relay",
  "report_export",
  "none",
]);

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function createTaskClassification(input) {
  const base = input || {};
  const reasons = Array.isArray(base.reasons)
    ? base.reasons.map((x) => String(x || "")).filter(Boolean)
    : [];
  const out = {
    taskType: String(base.taskType || "general"),
    confidence: clamp01(base.confidence == null ? 0.5 : base.confidence),
    requiresTooling: !!base.requiresTooling,
    requiresFullRunner: !!base.requiresFullRunner,
    needsClarification: !!base.needsClarification,
    reasons,
  };
  const stage = trimStr(base.stage);
  if (stage) out.stage = stage;
  const qa = base.qaContext;
  if (qa != null && String(qa).trim()) out.qaContext = String(qa).trim();
  const wf = trimStr(base.workflowId);
  if (wf) out.workflowId = wf;
  if (base.researchPlan != null && typeof base.researchPlan === "object") {
    out.researchPlan = base.researchPlan;
  }

  const workflowKey = trimStr(base.workflowKey);
  if (workflowKey) out.workflowKey = workflowKey;

  const role = trimStr(base.role);
  if (role) out.role = role;

  const fallbackReason = trimStr(base.fallbackReason);
  if (fallbackReason) out.fallbackReason = fallbackReason;

  const taskSubtype = trimStr(base.taskSubtype);
  if (taskSubtype) out.taskSubtype = taskSubtype;

  const solutionMode = trimStr(base.solutionMode);
  if (solutionMode && (workflowKey === "solution" || taskType === "solution")) {
    out.solutionMode = solutionMode;
  }

  return out;
}

module.exports = {
  createTaskClassification,
  FINAL_WORKFLOW_KEYS,
  FINAL_ROLES,
  KNOWN_TASK_SUBTYPES,
};
