#!/usr/bin/env node
"use strict";

/**
 * scripts/runtime-smoke-tests.js
 *
 * Workflow Governance Runtime 冒烟测试（含 validateSpecializedRuntime 等 14 项）。
 *
 * 不依赖 LLM、不连飞书、不连 OpenClaw；只校验 runtime 模块本身。
 * 退出码：0 全通过；1 任一失败。
 *
 * 用法：
 *   node scripts/runtime-smoke-tests.js
 *   node scripts/runtime-smoke-tests.js --json   # 输出机读 JSON
 */

const {
  createRunTrace,
  recordAgentExecuted,
  recordHandoff,
  recordReviewer,
  planAgents,
  recordSkippedAgent,
} = require("../lib/feishu-cursor/runtime/run-trace-recorder");

const {
  assertNoDebugIdentity,
  enforceCurrentAgentRole,
  loadRoleContext,
  validateHandoffContract,
  validateReviewerRecord,
  preAssembleGuard,
  buildRuntimeGatePayload,
  validateMultiAgentRuntime,
  validateSpecializedRuntime,
  codeExecuteAuthGuard,
} = require("../lib/feishu-cursor/runtime/multi-agent-runtime-guards");

const cases = [];

function add(id, label, fn) {
  cases.push({ id, label, fn });
}

add("test1", "无 runTrace -> RUNTIME_TRACE_REQUIRED", () => {
  const r = validateMultiAgentRuntime({ multiAgentRequired: true });
  if (r.ok || r.code !== "RUNTIME_TRACE_REQUIRED") {
    throw new Error(`expected RUNTIME_TRACE_REQUIRED, got ${JSON.stringify(r)}`);
  }
});

add("test2", "LLM 伪造 agentsExecuted -> 被剥离", () => {
  const trace = createRunTrace({ multiAgentRequired: true, workflow: "code", taskType: "code", mode: "inspect" });
  const modelOutput = {
    agentsExecuted: [{ agentRole: "fake" }],
    reviewerRecords: [{ reviewerAgent: "fake" }],
    handoffRecords: [{ fromAgent: "fake" }],
    gateResult: { ok: true },
  };
  const payload = buildRuntimeGatePayload(modelOutput, trace, { workflow: "code", taskType: "code", mode: "inspect" });
  if (payload.modelOutput.agentsExecuted) throw new Error("agentsExecuted not stripped");
  if (payload.modelOutput.reviewerRecords) throw new Error("reviewerRecords not stripped");
  if (payload.modelOutput.handoffRecords) throw new Error("handoffRecords not stripped");
  if (payload.modelOutput.gateResult) throw new Error("gateResult not stripped");
  if (payload.runtimeRunTrace !== trace) throw new Error("runtimeRunTrace not preserved");
});

add("test3", "缺 handoffRecords -> HANDOFF_RECORDS_MISSING", () => {
  const trace = createRunTrace({ multiAgentRequired: true, workflow: "code", taskType: "code", mode: "execute" });
  planAgents(trace, ["architect", "coder", "reviewer"]);
  recordAgentExecuted(trace, "architect");
  recordAgentExecuted(trace, "coder");
  recordAgentExecuted(trace, "reviewer");
  recordReviewer(trace, { reviewerAgent: "reviewer", inputRef: "x", reviewSummary: "y", status: "passed" });
  const r = validateMultiAgentRuntime({ multiAgentRequired: true, runtimeRunTrace: trace });
  if (r.ok || r.code !== "HANDOFF_RECORDS_MISSING") {
    throw new Error(`expected HANDOFF_RECORDS_MISSING, got ${JSON.stringify(r)}`);
  }
});

add("test4", "缺 reviewerRecords -> preAssembleGuard 拦截", () => {
  const trace = createRunTrace({ multiAgentRequired: true, workflow: "code", taskType: "code" });
  planAgents(trace, ["architect"]);
  recordAgentExecuted(trace, "architect");
  recordHandoff(trace, { fromAgent: "architect", toAgent: "reviewer", inputRef: "i", outputRef: "o", handoffSummary: "s", status: "passed" });
  const r = preAssembleGuard(trace, { mustRunAgents: ["architect"], requireHandoff: true, requireReviewer: true });
  if (r.ok || r.code !== "REVIEWER_RECORDS_MISSING") {
    throw new Error(`expected REVIEWER_RECORDS_MISSING, got ${JSON.stringify(r)}`);
  }
});

