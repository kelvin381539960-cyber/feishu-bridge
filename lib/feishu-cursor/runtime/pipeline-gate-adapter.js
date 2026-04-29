"use strict";

/**
 * pipeline-gate-adapter
 *
 * 作用：在 pipeline-v2 中、controlPlanned.classification 已由 task-classifier 产出之后，
 * 对该 classification 做**只读/兜底**结构校验。任何不符合 5 类工作流白名单的产物都会被记录
 * 并强制回落到 general，避免历史「qa / debug / P0 / P2」字面值流入下游 prompt / runner。
 *
 * 设计约束：
 *  - 不再做任何分类（**禁止二次分类**），只读取已有的 classification 字段。
 *  - 不依赖任何环境开关；硬启用，没有 bypass 入口。
 *  - 失败模式：fail-closed —— 用 general fallback 替换异常分类、记录 violation 列表、不抛错，
 *    保证用户始终能拿到回复，违规细节通过 telemetry 暴露给运维。
 */

const { getFallbackWorkflow, getWorkflowByTaskType } = require("../workflows/workflow-registry");
const { createTaskClassification } = require("../models/task-classification");

const ALLOWED_WORKFLOW_KEYS = new Set(["prd", "research", "code", "solution", "general"]);
const ALLOWED_TASK_SUBTYPES = new Set([
  "none",
  "interactive_card",
  "sheet_write",
  "sheet_read",
  "resource_read",
  "workflow_audit",
  "relay",
  "report_export",
]);
const ALLOWED_ROLES = new Set(["specialized", "fallback"]);

// 治理 residue 词；任何 workflowKey/taskType/taskSubtype 命中即视为异常并兜底回 general。
const FORBIDDEN_TOKENS = ["qa", "debug", "p0", "p2"];

function lower(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}

function isForbiddenToken(value) {
  return FORBIDDEN_TOKENS.includes(lower(value));
}

function buildGeneralFallback(violations) {
  const fallback = getFallbackWorkflow();
  return createTaskClassification({
    taskType: "general",
    workflowKey: "general",
    role: "fallback",
    taskSubtype: "none",
    fallbackReason: violations.length
      ? `pipeline_gate_violation:${violations[0]}`
      : "pipeline_gate_default",
    confidence: 0.4,
    requiresTooling: false,
    requiresFullRunner: false,
    needsClarification: false,
    reasons: ["pipeline_gate_general_fallback", ...violations].slice(0, 12),
    stage: undefined,
    qaContext: "",
  });
}

/**
 * @param {object} input
 * @param {object} input.classification controlPlanned.classification（必填）
 * @returns {{
 *   ok: boolean,
 *   classification: object,            // 校验通过则原样返回；否则返回 general fallback
 *   workflowEntry: object,              // registry 注册项（含 contract/gate 路径）
 *   violations: string[],               // 违规码列表，给 telemetry 用
 *   reasonCodes: string[],              // 给 dispatch.reasonCodes 拼接的码
 * }}
 */
function applyPipelineGate(input) {
  const i = input || {};
  const classification = i.classification || {};
  const violations = [];
  const reasonCodes = [];

  const wk = lower(classification.workflowKey);
  const sub = lower(classification.taskSubtype);
  const role = lower(classification.role);
  const tt = lower(classification.taskType);

  if (!wk || !ALLOWED_WORKFLOW_KEYS.has(wk)) {
    violations.push(`workflow_key_invalid:${wk || "<missing>"}`);
  }
  if (!sub || !ALLOWED_TASK_SUBTYPES.has(sub)) {
    violations.push(`task_subtype_invalid:${sub || "<missing>"}`);
  }
  if (!role || !ALLOWED_ROLES.has(role)) {
    violations.push(`role_invalid:${role || "<missing>"}`);
  }
  if (isForbiddenToken(tt)) {
    violations.push(`forbidden_task_type:${tt}`);
  }
  if (isForbiddenToken(wk)) {
    violations.push(`forbidden_workflow_key:${wk}`);
  }
  if (isForbiddenToken(sub)) {
    violations.push(`forbidden_task_subtype:${sub}`);
  }

  // 一致性检查：specialized role 必须对应同名 workflowKey；fallback role 必须 workflowKey=general。
  if (role === "specialized" && wk === "general") {
    violations.push("role_workflow_mismatch:specialized_general");
  }
  if (role === "fallback" && wk !== "general") {
    violations.push(`role_workflow_mismatch:fallback_${wk}`);
  }

  if (violations.length > 0) {
    const fallback = buildGeneralFallback(violations);
    const entry = getFallbackWorkflow();
    reasonCodes.push("pipeline_gate_failed", ...violations.slice(0, 4).map((v) => `gate:${v}`));
    return {
      ok: false,
      classification: fallback,
      workflowEntry: entry,
      violations,
      reasonCodes,
    };
  }

  // pass：根据 workflowKey 解析 registry entry（兜底未注册的 case 返回 general entry）
  const entry = getWorkflowByTaskType(wk);
  reasonCodes.push(`pipeline_gate_passed:${wk}`, `registry_entry:${entry.taskType}`);
  return {
    ok: true,
    classification,
    workflowEntry: entry,
    violations: [],
    reasonCodes,
  };
}

module.exports = {
  applyPipelineGate,
  ALLOWED_WORKFLOW_KEYS,
  ALLOWED_TASK_SUBTYPES,
  ALLOWED_ROLES,
  FORBIDDEN_TOKENS,
};
