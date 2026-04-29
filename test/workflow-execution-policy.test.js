"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveWorkflowExecutionPolicy,
  computeTaskSize,
} = require("../lib/openclaw-control-plane/workflow-execution-policy");

test("computeTaskSize maps length and URLs", () => {
  assert.strictEqual(computeTaskSize("短", ""), "S");
  assert.strictEqual(computeTaskSize("x".repeat(35), ""), "M");
  assert.strictEqual(computeTaskSize("x".repeat(130), ""), "L");
  assert.strictEqual(computeTaskSize("正式报告 输出", ""), "XL");
  assert.strictEqual(computeTaskSize("a", "y".repeat(501)), "XL");
});

test("research clarify policy is solo with clarify skip reasons", () => {
  const p = resolveWorkflowExecutionPolicy({
    classification: { taskType: "research", role: "specialized", workflowKey: "research" },
    planTask: "调研 X",
    qaContext: "",
    promptStage: "clarify",
  });
  assert.strictEqual(p.multiAgentRequired, false);
  assert.ok(String(p.decisionReason).includes("research_clarify"));
  assert.strictEqual(p.skippedAgents.length, 2);
});

test("research execute with competitor keyword forces multi", () => {
  const p = resolveWorkflowExecutionPolicy({
    classification: { taskType: "research", role: "specialized" },
    planTask: "竞品分析 WalletConnect",
    qaContext: "",
    promptStage: "execute",
  });
  assert.strictEqual(p.multiAgentRequired, true);
  assert.ok(p.agentsPlanned.includes("Researcher_Crawler"));
});

test("research execute small focused task allows single agent policy", () => {
  const p = resolveWorkflowExecutionPolicy({
    classification: { taskType: "research", role: "specialized" },
    planTask: "调研消息队列",
    qaContext: "",
    promptStage: "execute",
  });
  assert.strictEqual(p.multiAgentRequired, false);
  assert.strictEqual(p.skipReason, "single_agent_focused_scope");
});

test("prd policy is pending multi runtime", () => {
  const p = resolveWorkflowExecutionPolicy({
    classification: { taskType: "prd", role: "specialized", workflowKey: "prd" },
    planTask: "写 PRD",
    promptStage: "",
  });
  assert.strictEqual(p.multiAgentRequired, false);
  assert.ok(String(p.decisionReason).includes("multi_agent_runtime_pending_prd"));
});

test("execution policy includes forecast layer fields", () => {
  const p = resolveWorkflowExecutionPolicy({
    classification: { taskType: "research", role: "specialized", workflowKey: "research" },
    planTask: "竞品分析 WalletConnect 并输出正式报告",
    qaContext: "",
    promptStage: "execute",
  });
  assert.ok(p.forecast);
  assert.ok(p.expectedOutcome);
  assert.ok(p.nextStepPrediction);
  assert.ok(Array.isArray(p.failureModes));
  assert.ok(p.failureModes.length >= 1);
  assert.ok(["low", "medium", "high"].includes(p.riskForecast));
  assert.ok(p.rollbackPlan);
  assert.ok(["execute", "pause", "needs_user_confirmation", "blocked"].includes(p.executeDecision));
  assert.ok(p.forecastGate);
  assert.ok(Array.isArray(p.learningSignals));
  assert.ok(p.learningSignals.some((x) => x === "workflow:research"));
});

test("high-risk code and ops task is not silently executed", () => {
  const p = resolveWorkflowExecutionPolicy({
    classification: { taskType: "code", role: "specialized", workflowKey: "code" },
    planTask: "部署 systemd 并修改 env 权限",
    promptStage: "",
  });
  assert.strictEqual(p.riskForecast, "high");
  assert.ok(["pause", "needs_user_confirmation"].includes(p.executeDecision));
  assert.ok(p.forecastGate.status === "warning" || p.forecastGate.status === "failed");
  assert.ok(p.rollbackPlan);
});
