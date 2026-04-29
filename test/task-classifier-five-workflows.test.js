"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyTask,
  classifyTaskWithSemantic,
  TASK_SUBTYPES,
} = require("../lib/feishu-cursor/policies/task-classifier");

test("dual-track output shape: every classification carries workflowKey + role + taskSubtype", () => {
  const c = classifyTask({ task: "你好" });
  assert.ok(["prd", "research", "code", "solution", "general"].includes(c.workflowKey));
  assert.ok(["specialized", "fallback"].includes(c.role));
  assert.ok(typeof c.taskSubtype === "string" && c.taskSubtype.length > 0);
});

test("PRD requests -> workflowKey=prd, taskSubtype=none", () => {
  for (const t of [
    "帮我写一个 WalletConnect 支付失败提示页 PRD",
    "输出一份 KYC 拒绝页需求文档",
    "帮我评审产品方案",
  ]) {
    const c = classifyTask({ task: t });
    assert.strictEqual(c.workflowKey, "prd", t);
    assert.strictEqual(c.role, "specialized", t);
    assert.strictEqual(c.taskSubtype, TASK_SUBTYPES.NONE, t);
  }
});

test("Research requests -> workflowKey=research, taskSubtype=none", () => {
  for (const t of [
    "帮我调研 RedotPay 的 KYC 流程",
    "/调研 USDC 跨链桥",
    "做一个深度分析",
  ]) {
    const c = classifyTask({ task: t });
    assert.strictEqual(c.workflowKey, "research", t);
    assert.strictEqual(c.role, "specialized", t);
  }
});

test("Code requests -> workflowKey=code, taskSubtype=none", () => {
  for (const t of [
    "帮我排障 nginx 启动失败",
    "服务跑不起来，看一下",
    "/code 修复 lib/x.js 的 bug",
    "重启 systemctl 服务",
    "deploy 这个分支到测试环境",
    "帮我修复一下 lib/x.js 的报错",
    "跑不起来不工作，帮看下",
  ]) {
    const c = classifyTask({ task: t });
    assert.strictEqual(c.workflowKey, "code", t);
    assert.strictEqual(c.role, "specialized", t);
    assert.strictEqual(c.taskSubtype, TASK_SUBTYPES.NONE, t);
  }
});

test("Solution requests -> workflowKey=solution, taskSubtype=none", () => {
  for (const t of [
    "做一个可行性分析",
    "/solution 出一个 release plan",
    "出一个增长方案",
    "对比两个方案的可行性",
    "做一个发布计划",
    "实验设计怎么搭",
  ]) {
    const c = classifyTask({ task: t });
    assert.strictEqual(c.workflowKey, "solution", t);
    assert.strictEqual(c.role, "specialized", t);
    assert.strictEqual(c.taskSubtype, TASK_SUBTYPES.NONE, t);
  }
});

test("Solution PR2: 灰度发布文案 + solutionMode", () => {
  const c = classifyTask({ task: "帮我做一个新产品灰度发布方案" });
  assert.strictEqual(c.workflowKey, "solution");
  assert.strictEqual(c.solutionMode, "release");
});

test("General fallback -> workflowKey=general + role=fallback + fallbackReason", () => {
  const c = classifyTask({ task: "你好啊" });
  assert.strictEqual(c.workflowKey, "general");
  assert.strictEqual(c.role, "fallback");
  assert.ok(c.fallbackReason && c.fallbackReason.length > 0);
});

