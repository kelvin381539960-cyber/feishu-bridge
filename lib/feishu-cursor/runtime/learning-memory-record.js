"use strict";

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function nowIso() {
  return new Date().toISOString();
}

function outcomeFromResult(result, trace) {
  if (trace && trace.gateResult && trace.gateResult.ok === false) return "blocked";
  if (!result) return "unknown";
  const code = Number(result.code);
  if (Number.isFinite(code) && code === 0) return "success";
  if (Number.isFinite(code) && code === 2) return "blocked";
  return "failed";
}

function buildRecommendations(record) {
  const out = [];
  if (record.outcome === "blocked") {
    out.push("review forecast criteria and user confirmation path before retrying");
  }
  if (record.risk_forecast === "high" && record.execute_decision === "execute") {
    out.push("review whether high-risk execution should require confirmation");
  }
  if ((record.failure_modes || []).length === 0) {
    out.push("improve forecast coverage by adding failure modes");
  }
  if ((record.learning_signals || []).includes("forecast:minimal")) {
    out.push("consider enriching forecast for similar future tasks");
  }
  return out;
}

function buildLearningMemoryRecord({ taskId, result, trace, executionPolicy }) {
  const ep = executionPolicy || {};
  const t = trace || {};
  const gate = t.gateResult || ep.forecastGate || {};
  const record = {
    record_id: `${trimStr(taskId || t.requestId || "task")}:${Date.now()}`,
    task_id: trimStr(taskId || t.requestId || "unknown"),
    run_id: trimStr(t.requestId || "") || null,
    workflow: trimStr(ep.workflow || t.workflow || "general"),
    task_type: trimStr(ep.taskType || t.taskType || "general"),
    risk_forecast: trimStr(ep.riskForecast || (ep.forecast && ep.forecast.riskForecast) || "unknown"),
    execute_decision: trimStr(ep.executeDecision || (ep.forecast && ep.forecast.executeDecision) || "unknown"),
    forecast_gate_status: trimStr((ep.forecastGate && ep.forecastGate.status) || gate.status || "unknown"),
    outcome: outcomeFromResult(result, trace),
    failure_modes: Array.isArray(ep.failureModes)
      ? ep.failureModes
      : ep.forecast && Array.isArray(ep.forecast.failureModes)
        ? ep.forecast.failureModes
        : [],
    learning_signals: Array.isArray(ep.learningSignals) ? ep.learningSignals : [],
    recommendations: [],
    created_at: nowIso(),
  };
  record.recommendations = buildRecommendations(record);
  return record;
}

module.exports = {
  buildLearningMemoryRecord,
  buildRecommendations,
};