add("test5", "mustRun 未完成且无 fallback -> MUST_RUN_AGENT_NOT_COMPLETED", () => {
  const trace = createRunTrace({ multiAgentRequired: true, workflow: "code", taskType: "code" });
  planAgents(trace, ["architect", "reviewer"]);
  recordAgentExecuted(trace, "architect");
  const r = preAssembleGuard(trace, { mustRunAgents: ["architect", "reviewer"] });
  if (r.ok || r.code !== "MUST_RUN_AGENT_NOT_COMPLETED") {
    throw new Error(`expected MUST_RUN_AGENT_NOT_COMPLETED, got ${JSON.stringify(r)}`);
  }
});

add("test6", "skipped 缺 skipReason -> HANDOFF_SKIP_REASON_REQUIRED", () => {
  const r = validateHandoffContract({
    fromAgent: "a", toAgent: "b", inputRef: "i", outputRef: "o",
    handoffSummary: "s", status: "skipped",
  });
  if (r.ok || r.code !== "HANDOFF_SKIP_REASON_REQUIRED") {
    throw new Error(`expected HANDOFF_SKIP_REASON_REQUIRED, got ${JSON.stringify(r)}`);
  }
});

add("test7", "needs_revision 缺 requiredFixes -> HANDOFF_FIXES_REQUIRED & REVIEWER_FIXES_REQUIRED", () => {
  const h = validateHandoffContract({
    fromAgent: "a", toAgent: "b", inputRef: "i", outputRef: "o",
    handoffSummary: "s", status: "needs_revision",
  });
  if (h.ok || h.code !== "HANDOFF_FIXES_REQUIRED") {
    throw new Error(`expected HANDOFF_FIXES_REQUIRED, got ${JSON.stringify(h)}`);
  }
  const rv = validateReviewerRecord({
    reviewerAgent: "r", inputRef: "i", reviewSummary: "s", status: "failed",
  });
  if (rv.ok || rv.code !== "REVIEWER_FIXES_REQUIRED") {
    throw new Error(`expected REVIEWER_FIXES_REQUIRED, got ${JSON.stringify(rv)}`);
  }
});

add("test8", "currentAgentRole 缺失 -> CURRENT_AGENT_ROLE_REQUIRED", () => {
  const r = enforceCurrentAgentRole("", "reviewer");
  if (r.ok || r.code !== "CURRENT_AGENT_ROLE_REQUIRED") {
    throw new Error(`expected CURRENT_AGENT_ROLE_REQUIRED, got ${JSON.stringify(r)}`);
  }
});

add("test9", "子 Agent 越权 -> ROLE_CLAIM_MISMATCH", () => {
  const r = enforceCurrentAgentRole("coder", "reviewer");
  if (r.ok || r.code !== "ROLE_CLAIM_MISMATCH") {
    throw new Error(`expected ROLE_CLAIM_MISMATCH, got ${JSON.stringify(r)}`);
  }
});

add("test10", "role context 全量上下文 -> 抛错", () => {
  let thrown = null;
  try { loadRoleContext("coder", { coder: { fullContext: true } }); }
  catch (e) { thrown = e; }
  if (!thrown || !/role_context_must_not_be_full_context/.test(thrown.message)) {
    throw new Error(`expected role_context_must_not_be_full_context, got ${thrown}`);
  }
});

add("test11", "debug/qa 零回流 -> DEBUG_FORBIDDEN", () => {
  for (const k of ["debug", "DEBUG", "qa", "QA"]) {
    for (const field of ["workflow", "taskType", "mode", "alias", "executionGraphKey"]) {
      const r = assertNoDebugIdentity({ [field]: k });
      if (r.ok || r.code !== "DEBUG_FORBIDDEN") {
        throw new Error(`expected DEBUG_FORBIDDEN for ${field}=${k}, got ${JSON.stringify(r)}`);
      }
    }
  }
});

