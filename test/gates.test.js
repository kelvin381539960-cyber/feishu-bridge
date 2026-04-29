"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { validateSpecializedRuntime } = require("../lib/feishu-cursor/runtime/multi-agent-runtime-guards");
const {
  createRunTrace,
  planAgents,
  recordAgentExecuted,
  recordHandoff,
} = require("../lib/feishu-cursor/runtime/run-trace-recorder");

const ROOT = path.resolve(__dirname, "..");
const PYTHON = process.env.PYTHON || "python3";

function runGate(script, payload) {
  const proc = spawnSync(PYTHON, [path.join(ROOT, "scripts", script)], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: 15000,
  });
  if (proc.error) throw proc.error;
  let parsed;
  try {
    parsed = JSON.parse((proc.stdout || "").trim());
  } catch (e) {
    throw new Error(
      `gate ${script} returned non-json: stdout=${proc.stdout} stderr=${proc.stderr}`
    );
  }
  return { exitCode: proc.status, result: parsed, stderr: proc.stderr };
}

// ============================================================
// verify-workflow-gates.py
// ============================================================

test("workflow-gates rejects unsupported workflow type", () => {
  const { exitCode, result } = runGate("verify-workflow-gates.py", {
    classification: {
      taskType: "debug",
      workflow: "debug",
      role: "specialized",
    },
  });
  assert.notStrictEqual(exitCode, 0);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "GATE_SUPPORTED_TASK_TYPES_ONLY");
});

