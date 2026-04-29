"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runSpecializedSoloWithTrace,
  shouldBlockByForecast,
} = require("../lib/feishu-cursor/runtime/specialized-solo-runner");

test("shouldBlockByForecast blocks pause and confirmation decisions", () => {
  assert.equal(shouldBlockByForecast({ executeDecision: "pause" }), true);
  assert.equal(shouldBlockByForecast({ executeDecision: "needs_user_confirmation" }), true);
  assert.equal(shouldBlockByForecast({ executeDecision: "blocked" }), true);
  assert.equal(shouldBlockByForecast({ executeDecision: "execute" }), false);
});

test("runSpecializedSoloWithTrace does not call executor when forecast gate blocks", async () => {
  let called = false;
  const result = await runSpecializedSoloWithTrace(
    async () => {
      called = true;
      return { code: 0, stdout: "ok", stderr: "" };
    },
    {
      dispatch: { task: "deploy", opts: { sessionId: "s1" } },
      classification: { taskType: "code", stage: "execute" },
      executionPolicy: {
        workflow: "code",
        taskType: "code",
        taskSize: "M",
        decisionReason: "test",
        executeDecision: "pause",
        riskForecast: "high",
        rollbackPlan: "revert commit",
        failureModes: ["runtime may break"],
        agentsPlanned: [],
        skippedAgents: [],
        learningSignals: ["workflow:code", "risk:high"],
      },
      promptStage: "execute",
    }
  );
  assert.equal(called, false);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /forecast_gate_blocked_execution/);
  assert.equal(result.runtimeRunTrace.gateResult.gate, "forecast_gate");
  assert.equal(result.runtimeRunTrace.gateResult.ok, false);
});

test("runSpecializedSoloWithTrace calls executor when forecast gate passes", async () => {
  let called = false;
  const result = await runSpecializedSoloWithTrace(
    async () => {
      called = true;
      return { code: 0, stdout: "ok", stderr: "" };
    },
    {
      dispatch: { task: "inspect", opts: { sessionId: "s2" } },
      classification: { taskType: "code", stage: "execute" },
      executionPolicy: {
        workflow: "code",
        taskType: "code",
        taskSize: "S",
        decisionReason: "test",
        executeDecision: "execute",
        riskForecast: "low",
        agentsPlanned: [],
        skippedAgents: [],
      },
      promptStage: "execute",
    }
  );
  assert.equal(called, true);
  assert.equal(result.code, 0);
  assert.equal(result.runtimeRunTrace.gateResult.gate, "pipeline_specialized_solo");
});
