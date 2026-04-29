"use strict";

/**
 * runtime/multi-agent-runtime-guards
 *
 * 多 Agent runtime 防绕过守卫；与 run-trace-recorder 配合，只信 runtime trace。
 *
 * 不允许：debug 作为任何身份（workflow/taskType/mode/alias/executionGraphKey）；
 *         一个 Agent 自称完成多个 Agent；
 *         主 Agent 伪造 reviewerRecords / agentsExecuted；
 *         Final Assembler 在缺少必要 trace 时直接拼装最终输出。
 */

const {
  assertTrace,
  getExecutedRoles,
} = require("./run-trace-recorder");

const DISALLOWED_DEBUG_KEYS = new Set([
  "debug",
  "Debug",
  "DEBUG",
  "qa",
  "QA",
  "Qa",
]);

const HANDOFF_TERMINAL_BAD = new Set(["failed", "needs_revision"]);

function fail(code, reason, extra = {}) {
  return { ok: false, code, reason, ...extra };
}

function pass(extra = {}) {
  return { ok: true, ...extra };
}

function assertNoDebugIdentity(payload = {}) {
  const fields = [
    payload.workflow,
    payload.taskType,
    payload.mode,
    payload.alias,
    payload.executionGraphKey,
  ];
  for (const v of fields) {
    if (DISALLOWED_DEBUG_KEYS.has(String(v || ""))) {
      return fail(
        "DEBUG_FORBIDDEN",
        "debug/qa is not allowed as workflow/taskType/mode/alias/executionGraphKey",
      );
    }
  }
  return pass();
}

function enforceCurrentAgentRole(currentAgentRole, declaredRole) {
  if (!currentAgentRole) {
    return fail(
      "CURRENT_AGENT_ROLE_REQUIRED",
      "sub agent call must receive currentAgentRole",
    );
  }
  if (declaredRole && declaredRole !== currentAgentRole) {
    return fail(
      "ROLE_CLAIM_MISMATCH",
      `agent ${currentAgentRole} cannot claim ${declaredRole}`,
    );
  }
  return pass({ currentAgentRole });
}

function loadRoleContext(currentAgentRole, contextStore = {}) {
  if (!currentAgentRole) {
    throw new Error("current_agent_role_required");
  }
  const roleContext = contextStore[currentAgentRole] || {};
  if (roleContext.fullContext === true) {
    throw new Error("role_context_must_not_be_full_context");
  }
  return roleContext;
}

function validateHandoffContract(record = {}) {
  const required = [
    "fromAgent",
    "toAgent",
    "inputRef",
    "outputRef",
    "handoffSummary",
    "status",
  ];
  for (const k of required) {
    if (!record[k]) return fail("HANDOFF_FIELD_MISSING", `missing ${k}`);
  }
  if (
    HANDOFF_TERMINAL_BAD.has(record.status) &&
    !(Array.isArray(record.requiredFixes) && record.requiredFixes.length)
  ) {
    return fail(
      "HANDOFF_FIXES_REQUIRED",
      "failed/needs_revision handoff requires requiredFixes",
    );
  }
  if (record.status === "skipped" && !record.skipReason) {
    return fail(
      "HANDOFF_SKIP_REASON_REQUIRED",
      "skipped handoff requires skipReason",
    );
  }
  return pass();
}

function validateReviewerRecord(record = {}) {
  if (
    !record.reviewerAgent ||
    !record.inputRef ||
    !record.reviewSummary ||
    !record.status
  ) {
    return fail(
      "REVIEWER_RECORD_INVALID",
      "reviewer record missing required fields",
    );
  }
  if (
    HANDOFF_TERMINAL_BAD.has(record.status) &&
    !(Array.isArray(record.requiredFixes) && record.requiredFixes.length)
  ) {
    return fail(
      "REVIEWER_FIXES_REQUIRED",
      "review failed/needs_revision requires requiredFixes",
    );
  }
  return pass();
}

function preAssembleGuard(trace, opts = {}) {
  assertTrace(trace);
  const mustRun = opts.mustRunAgents || trace.agentsPlanned || [];
  const executed = new Set(getExecutedRoles(trace));
  for (const role of mustRun) {
    if (executed.has(role)) continue;
    const skipped = (trace.skippedAgents || []).find((x) => x.agentRole === role);
    if (!skipped || !skipped.skipReason || !skipped.fallbackAgent) {
      return fail(
        "MUST_RUN_AGENT_NOT_COMPLETED",
        `mustRun agent not completed: ${role}`,
      );
    }
  }
  if (
    opts.requireHandoff &&
    !(trace.handoffRecords && trace.handoffRecords.length)
  ) {
    return fail("HANDOFF_RECORDS_MISSING", "handoffRecords required but empty");
  }
  if (
    opts.requireReviewer !== false &&
    opts.requireReviewer &&
    !(trace.reviewerRecords && trace.reviewerRecords.length)
  ) {
    return fail("REVIEWER_RECORDS_MISSING", "reviewerRecords required but empty");
  }
  return pass();
}

