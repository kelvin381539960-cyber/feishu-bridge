"use strict";

/**
 * runtime/run-trace-recorder
 *
 * 真实可信 runtimeRunTrace 生成与记录器；只信 runtime，不信 LLM 自称执行。
 * 任何 trace 必须 source === "runtime"，否则 assertTrace 抛错。
 */

const crypto = require("crypto");

const REQUIRED_HANDOFF_FIELDS = Object.freeze([
  "fromAgent",
  "toAgent",
  "inputRef",
  "outputRef",
  "handoffSummary",
  "status",
]);

const HANDOFF_TERMINAL_BAD_STATUS = new Set(["failed", "needs_revision"]);

function nowIso() {
  return new Date().toISOString();
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function createRunTrace(input = {}) {
  const trace = {
    requestId: input.requestId || crypto.randomUUID(),
    multiAgentRequired: !!input.multiAgentRequired,
    workflow: input.workflow || "",
    taskType: input.taskType || "",
    mode: input.mode || "",
    /** S|M|L|XL — workflow-execution-policy 写入 */
    taskSize: String(input.taskSize || "").trim(),
    /** 任何 specialized 交付必填；供 Gate / telemetry */
    decisionReason: String(input.decisionReason || "").trim(),
    /** multiAgentRequired=false 时可选顶层摘要（与 skippedAgents 互补） */
    skipReason: String(input.skipReason || "").trim(),
    /** Research：policy 强制启用 V2 时标 true */
    forcedRuntimeV2: !!input.forcedRuntimeV2,
    agentsPlanned: uniq(input.agentsPlanned || []),
    agentsExecuted: [],
    skippedAgents: [],
    handoffRecords: [],
    reviewerRecords: [],
    gateResult: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    source: "runtime",
  };
  return trace;
}

function assertTrace(trace) {
  if (!trace || trace.source !== "runtime" || !trace.requestId) {
    throw new Error("runtime_run_trace_required");
  }
  return trace;
}

function planAgents(trace, agents) {
  assertTrace(trace);
  trace.agentsPlanned = uniq([...(trace.agentsPlanned || []), ...(agents || [])]);
  trace.updatedAt = nowIso();
  return trace;
}

function recordAgentExecuted(trace, currentAgentRole, meta = {}) {
  assertTrace(trace);
  if (!currentAgentRole) {
    throw new Error("current_agent_role_required");
  }
  trace.agentsExecuted.push({
    agentRole: currentAgentRole,
    status: "completed",
    startedAt: meta.startedAt || nowIso(),
    completedAt: nowIso(),
    outputRef: meta.outputRef || "",
    summary: meta.summary || "",
  });
  trace.updatedAt = nowIso();
  return trace;
}

function recordSkippedAgent(trace, agentRole, skipReason, fallback = {}) {
  assertTrace(trace);
  if (!agentRole || !skipReason) {
    throw new Error("skipped_agent_requires_reason");
  }
  trace.skippedAgents.push({
    agentRole,
    status: "skipped",
    skipReason,
    fallbackAgent: fallback.fallbackAgent || "",
    fallbackReason: fallback.fallbackReason || "",
    recordedAt: nowIso(),
  });
  trace.updatedAt = nowIso();
  return trace;
}

function recordHandoff(trace, record = {}) {
  assertTrace(trace);
  for (const k of REQUIRED_HANDOFF_FIELDS) {
    if (!record[k]) {
      throw new Error(`handoff_missing_${k}`);
    }
  }
  if (
    HANDOFF_TERMINAL_BAD_STATUS.has(record.status) &&
    !(Array.isArray(record.requiredFixes) && record.requiredFixes.length)
  ) {
    throw new Error("handoff_required_fixes_missing");
  }
  if (record.status === "skipped" && !record.skipReason) {
    throw new Error("handoff_skip_reason_required");
  }
  trace.handoffRecords.push({ ...record, recordedAt: nowIso() });
  trace.updatedAt = nowIso();
  return trace;
}

function recordReviewer(trace, record = {}) {
  assertTrace(trace);
  if (
    !record.reviewerAgent ||
    !record.inputRef ||
    !record.reviewSummary ||
    !record.status
  ) {
    throw new Error("reviewer_record_invalid");
  }
  if (
    HANDOFF_TERMINAL_BAD_STATUS.has(record.status) &&
    !(Array.isArray(record.requiredFixes) && record.requiredFixes.length)
  ) {
    throw new Error("reviewer_required_fixes_missing");
  }
  trace.reviewerRecords.push({ ...record, recordedAt: nowIso() });
  trace.updatedAt = nowIso();
  return trace;
}

function setGateResult(trace, gateResult = {}) {
  assertTrace(trace);
  trace.gateResult = { ...gateResult, recordedAt: nowIso(), source: "runtime" };
  trace.updatedAt = nowIso();
  return trace;
}

function getExecutedRoles(trace) {
  assertTrace(trace);
  return (trace.agentsExecuted || [])
    .filter((x) => x.status === "completed")
    .map((x) => x.agentRole);
}

module.exports = {
  createRunTrace,
  assertTrace,
  planAgents,
  recordAgentExecuted,
  recordSkippedAgent,
  recordHandoff,
  recordReviewer,
  setGateResult,
  getExecutedRoles,
  REQUIRED_HANDOFF_FIELDS,
};
