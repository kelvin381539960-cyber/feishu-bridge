"use strict";

const {
  createRunTrace,
  planAgents,
  recordSkippedAgent,
  recordAgentExecuted,
  setGateResult,
} = require("./run-trace-recorder");
const { buildLearningMemoryRecord } = require("./learning-memory-record");

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function isForecastWarning(ep) {
  const decision = trimStr(ep && ep.executeDecision);
  return decision === "pause" || decision === "needs_user_confirmation" || decision === "blocked";
}

function buildForecastWarning(ep) {
  const decision = trimStr(ep && ep.executeDecision) || "execute";
  const risk = trimStr(ep && ep.riskForecast) || "unknown";
  const rollback = trimStr(ep && ep.rollbackPlan);
  const failures = Array.isArray(ep && ep.failureModes) ? ep.failureModes : [];
  return {
    gate: "forecast_gate",
    status: decision === "execute" ? "passed" : "warning",
    executeDecision: decision,
    riskForecast: risk,
    reasons: failures,
    rollbackPlan: rollback,
  };
}

function attachLearningRecord(result, trace, executionPolicy, taskId) {
  const learningMemoryRecord = buildLearningMemoryRecord({
    taskId,
    result,
    trace,
    executionPolicy,
  });
  trace.learningMemoryRecord = learningMemoryRecord;
  return {
    ...result,
    learningMemoryRecord,
  };
}

/**
 * specialized 单 Agent（单次 adhoc）路径：写入 runtimeRunTrace，供 Gate / 遥测。
 *
 * v0.1 behavior: Forecast Gate is non-blocking. It records warning metadata,
 * but never prevents the executor from running.
 *
 * @param {Function} run — 通常为 runOpenclawGatewayPrompt
 * @param {{
 *   dispatch: { task: string, opts: object },
 *   classification: object,
 *   executionPolicy: object,
 *   promptStage?: string,
 * }} opts
 */
async function runSpecializedSoloWithTrace(run, opts) {
  const o = opts || {};
  const classification = o.classification || {};
  const ep = o.executionPolicy || {};
  const taskType = trimStr(classification.taskType) || "general";
  const wf = trimStr(ep.workflow) || taskType;

  const trace = createRunTrace({
    multiAgentRequired: false,
    workflow: wf,
    taskType,
    mode: trimStr(o.promptStage || classification.stage || ""),
    taskSize: trimStr(ep.taskSize),
    decisionReason: trimStr(ep.decisionReason),
    skipReason: trimStr(ep.skipReason),
    forcedRuntimeV2: !!ep.forcedRuntimeV2,
    agentsPlanned: Array.isArray(ep.agentsPlanned) ? ep.agentsPlanned : [],
  });
  trace.forecast = ep.forecast || null;
  trace.forecastWarning = buildForecastWarning(ep);
  trace.learningSignals = Array.isArray(ep.learningSignals) ? ep.learningSignals : [];
  planAgents(trace, ep.agentsPlanned || []);
  for (const row of ep.skippedAgents || []) {
    if (!row || !trimStr(row.agentRole) || !trimStr(row.skipReason)) continue;
    recordSkippedAgent(trace, row.agentRole, row.skipReason, {
      fallbackAgent: trimStr(row.fallbackAgent),
      fallbackReason: trimStr(row.fallbackReason),
    });
  }

  if (isForecastWarning(ep)) {
    trace.forecastWarning.nonBlocking = true;
  }

  const res = await run(o.dispatch.task, o.dispatch.opts);
  const soloRole = `${taskType}_Solo`;
  const sid =
    o.dispatch &&
    o.dispatch.opts &&
    o.dispatch.opts.sessionId &&
    trimStr(o.dispatch.opts.sessionId);
  recordAgentExecuted(trace, soloRole, {
    outputRef: sid ? `solo:${sid}` : "solo:adhoc",
    summary: "specialized_adhoc_single",
  });
  setGateResult(trace, {
    ok: res && Number(res.code) === 0,
    gate: "pipeline_specialized_solo",
    taskType,
    forecastGate: ep.forecastGate || null,
    forecastWarning: trace.forecastWarning,
  });

  const result = {
    ...(res || { code: 1, stdout: "", stderr: "" }),
    runtimeRunTrace: trace,
    multiAgentRequired: false,
  };
  return attachLearningRecord(result, trace, ep, trace.requestId);
}

module.exports = {
  runSpecializedSoloWithTrace,
  isForecastWarning,
  buildForecastWarning,
  attachLearningRecord,
};
