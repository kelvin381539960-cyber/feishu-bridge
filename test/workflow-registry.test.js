"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const registry = require("../lib/feishu-cursor/workflows/workflow-registry");
const contracts = require("../lib/feishu-cursor/contracts");

test("registry registers exactly the 5 final workflows", () => {
  assert.deepStrictEqual(
    Object.keys(registry.WORKFLOW_REGISTRY).sort(),
    ["code", "general", "prd", "research", "solution"],
  );
  assert.deepStrictEqual(
    [...registry.FINAL_WORKFLOWS],
    ["prd", "research", "code", "solution", "general"],
  );
  assert.deepStrictEqual(
    [...registry.SPECIALIZED_WORKFLOWS],
    ["prd", "research", "code", "solution"],
  );
});

test("listSpecializedWorkflowTypes excludes general", () => {
  const list = registry.listSpecializedWorkflowTypes();
  assert.ok(!list.includes("general"));
  assert.deepStrictEqual(list.sort(), ["code", "prd", "research", "solution"]);
});

test("each registry entry has the required fields", () => {
  for (const key of registry.FINAL_WORKFLOWS) {
    const entry = registry.WORKFLOW_REGISTRY[key];
    assert.strictEqual(entry.taskType, key);
    assert.strictEqual(entry.workflow, key);
    assert.ok(["specialized", "fallback"].includes(entry.role));
    assert.ok(entry.contract);
    assert.ok(entry.gate);
    assert.ok(entry.expectedOutputKind);
    assert.ok(["single", "conditional", "required"].includes(entry.multiAgentPolicy));
    assert.ok(entry.executionGraphKey);
  }
});

test("registry binds contracts via contracts/index", () => {
  assert.strictEqual(registry.WORKFLOW_REGISTRY.prd.contract, contracts.prd);
  assert.strictEqual(registry.WORKFLOW_REGISTRY.research.contract, contracts.research);
  assert.strictEqual(registry.WORKFLOW_REGISTRY.code.contract, contracts.code);
  assert.strictEqual(registry.WORKFLOW_REGISTRY.solution.contract, contracts.solution);
  assert.strictEqual(registry.WORKFLOW_REGISTRY.general.contract, contracts.general);
});

test("solution registry locks allowedModes to the 5 final modes", () => {
  const entry = registry.WORKFLOW_REGISTRY.solution;
  assert.deepStrictEqual(
    [...entry.allowedModes].sort(),
    ["feasibility", "growth", "plan", "release", "roadmap"],
  );
});

test("code registry restricts mode to inspect/execute", () => {
  const entry = registry.WORKFLOW_REGISTRY.code;
  assert.deepStrictEqual([...entry.allowedModes], ["inspect", "execute"]);
  assert.strictEqual(entry.multiAgentPolicy, "conditional");
});

test("general is the only fallback and uses general gate", () => {
  const entry = registry.WORKFLOW_REGISTRY.general;
  assert.strictEqual(entry.role, "fallback");
  assert.strictEqual(entry.gate, "general");
  assert.strictEqual(entry.multiAgentPolicy, "single");
});

test("getWorkflowByTaskType returns specialized entry when known", () => {
  for (const k of registry.SPECIALIZED_WORKFLOWS) {
    const e = registry.getWorkflowByTaskType(k);
    assert.strictEqual(e.taskType, k);
    assert.strictEqual(e.role, "specialized");
  }
});

test("getWorkflowByTaskType falls back to general on unknown / debug / qa / null", () => {
  for (const k of ["debug", "qa", "p0", "p2", "", null, undefined, "interactive_card", "sheet_write"]) {
    const e = registry.getWorkflowByTaskType(k);
    assert.strictEqual(e.taskType, "general");
    assert.strictEqual(e.role, "fallback");
  }
});

test("requireWorkflowByTaskType throws on unsupported workflow (no debug/qa/legacy)", () => {
  for (const k of ["debug", "qa", "p0", "interactive_card"]) {
    assert.throws(() => registry.requireWorkflowByTaskType(k));
  }
  for (const k of registry.FINAL_WORKFLOWS) {
    const e = registry.requireWorkflowByTaskType(k);
    assert.strictEqual(e.taskType, k);
  }
});

test("getFallbackWorkflow returns the general entry", () => {
  const e = registry.getFallbackWorkflow();
  assert.strictEqual(e.taskType, "general");
  assert.strictEqual(e.role, "fallback");
});

test("workflow plugin registry exposes deterministic priority/order contract", () => {
  assert.ok(Array.isArray(registry.WORKFLOW_PLUGIN_ENTRIES));
  assert.ok(registry.WORKFLOW_PLUGIN_ENTRIES.length >= 1);
  for (const entry of registry.WORKFLOW_PLUGIN_ENTRIES) {
    assert.strictEqual(typeof entry.id, "string");
    assert.strictEqual(typeof entry.workflow, "string");
    assert.strictEqual(Number.isInteger(entry.priority), true);
    assert.strictEqual(Number.isInteger(entry.order), true);
    assert.strictEqual(typeof entry.plugin.match, "function");
    assert.strictEqual(typeof entry.plugin.run, "function");
  }
  const sorted = [...registry.WORKFLOW_PLUGIN_ENTRIES].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.order - b.order;
  });
  assert.deepStrictEqual(
    registry.WORKFLOW_PLUGIN_ENTRIES.map((x) => x.id),
    sorted.map((x) => x.id),
  );
});

test("workflow plugin selector selects research execute dispatch plugin", () => {
  const plugin = registry.selectWorkflowPlugin({ classification: { taskType: "research" } });
  assert.ok(plugin);
  assert.strictEqual(plugin, registry.WORKFLOW_PLUGIN_ENTRIES[0].plugin);
  assert.strictEqual(registry.selectWorkflowPlugin({ classification: { taskType: "general" } }), null);
});
