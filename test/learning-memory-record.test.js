"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildLearningMemoryRecord,
  buildRecommendations,
} = require("../lib/feishu-cursor/runtime/learning-memory-record");

test("buildLearningMemoryRecord captures successful outcome", () => {
  const record = buildLearningMemoryRecord({
    taskId: "task-1",
    result: { code: 0 },
    trace: { requestId: "run-1", workflow: "research", taskType: "research", gateResult: { ok: true } },
    executionPolicy: {
      workflow: "research",
      taskType: "research",
      riskForecast: "medium",
      executeDecision: "execute",
      forecastGate: { status: "passed" },
      failureModes: ["source coverage may be incomplete"],
      learningSignals: ["workflow:research", "risk:medium"],
    },
  });
  assert.equal(record.task_id, "task-1");
  assert.equal(record.run_id, "run-1");
  assert.equal(record.workflow, "research");
  assert.equal(record.outcome, "success");
  assert.equal(record.forecast_gate_status, "passed");
  assert.ok(record.learning_signals.includes("workflow:research"));
});

test("buildLearningMemoryRecord captures blocked outcome", () => {
  const record = buildLearningMemoryRecord({
    taskId: "task-2",
    result: { code: 2 },
    trace: { requestId: "run-2", workflow: "code", taskType: "code", gateResult: { ok: false } },
    executionPolicy: {
      workflow: "code",
      taskType: "code",
      riskForecast: "high",
      executeDecision: "pause",
      forecastGate: { status: "warning" },
      failureModes: ["runtime may break"],
      learningSignals: ["workflow:code", "risk:high", "forecast:multi_failure_modes"],
    },
  });
  assert.equal(record.outcome, "blocked");
  assert.equal(record.risk_forecast, "high");
  assert.equal(record.execute_decision, "pause");
  assert.ok(record.recommendations.some((x) => x.includes("forecast")));
});

test("buildRecommendations suggests richer forecast when forecast is minimal", () => {
  const recs = buildRecommendations({
    outcome: "success",
    risk_forecast: "low",
    execute_decision: "execute",
    failure_modes: [],
    learning_signals: ["forecast:minimal"],
  });
  assert.ok(recs.some((x) => x.includes("forecast")));
});