add("test12", "Code execute 缺授权 -> CODE_EXECUTE_AUTH_REQUIRED", () => {
  const r = codeExecuteAuthGuard({ workflow: "code", mode: "execute", authorization: {} });
  if (r.ok || r.code !== "CODE_EXECUTE_AUTH_REQUIRED") {
    throw new Error(`expected CODE_EXECUTE_AUTH_REQUIRED, got ${JSON.stringify(r)}`);
  }
  const ok = codeExecuteAuthGuard({ workflow: "code", mode: "execute", authorization: { status: "granted" } });
  if (!ok.ok) throw new Error(`expected ok with granted, got ${JSON.stringify(ok)}`);
});

add("test13", "正常多 Agent 路径全部通过", () => {
  const trace = createRunTrace({ multiAgentRequired: true, workflow: "code", taskType: "code", mode: "execute" });
  planAgents(trace, ["architect", "coder", "reviewer"]);
  recordAgentExecuted(trace, "architect", { outputRef: "a-out" });
  recordAgentExecuted(trace, "coder", { outputRef: "c-out" });
  recordAgentExecuted(trace, "reviewer", { outputRef: "r-out" });
  recordHandoff(trace, { fromAgent: "architect", toAgent: "coder", inputRef: "a-out", outputRef: "c-in", handoffSummary: "ok", status: "passed" });
  recordHandoff(trace, { fromAgent: "coder", toAgent: "reviewer", inputRef: "c-out", outputRef: "r-in", handoffSummary: "ok", status: "passed" });
  recordReviewer(trace, { reviewerAgent: "reviewer", inputRef: "r-in", reviewSummary: "ok", status: "passed" });

  const v = validateMultiAgentRuntime({ multiAgentRequired: true, runtimeRunTrace: trace });
  if (!v.ok) throw new Error(`validateMultiAgentRuntime expected ok, got ${JSON.stringify(v)}`);

  const g = preAssembleGuard(trace, {
    mustRunAgents: ["architect", "coder", "reviewer"],
    requireHandoff: true,
    requireReviewer: true,
  });
  if (!g.ok) throw new Error(`preAssembleGuard expected ok, got ${JSON.stringify(g)}`);

  const auth = codeExecuteAuthGuard({ workflow: "code", mode: "execute", authorization: { status: "granted" } });
  if (!auth.ok) throw new Error(`codeExecuteAuthGuard expected ok, got ${JSON.stringify(auth)}`);
});

add("test14", "validateSpecializedRuntime solo prd with pending skip ok", () => {
  const trace = createRunTrace({
    multiAgentRequired: false,
    workflow: "prd",
    taskType: "prd",
    mode: "",
    taskSize: "M",
    decisionReason: "multi_agent_runtime_pending_prd",
    skipReason: "multi_agent_runner_not_implemented_pending_phase2",
  });
  recordSkippedAgent(trace, "prd_MultiAgentGraph", "multi_agent_runner_not_implemented_pending_phase2", {
    fallbackAgent: "",
    fallbackReason: "",
  });
  recordAgentExecuted(trace, "prd_Solo", { outputRef: "solo:x", summary: "adhoc" });
  const r = validateSpecializedRuntime({
    classification: { taskType: "prd", role: "specialized" },
    multiAgentRequired: false,
    runtimeRunTrace: trace,
  });
  if (!r.ok) {
    throw new Error(`validateSpecializedRuntime expected ok, got ${JSON.stringify(r)}`);
  }
});

function runAll() {
  const results = [];
  let pass = 0, fail = 0;
  for (const c of cases) {
    try {
      c.fn();
      results.push({ id: c.id, label: c.label, status: "PASS" });
      pass += 1;
    } catch (e) {
      results.push({ id: c.id, label: c.label, status: "FAIL", error: e.message });
      fail += 1;
    }
  }
  return { pass, fail, total: cases.length, results };
}

if (require.main === module) {
  const json = process.argv.includes("--json");
  const summary = runAll();
  if (json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  } else {
    for (const r of summary.results) {
      const tag = r.status === "PASS" ? "PASS" : "FAIL";
      const tail = r.error ? ` -- ${r.error}` : "";
      process.stdout.write(`${tag} ${r.id} ${r.label}${tail}\n`);
    }
    process.stdout.write(`\n${summary.pass}/${summary.total} passed (${summary.fail} failed)\n`);
  }
  process.exit(summary.fail === 0 ? 0 : 1);
}

module.exports = { runAll, cases };
