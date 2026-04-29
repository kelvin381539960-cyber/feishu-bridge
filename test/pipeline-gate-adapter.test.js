"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyPipelineGate,
  ALLOWED_WORKFLOW_KEYS,
  ALLOWED_TASK_SUBTYPES,
  ALLOWED_ROLES,
  FORBIDDEN_TOKENS,
} = require("../lib/feishu-cursor/runtime/pipeline-gate-adapter");

function classify(overrides) {
  return {
    taskType: "general",
    workflowKey: "general",
    role: "fallback",
    taskSubtype: "none",
    ...overrides,
  };
}

test("constants: only the 5 final workflows allowed", () => {
  assert.deepStrictEqual(
    [...ALLOWED_WORKFLOW_KEYS].sort(),
    ["code", "general", "prd", "research", "solution"]
  );
});

test("constants: ALLOWED_TASK_SUBTYPES contains all expected legacy subtypes", () => {
  for (const sub of [
    "none",
    "interactive_card",
    "sheet_write",
    "sheet_read",
    "resource_read",
    "workflow_audit",
    "relay",
    "report_export",
  ]) {
    assert.ok(ALLOWED_TASK_SUBTYPES.has(sub), `missing subtype: ${sub}`);
  }
});

test("constants: ALLOWED_ROLES is just specialized/fallback", () => {
  assert.deepStrictEqual([...ALLOWED_ROLES].sort(), ["fallback", "specialized"]);
});

test("constants: FORBIDDEN_TOKENS contains qa/debug/p0/p2", () => {
  for (const t of ["qa", "debug", "p0", "p2"]) {
    assert.ok(FORBIDDEN_TOKENS.includes(t));
  }
});

test("valid specialized research classification passes", () => {
  const res = applyPipelineGate({
    classification: classify({
      taskType: "research",
      workflowKey: "research",
      role: "specialized",
      taskSubtype: "none",
    }),
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.violations.length, 0);
  assert.strictEqual(res.workflowEntry.taskType, "research");
});

test("valid general fallback classification passes", () => {
  const res = applyPipelineGate({ classification: classify({}) });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.workflowEntry.taskType, "general");
});

test("valid sheet_write subtype under general workflow passes", () => {
  const res = applyPipelineGate({
    classification: classify({
      taskType: "sheet_write",
      workflowKey: "general",
      role: "fallback",
      taskSubtype: "sheet_write",
    }),
  });
  assert.strictEqual(res.ok, true);
});

test("missing workflowKey -> fail-closed to general", () => {
  const res = applyPipelineGate({
    classification: { taskType: "general", role: "fallback", taskSubtype: "none" },
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.classification.workflowKey, "general");
  assert.strictEqual(res.classification.role, "fallback");
  assert.ok(res.violations.some((v) => v.startsWith("workflow_key_invalid")));
});

test("forbidden taskType=qa -> fail-closed to general + violation", () => {
  const res = applyPipelineGate({
    classification: classify({
      taskType: "qa",
      workflowKey: "general",
      role: "fallback",
      taskSubtype: "none",
    }),
  });
  assert.strictEqual(res.ok, false);
  assert.ok(res.violations.some((v) => v.startsWith("forbidden_task_type:qa")));
  assert.strictEqual(res.classification.workflowKey, "general");
});

test("forbidden workflowKey=debug -> fail-closed to general + violation", () => {
  const res = applyPipelineGate({
    classification: classify({
      taskType: "debug",
      workflowKey: "debug",
      role: "specialized",
      taskSubtype: "none",
    }),
  });
  assert.strictEqual(res.ok, false);
  const codes = res.violations.join(",");
  assert.ok(codes.includes("forbidden_workflow_key:debug") || codes.includes("workflow_key_invalid"));
});

test("role=specialized + workflowKey=general -> mismatch violation", () => {
  const res = applyPipelineGate({
    classification: classify({
      workflowKey: "general",
      role: "specialized",
    }),
  });
  assert.strictEqual(res.ok, false);
  assert.ok(res.violations.some((v) => v.includes("role_workflow_mismatch:specialized_general")));
});

test("role=fallback + workflowKey=research -> mismatch violation", () => {
  const res = applyPipelineGate({
    classification: classify({
      taskType: "research",
      workflowKey: "research",
      role: "fallback",
      taskSubtype: "none",
    }),
  });
  assert.strictEqual(res.ok, false);
  assert.ok(res.violations.some((v) => v.startsWith("role_workflow_mismatch:fallback_research")));
});

test("invalid taskSubtype -> fail-closed", () => {
  const res = applyPipelineGate({
    classification: classify({ taskSubtype: "legacy_unknown" }),
  });
  assert.strictEqual(res.ok, false);
  assert.ok(res.violations.some((v) => v.startsWith("task_subtype_invalid")));
});

test("reasonCodes always include workflow info for telemetry/dispatch fan-in", () => {
  const ok = applyPipelineGate({
    classification: classify({
      taskType: "research",
      workflowKey: "research",
      role: "specialized",
      taskSubtype: "none",
    }),
  });
  assert.ok(ok.reasonCodes.some((c) => c.startsWith("pipeline_gate_passed")));
  assert.ok(ok.reasonCodes.some((c) => c.startsWith("registry_entry")));

  const bad = applyPipelineGate({
    classification: classify({ workflowKey: "qa" }),
  });
  assert.ok(bad.reasonCodes.includes("pipeline_gate_failed"));
});