test("workflow-gates rejects unknown taskType", () => {
  const { result } = runGate("verify-workflow-gates.py", {
    classification: { taskType: "qa", workflow: "qa", role: "specialized" },
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "GATE_SUPPORTED_TASK_TYPES_ONLY");
});

test("workflow-gates requires fallbackReason for general", () => {
  const { result } = runGate("verify-workflow-gates.py", {
    classification: { taskType: "general", workflow: "general", role: "fallback" },
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "CLASSIFICATION_SCHEMA_INVALID");
});

test("workflow-gates passes general fallback with fallbackReason", () => {
  const { exitCode, result } = runGate("verify-workflow-gates.py", {
    classification: {
      taskType: "general",
      workflow: "general",
      role: "fallback",
      fallbackReason: "no specialized intent detected",
    },
    multiAgentRequired: false,
  });
  assert.strictEqual(exitCode, 0);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.workflow, "general");
});

test("workflow-gates rejects general when role != fallback", () => {
  const { result } = runGate("verify-workflow-gates.py", {
    classification: {
      taskType: "general",
      workflow: "general",
      role: "specialized",
      fallbackReason: "x",
    },
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "GENERAL_SPECIALIZED_MISROUTE");
});

test("workflow-gates demands runtimeRunTrace when multiAgentRequired", () => {
  const { result } = runGate("verify-workflow-gates.py", {
    classification: {
      taskType: "general",
      workflow: "general",
      role: "fallback",
      fallbackReason: "x",
    },
    multiAgentRequired: true,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "RUNTIME_TRACE_REQUIRED");
});

test("workflow-gates specialized research requires runtimeRunTrace", () => {
  const { result } = runGate("verify-workflow-gates.py", {
    classification: {
      taskType: "research",
      workflow: "research",
      role: "specialized",
      workflowKey: "research",
      reasons: [],
    },
    multiAgentRequired: false,
    mode: "clarify",
    modelOutput: "1. A？\n2. B？\n",
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "SPECIALIZED_TRACE_REQUIRED");
});

test("workflow-gates passes research clarify with solo trace", () => {
  const trace = {
    source: "runtime",
    requestId: "t1",
    multiAgentRequired: false,
    decisionReason: "research_clarify_stage|no_parallel_gather",
    taskSize: "M",
    agentsPlanned: [],
    agentsExecuted: [
      {
        agentRole: "research_Solo",
        status: "completed",
        startedAt: "2020-01-01T00:00:00.000Z",
        completedAt: "2020-01-01T00:00:01.000Z",
        outputRef: "solo:s",
        summary: "s",
      },
    ],
    skippedAgents: [
      {
        agentRole: "Researcher_Crawler",
        skipReason: "research_clarify_stage_only",
        fallbackAgent: "",
        fallbackReason: "",
        status: "skipped",
        recordedAt: "2020-01-01T00:00:00.000Z",
      },
      {
        agentRole: "Researcher_Analyst",
        skipReason: "research_clarify_stage_only",
        fallbackAgent: "",
        fallbackReason: "",
        status: "skipped",
        recordedAt: "2020-01-01T00:00:00.000Z",
      },
    ],
    handoffRecords: [],
    reviewerRecords: [],
    gateResult: null,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  };
  const { exitCode, result } = runGate("verify-workflow-gates.py", {
    classification: {
      taskType: "research",
      workflow: "research",
      role: "specialized",
      workflowKey: "research",
      reasons: [],
    },
    multiAgentRequired: false,
    runtimeRunTrace: trace,
    mode: "clarify",
    modelOutput: "1. 你希望覆盖国内还是海外？\n2. 是否需要竞品对比？\n3. 交付形式偏好？\n",
  });
  assert.strictEqual(exitCode, 0);
  assert.strictEqual(result.ok, true);
});

test("workflow-gates specialized multi rejects missing handoffRecords", () => {
  const { result } = runGate("verify-workflow-gates.py", {
    classification: {
      taskType: "research",
      workflow: "research",
      role: "specialized",
      workflowKey: "research",
    },
    multiAgentRequired: true,
    runtimeRunTrace: {
      source: "runtime",
      requestId: "x",
      multiAgentRequired: true,
      decisionReason: "research_multi",
      agentsPlanned: ["Researcher_Crawler", "Researcher_Analyst"],
      agentsExecuted: [
        {
          agentRole: "Researcher_Crawler",
          status: "completed",
          startedAt: "2020-01-01T00:00:00.000Z",
          completedAt: "2020-01-01T00:00:01.000Z",
          outputRef: "c",
          summary: "c",
        },
      ],
      skippedAgents: [],
      handoffRecords: [],
    },
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "RUNTIME_TRACE_INVALID");
});

test("validateSpecializedRuntime fails when AGENTS_PLAN_NOT_FULFILLED", () => {
  const trace = createRunTrace({
    multiAgentRequired: true,
    workflow: "research",
    taskType: "research",
    mode: "execute",
    decisionReason: "research_multi",
    agentsPlanned: ["Researcher_Crawler", "Researcher_Analyst"],
  });
  planAgents(trace, ["Researcher_Crawler", "Researcher_Analyst"]);
  recordAgentExecuted(trace, "Researcher_Crawler", { outputRef: "a", summary: "c" });
  recordHandoff(trace, {
    fromAgent: "Researcher_Crawler",
    toAgent: "Researcher_Analyst",
    inputRef: "i",
    outputRef: "o",
    handoffSummary: "h",
    status: "completed",
  });
  const r = validateSpecializedRuntime({
    classification: { taskType: "research", role: "specialized" },
    multiAgentRequired: true,
    runtimeRunTrace: trace,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "AGENTS_PLAN_NOT_FULFILLED");
});

// ============================================================
// research-gate.py
// ============================================================

test("research-gate clarify rejects empty output", () => {
  const { result } = runGate("research-gate.py", {
    classification: { taskType: "research" },
    mode: "clarify",
    modelOutput: "",
  });
  assert.strictEqual(result.ok, false);
});

test("research-gate clarify accepts valid questions", () => {
  const { exitCode, result } = runGate("research-gate.py", {
    classification: { taskType: "research" },
    mode: "clarify",
    modelOutput: "1. 你希望覆盖国内还是海外？\n2. 输出用于内部还是对外？\n3. 是否需要数据来源对比？",
  });
  assert.strictEqual(exitCode, 0);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.mode, "clarify");
});

test("research-gate clarify rejects body-style output", () => {
  const { result } = runGate("research-gate.py", {
    classification: { taskType: "research" },
    mode: "clarify",
    modelOutput: "执行摘要：本次调研结论是...\n结论与建议：建议采用...",
  });
  assert.strictEqual(result.ok, false);
});

test("research-gate execute rejects too-short body", () => {
  const { result } = runGate("research-gate.py", {
    classification: { taskType: "research" },
    mode: "execute",
    modelOutput: "# 标题\n执行摘要：略\n背景：略",
  });
  assert.strictEqual(result.ok, false);
});

// ============================================================
// code-gate.py
// ============================================================

test("code-gate rejects non-code taskType", () => {
  const { result } = runGate("code-gate.py", {
    classification: { taskType: "general" },
    mode: "inspect",
    modelOutput: "x",
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "CODE_MISSING_OR_INVALID_TASK_TYPE");
});

test("code-gate rejects invalid mode", () => {
  const { result } = runGate("code-gate.py", {
    classification: { taskType: "code" },
    mode: "deploy",
    modelOutput: "x",
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "CODE_MISSING_OR_INVALID_MODE");
});

test("code-gate inspect blocks fake execution language", () => {
  const text =
    "目标：修 bug\n判断：是 X 导致\n下一步：建议 Y\n授权：需要确认\n风险：低\n验证：跑测试\n回滚：还原文件\n实施动作：略\n文件：lib/x.js\n已修改 lib/x.js";
  const { result } = runGate("code-gate.py", {
    classification: { taskType: "code" },
    mode: "inspect",
    modelOutput: text,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.includes("CODE_INSPECT_FAKE_EXECUTION"));
});

test("code-gate execute requires explicit authorization", () => {
  const text =
    "实际执行：略\n验证结果：通过\n回滚：可恢复\n执行结果：成功\n文件：lib/x.js\n动作：建议\n验证：测试通过";
  const { result } = runGate("code-gate.py", {
    classification: { taskType: "code" },
    mode: "execute",
    modelOutput: text,
    metadata: {
      userApprovalStatus: "unknown",
      hasExplicitExecuteApproval: false,
      riskLevel: "low",
    },
    runtimeRunTrace: {
      source: "runtime",
      requestId: "x",
      agentsExecuted: [
        { agentRole: "Risk Checker", status: "completed" },
        { agentRole: "Verifier", status: "completed" },
      ],
    },
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.includes("CODE_EXECUTE_MISSING_AUTHORIZATION"));
});

test("code-gate flags secret leak", () => {
  const { result } = runGate("code-gate.py", {
    classification: { taskType: "code" },
    mode: "inspect",
    modelOutput:
      "目标：略\n判断：略\n下一步：略\n授权：略\n风险：略\n验证：略\n回滚：略\n动作：略\n文件：略\napi_key = 'sk-abcdef1234567890ABCDEF'",
    metadata: { riskLevel: "low" },
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.includes("CODE_SECRET_EXPOSURE_BLOCKED"));
});

// ============================================================
// solution-gate.py
// ============================================================

test("solution-gate rejects mode outside the 5 final modes", () => {
  for (const m of ["debug", "explore", "audit"]) {
    const { result } = runGate("solution-gate.py", {
      classification: { taskType: "solution" },
      mode: m,
      taskSize: "S",
      modelOutput: "x",
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, "SOLUTION_MODE_INVALID");
  }
});

test("solution-gate rejects invalid taskSize", () => {
  const { result } = runGate("solution-gate.py", {
    classification: { taskType: "solution" },
    mode: "feasibility",
    taskSize: "XXL",
    modelOutput: "x",
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "SOLUTION_TASK_SIZE_INVALID");
});

test("solution-gate rejects feasibility missing required fields", () => {
  const { result } = runGate("solution-gate.py", {
    classification: { taskType: "solution" },
    mode: "feasibility",
    taskSize: "S",
    modelOutput: "结论：建议做\n目标：略\n方案设计：略\n执行路径：略\n风险：略\n指标：略\n下一步：略",
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.includes("SOLUTION_FEASIBILITY_FAILED"));
});

test("solution-gate L task requires reviewerRecords", () => {
  const text = [
    "结论：建议做",
    "目标：解决问题",
    "方案设计：A→B→C",
    "执行路径：步骤1、步骤2",
    "风险：依赖外部",
    "指标：完成率",
    "下一步：开干",
    "建议做",
    "收益：明显",
    "成本：可控",
    "依赖：无",
  ].join("\n");
  const { result } = runGate("solution-gate.py", {
    classification: { taskType: "solution" },
    mode: "feasibility",
    taskSize: "L",
    modelOutput: text,
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.includes("SOLUTION_L_REVIEW_REQUIRED"));
});

test("solution-gate XL requires both Execution and Risk Reviewer", () => {
  const text = [
    "结论：建议做",
    "目标：x",
    "方案设计：A",
    "执行路径：B",
    "风险：C",
    "指标：D",
    "下一步：E",
    "建议做",
    "收益：略",
    "成本：略",
    "依赖：略",
  ].join("\n");
  const { result } = runGate("solution-gate.py", {
    classification: { taskType: "solution" },
    mode: "feasibility",
    taskSize: "XL",
    modelOutput: text,
    runtimeRunTrace: {
      reviewerRecords: [
        { reviewerAgent: "Execution Reviewer", status: "passed" },
      ],
    },
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.includes("SOLUTION_XL_REVIEW_REQUIRED"));
});
