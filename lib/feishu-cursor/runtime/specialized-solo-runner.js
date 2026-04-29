"use strict";

const {
  createRunTrace,
  planAgents,
  recordSkippedAgent,
  recordAgentExecuted,
  setGateResult,
} = require("./run-trace-recorder");

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function shouldBlockByForecast(ep) {
  const decision = trimStr(ep && ep.executeDecision);
  return decision === "pause" || decision === "needs_user_confirmation" || decision === "blocked";
}

function buildForecastBlockMessage(ep) {
  const decision = trimStr(ep && ep.executeDecision) || "blocked";
  const risk = trimStr(ep && ep.riskForecast) || "unknown";
  const rollback = trimStr(ep && ep.rollbackPlan);
  const failures = Array.isArray(ep && ep.failureModes) ? ep.failureModes : [];
  const lines = [
    `Forecast Gate blocked execution: ${decision}`,
    `Risk forecast: ${risk}`,
  ];
  if (failures.length) lines.push(`Failure modes: ${failures.slice(0, 3).join("; ")}`);
  if (rollback) lines.push(`Rollback plan: ${rollback}`);
  return lines.join("\n");
}

/**
 * specialized 单 Agent（单次 adhoc）路径：写入 runtimeRunTrace，供 Gate / 遥测。
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
  trace.learningSignals = Array.isArray(ep.learningSignals) ? ep.learningSignals : [];
  planAgents(trace, ep.agentsPlanned || []);
  for (const row of ep.skippedAgents || []) {
    if (!row || !trimStr(row.agentRole) || !trimStr(row.skipReason)) continue;
    recordSkippedAgent(trace, row.agentRole, row.skipReason, {
      fallbackAgent: trimStr(row.fallbackAgent),
      fallbackReason: trimStr(row.fallbackReason),
    });
  }

  if (shouldBlockByForecast(ep)) {
    const soloRole = `${taskType}_Solo`;
    recordSkippedAgent(trace, soloRole, `forecast_gate_${trimStr(ep.executeDecision) || "blocked"}`, {
      fallbackAgent: "",
      fallbackReason: trimStr(ep.rollbackPlan),
    });
    setGateResult(trace, {
      ok: false,
      gate: "forecast_gate",
      taskType,
      executeDecision: trimStr(ep.executeDecision) || "blocked",
      riskForecast: trimStr(ep.riskForecast) || "unknown",
      reasons: Array.isArray(ep.failureModes) ? ep.failureModes : [],
    });
    return {
      code: 2,
      stdout: buildForecastBlockMessage(ep),
      stderr: "forecast_gate_blocked_execution",
      runtimeRunTrace: trace,
      multiAgentRequired: false,
    };
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
  });

  return {
    ...(res || { code: 1, stdout: "", stderr: "" }),
    runtimeRunTrace: trace,
    multiAgentRequired: false,
  };
}

module.exports = {
  runSpecializedSoloWithTrace,
  shouldBlockByForecast,
};