test("Existing subtypes preserve workflowKey=general but distinct taskSubtype", () => {
  // interactive
  const i = classifyTask({ task: "x", messageType: "interactive" });
  assert.strictEqual(i.workflowKey, "general");
  assert.strictEqual(i.taskSubtype, TASK_SUBTYPES.INTERACTIVE_CARD);
  assert.strictEqual(i.role, "fallback");

  // sheet_write
  const sw = classifyTask({
    task: "把这些内容写入这个飞书表格：https://xxx.feishu.cn/sheets/abc",
  });
  assert.strictEqual(sw.workflowKey, "general");
  assert.strictEqual(sw.taskSubtype, TASK_SUBTYPES.SHEET_WRITE);

  // sheet_read
  const sr = classifyTask({
    task: "帮我看看这个飞书表格：https://xxx.feishu.cn/sheets/abc",
  });
  assert.strictEqual(sr.workflowKey, "general");
  assert.strictEqual(sr.taskSubtype, TASK_SUBTYPES.SHEET_READ);

  // resource_read
  const rr = classifyTask({
    task: "看看这个 wiki：https://xxx.feishu.cn/wiki/abcdef",
  });
  assert.strictEqual(rr.workflowKey, "general");
  assert.strictEqual(rr.taskSubtype, TASK_SUBTYPES.RESOURCE_READ);

  // workflow_audit
  const wa = classifyTask({ task: "检查这个 workflow 有没有按设计执行" });
  assert.strictEqual(wa.workflowKey, "general");
  assert.strictEqual(wa.taskSubtype, TASK_SUBTYPES.WORKFLOW_AUDIT);
});

test("relay subtype preserved as workflowKey=general / taskSubtype=relay", () => {
  const c = classifyTask({ task: "帮我问一下张三这个问题" });
  assert.strictEqual(c.taskType, "relay");
  assert.strictEqual(c.workflowKey, "general");
  assert.strictEqual(c.taskSubtype, TASK_SUBTYPES.RELAY);
  assert.strictEqual(c.role, "fallback");
});

test("report subtype preserved as taskSubtype=report_export, workflowKey=general", () => {
  const { isReportLikeTask } = require("../lib/feishu-cursor-route");
  const c = classifyTask({
    task: "输出报告 本周数据",
    messageType: "text",
    isRelayLikeTask: () => false,
    isResearchLikeTask: () => false,
    isReportLikeTask,
  });
  assert.strictEqual(c.taskType, "report");
  assert.strictEqual(c.workflowKey, "general");
  assert.strictEqual(c.taskSubtype, TASK_SUBTYPES.REPORT_EXPORT);
});

test("PRD wins over code keywords", () => {
  const c = classifyTask({ task: "帮我修复 PRD 的描述" });
  assert.strictEqual(c.workflowKey, "prd");
});

test("Research wins over code keywords (no URL)", () => {
  const c = classifyTask({ task: "帮我调研一下这个报错" });
  assert.strictEqual(c.workflowKey, "research");
});

test("workflow_audit acts as subtype and does not override research workflow", () => {
  const c = classifyTask({ task: "调研竞品开户流程是否按设计执行，并输出差异分析" });
  assert.strictEqual(c.workflowKey, "research");
  assert.strictEqual(c.taskType, "research");
  assert.strictEqual(c.taskSubtype, TASK_SUBTYPES.WORKFLOW_AUDIT);
});

test("forced /code overrides research-ish phrasing", () => {
  const c = classifyTask({ task: "/code 帮我重启 nginx" });
  assert.strictEqual(c.workflowKey, "code");
});

test("forced /solution overrides code-ish phrasing", () => {
  const c = classifyTask({ task: "/solution 给一个发布计划" });
  assert.strictEqual(c.workflowKey, "solution");
});

test("semantic router accepts new code/solution outputs", async () => {
  for (const semType of ["code", "solution"]) {
    const semanticClassifier = async () => ({
      taskType: semType,
      confidence: 0.9,
      reasons: ["llm"],
    });
    const c = await classifyTaskWithSemantic(
      { task: "请你帮我评估一下这个方案" },
      { semanticClassifier }
    );
    assert.strictEqual(c.workflowKey, semType);
    assert.ok(c.reasons.includes("semantic_router"));
  }
});

test("no taskType outputs 'qa' or 'debug' anywhere", () => {
  for (const t of [
    "帮我 debug 一下这段代码",
    "qa 这个流程",
    "排障 systemctl",
    "做一个增长方案",
  ]) {
    const c = classifyTask({ task: t });
    assert.notStrictEqual(c.taskType, "debug");
    assert.notStrictEqual(c.taskType, "qa");
    assert.notStrictEqual(c.workflowKey, "debug");
    assert.notStrictEqual(c.workflowKey, "qa");
    assert.notStrictEqual(c.taskSubtype, "debug");
  }
});