function buildRuntimeGatePayload(modelOutput = {}, runtimeRunTrace, basePayload = {}) {
  assertTrace(runtimeRunTrace);
  const debugCheck = assertNoDebugIdentity(basePayload);
  if (!debugCheck.ok) {
    return { ...basePayload, runtimeRunTrace, gateOverrideFailed: debugCheck };
  }
  const sanitizedModelOutput = { ...(modelOutput || {}) };
  delete sanitizedModelOutput.agentsExecuted;
  delete sanitizedModelOutput.reviewerRecords;
  delete sanitizedModelOutput.handoffRecords;
  delete sanitizedModelOutput.runtimeRunTrace;
  delete sanitizedModelOutput.gateResult;
  delete sanitizedModelOutput.skippedAgents;
  return { ...basePayload, modelOutput: sanitizedModelOutput, runtimeRunTrace };
}

function validateMultiAgentRuntime(payload = {}) {
  if (payload.multiAgentRequired && !payload.runtimeRunTrace) {
    return fail("RUNTIME_TRACE_REQUIRED", "multiAgentRequired requires runtimeRunTrace");
  }
  if (!payload.multiAgentRequired) {
    return pass();
  }
  try {
    assertTrace(payload.runtimeRunTrace);
  } catch (e) {
    return fail("RUNTIME_TRACE_INVALID", e.message);
  }
  const t = payload.runtimeRunTrace;
  if (!(Array.isArray(t.agentsPlanned) && t.agentsPlanned.length)) {
    return fail("AGENTS_PLANNED_MISSING", "runtimeRunTrace.agentsPlanned required");
  }
  const plannedList = t.agentsPlanned || [];
  const skippedList = t.skippedAgents || [];
  const allPlannedSkipped =
    plannedList.length > 0 &&
    plannedList.every((p) => skippedList.some((s) => s && s.agentRole === p));
  if (
    !allPlannedSkipped &&
    !(Array.isArray(t.agentsExecuted) && t.agentsExecuted.length)
  ) {
    return fail("AGENTS_EXECUTED_MISSING", "runtimeRunTrace.agentsExecuted required");
  }
  if (!(Array.isArray(t.handoffRecords) && t.handoffRecords.length)) {
    return fail("HANDOFF_RECORDS_MISSING", "runtimeRunTrace.handoffRecords required");
  }
  for (const r of t.handoffRecords) {
    const v = validateHandoffContract(r);
    if (!v.ok) return v;
  }
  for (const r of t.reviewerRecords || []) {
    const v = validateReviewerRecord(r);
    if (!v.ok) return v;
  }
  return pass();
}

const SPECIALIZED_TASK_TYPES = new Set(["prd", "research", "code", "solution"]);

/**
 * specialized workflow（prd/research/code/solution）必须有 runtimeRunTrace + decisionReason；
 * multiAgentRequired=true 时复用 validateMultiAgentRuntime；否则校验单 Agent 留痕完整。
 */
function validateSpecializedRuntime(payload = {}) {
  const classification = payload.classification || {};
  const taskType = String(classification.taskType || "");
  const role = String(classification.role || "");
  const isSpecialized =
    SPECIALIZED_TASK_TYPES.has(taskType) && role === "specialized";
  if (!isSpecialized) {
    return pass();
  }
  const trace = payload.runtimeRunTrace;
  if (!trace || typeof trace !== "object" || trace.source !== "runtime") {
    return fail(
      "SPECIALIZED_TRACE_REQUIRED",
      "specialized workflow requires runtimeRunTrace with source=runtime",
    );
  }
  if (!String(trace.decisionReason || "").trim()) {
    return fail(
      "SPECIALIZED_DECISION_REASON_REQUIRED",
      "runtimeRunTrace.decisionReason required for specialized workflows",
    );
  }
  if (payload.multiAgentRequired) {
    const v = validateMultiAgentRuntime(payload);
    if (!v.ok) return v;
    const planned = new Set(trace.agentsPlanned || []);
    const executed = new Set(getExecutedRoles(trace));
    const skippedRoles = new Set(
      (trace.skippedAgents || []).map((s) => String(s && s.agentRole || "")).filter(Boolean),
    );
    for (const p of planned) {
      if (!executed.has(p) && !skippedRoles.has(p)) {
        return fail(
          "AGENTS_PLAN_NOT_FULFILLED",
          `planned agent not executed or skipped: ${p}`,
        );
      }
    }
    return pass();
  }
  const executedSolo = getExecutedRoles(trace);
  if (!(Array.isArray(executedSolo) && executedSolo.length)) {
    return fail(
      "SOLO_TRACE_INCOMPLETE",
      "specialized solo path requires at least one agentsExecuted entry",
    );
  }
  for (const s of trace.skippedAgents || []) {
    if (!s || !String(s.skipReason || "").trim()) {
      return fail(
        "SOLO_TRACE_INCOMPLETE",
        "every skippedAgents row requires skipReason for specialized solo path",
      );
    }
  }
  return pass();
}

function codeExecuteAuthGuard(payload = {}) {
  if (payload.workflow !== "code" || payload.mode !== "execute") {
    return pass();
  }
  const auth = payload.authorization || {};
  if (auth.status !== "granted" && auth.status !== "authorized") {
    return fail(
      "CODE_EXECUTE_AUTH_REQUIRED",
      "Code execute requires explicit authorization",
    );
  }
  return pass();
}

module.exports = {
  assertNoDebugIdentity,
  enforceCurrentAgentRole,
  loadRoleContext,
  validateHandoffContract,
  validateReviewerRecord,
  preAssembleGuard,
  buildRuntimeGatePayload,
  validateMultiAgentRuntime,
  validateSpecializedRuntime,
  codeExecuteAuthGuard,
};
