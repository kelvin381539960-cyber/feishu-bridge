"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");

const {
  checkRoutingEligibility,
  resolveTaskAfterRouting,
} = require("../lib/feishu-cursor/policies/routing-policy");
const {
  buildRelayDecision,
  buildDeterministicRelayReply,
  sanitizeRelayReplyBody,
} = require("../lib/feishu-cursor/policies/relay-policy");
const {
  buildPromptText,
  resolvePromptRequest,
  resolveEffectiveResearchStage,
} = require("../lib/feishu-cursor/policies/prompt-policy");
const {
  classifyTask,
  classifyTaskWithSemantic,
} = require("../lib/feishu-cursor/policies/task-classifier");
const {
  evaluateSafetyPolicy,
} = require("../lib/feishu-cursor/policies/safety-policy");

describe("routing policy", () => {
  test("eligibility and task routing", () => {
    const r = { enabled: true, direct: false, prefix: "/figma", chatAllowed: () => true };
    assert.deepStrictEqual(
      checkRoutingEligibility(r, { chatId: "oc_1", text: "/figma hi" }),
      { ok: true }
    );
    assert.strictEqual(resolveTaskAfterRouting(r, "hi").ok, false);
    assert.deepStrictEqual(resolveTaskAfterRouting(r, "/figma hi"), {
      ok: true,
      task: "hi",
    });
  });
});

describe("relay policy", () => {
  test("deterministic relay uses explicit enforce mode", () => {
    const isRelay = () => true;
    const msg = {
      mentions: [
        { id: { open_id: "ou_bot" }, name: "小智" },
        { id: { open_id: "ou_u1" }, name: "小王" },
      ],
    };
    const decision = buildRelayDecision(
      "请帮我问今天雨大吗",
      msg,
      "ou_bot",
      isRelay,
      "enforce"
    );
    assert.strictEqual(decision.shouldShortCircuit, true);
    assert.strictEqual(decision.reason, "simple_direct_relay");
    const body = buildDeterministicRelayReply(
      "请帮我问今天雨大吗",
      msg,
      "ou_bot",
      isRelay,
      "enforce"
    );
    assert.strictEqual(body, "@ou_u1 今天雨大吗？");
    assert.strictEqual(
      buildDeterministicRelayReply("请帮我问今天雨大吗", msg, "ou_bot", isRelay),
      ""
    );
    const sanitized = sanitizeRelayReplyBody(
      "@小智 通过小王问一下",
      "@小智 帮忙转述",
      msg,
      "ou_bot",
      isRelay
    );
    assert.strictEqual(sanitized, "请通过小王问一下");
  });

  test("relay with connector and pronoun should not short-circuit", () => {
    const msg = {
      mentions: [
        { id: { open_id: "ou_bot" }, name: "小智" },
        { id: { open_id: "ou_u1" }, name: "Atome Card 小龙虾" },
      ],
    };
    const decision = buildRelayDecision(
      "@小智 需要你通过 @Atome Card 小龙虾 来问他今天天气如何",
      msg,
      "ou_bot",
      () => true,
      "enforce"
    );
    assert.strictEqual(decision.shouldShortCircuit, false);
    assert.strictEqual(decision.reason, "relay_ambiguous_pronoun");
  });

  test("classifier relay and relay-policy stay consistent", () => {
    const { isRelayLikeTask } = require("../lib/feishu-cursor-route");
    const task = "@小智 帮我问一下 @小王 这个问题";
    const classified = classifyTask({
      task,
      messageType: "text",
      isRelayLikeTask,
      isReportLikeTask: () => false,
      isResearchLikeTask: () => false,
    });
    assert.strictEqual(classified.taskType, "relay");

    const msg = {
      mentions: [
        { id: { open_id: "ou_bot" }, name: "小智" },
        { id: { open_id: "ou_u1" }, name: "小王" },
      ],
    };
    const decision = buildRelayDecision(task, msg, "ou_bot", isRelayLikeTask, "shadow");
    assert.strictEqual(decision.isRelayTask, true);
  });
});

describe("task classifier", () => {
  test("1. 帮我写一个 WalletConnect 支付失败提示页 PRD", () => {
    const res = classifyTask({ task: "帮我写一个 WalletConnect 支付失败提示页 PRD" });
    assert.strictEqual(res.taskType, "prd");
    assert.strictEqual(res.requiresFullRunner, true);
  });

  test("2. 输出一份 KYC 拒绝页需求文档", () => {
    const res = classifyTask({ task: "输出一份 KYC 拒绝页需求文档" });
    assert.strictEqual(res.taskType, "prd");
  });

  test("3. 帮我调研 RedotPay 的 KYC 流程", () => {
    const res = classifyTask({ task: "帮我调研 RedotPay 的 KYC 流程" });
    assert.strictEqual(res.taskType, "research");
    assert.strictEqual(res.needsClarification, false);
  });

  test("4. 帮我调研 RedotPay 的 KYC 流程，并输出一份 PRD", () => {
    const res = classifyTask({ task: "帮我调研 RedotPay 的 KYC 流程，并输出一份 PRD" });
    assert.strictEqual(res.taskType, "prd");
    assert.ok(res.reasons.includes("research_as_input"));
  });

  test("5. 根据这个飞书表格生成 PRD", () => {
    const res = classifyTask({ task: "根据这个飞书表格生成 PRD：https://xxx.feishu.cn/sheets/abc" });
    assert.strictEqual(res.taskType, "prd");
    assert.ok(res.reasons.includes("url_as_input"));
    assert.strictEqual(res.requiresTooling, true);
  });

  test("6. 帮我看看这个飞书表格", () => {
    const res = classifyTask({ task: "帮我看看这个飞书表格：https://xxx.feishu.cn/sheets/abc" });
    assert.strictEqual(res.taskType, "sheet_read");
  });

  test("7. 把这些内容写入这个飞书表格", () => {
    const res = classifyTask({ task: "把这些内容写入这个飞书表格：https://xxx.feishu.cn/sheets/abc" });
    assert.strictEqual(res.taskType, "sheet_write");
  });

  test("8. 检查这个 workflow 有没有按设计执行", () => {
    const res = classifyTask({ task: "检查这个 workflow 有没有按设计执行" });
    assert.strictEqual(res.taskType, "workflow_audit");
    assert.strictEqual(res.requiresFullRunner, true);
  });
  test("8b. 调研类任务保留 research workflow，仅附加 workflow_audit subtype", () => {
    const res = classifyTask({ task: "调研主流竞品 App 的申卡流程是否按设计执行，并分析差异" });
    assert.strictEqual(res.workflowKey, "research");
    assert.strictEqual(res.taskType, "research");
    assert.strictEqual(res.taskSubtype, "workflow_audit");
  });


  test("9. 帮我问一下张三这个问题", () => {
    const res = classifyTask({ task: "帮我问一下张三这个问题" });
    assert.strictEqual(res.taskType, "relay");
    assert.strictEqual(res.requiresFullRunner, true);
  });

  test("10. 帮我问一下这个问题", () => {
    const res = classifyTask({ task: "帮我问一下这个问题" });
    assert.strictEqual(res.taskType, "general");
  });

  test("10b. 礼貌词 + 泛指问题不应误判为 relay", () => {
    const res = classifyTask({ task: "麻烦帮我转述一下这个问题" });
    assert.strictEqual(res.taskType, "general");
  });

  test("11. 这个是什么意思", () => {
    const res = classifyTask({ task: "这个是什么意思" });
    assert.strictEqual(res.taskType, "general");
  });

  test("12. classifyTaskWithSemantic 命中并提升", async () => {
    const input = { task: "帮我分析一下目前的竞品方案" };
    const semanticClassifier = async () => ({ taskType: "prd", confidence: 0.85, reasons: ["llm"] });
    const res = await classifyTaskWithSemantic(input, { semanticClassifier });
    assert.strictEqual(res.taskType, "prd");
    assert.ok(res.reasons.includes("semantic_router"));
  });

  test("13. classifyTaskWithSemantic fallback 到规则", async () => {
    const input = { task: "评估这个需求" }; // 命中 general
    const semanticClassifier = async () => ({ taskType: "prd", confidence: 0.6 });
    const res = await classifyTaskWithSemantic(input, { semanticClassifier });
    assert.strictEqual(res.taskType, "general");
  });

  test("14. 命中 sheet_read 不调用 semanticClassifier", async () => {
    const input = { task: "看看这个表 https://xxx.feishu.cn/sheets/abc" };
    let called = false;
    const semanticClassifier = async () => { called = true; return { taskType: "prd", confidence: 0.99 }; };
    const res = await classifyTaskWithSemantic(input, { semanticClassifier });
    assert.strictEqual(res.taskType, "sheet_read");
    assert.strictEqual(called, false);
  });

  test("14b. semantic relay pronoun-only should require clarification", async () => {
    const input = { task: "这个需求他能处理吗，请你帮我判断" };
    const semanticClassifier = async () => ({ taskType: "relay", confidence: 0.92 });
    const res = await classifyTaskWithSemantic(input, { semanticClassifier });
    assert.strictEqual(res.taskType, "relay");
    assert.strictEqual(res.needsClarification, true);
  });

  test("classifies report when isReportLikeTask is wired", () => {
    const { isReportLikeTask } = require("../lib/feishu-cursor-route");
    const r = classifyTask({
      task: "输出报告 本周数据",
      messageType: "text",
      isRelayLikeTask: () => false,
      isReportLikeTask,
      isResearchLikeTask: () => false,
    });
    assert.strictEqual(r.taskType, "report");
  });
});

describe("safety policy", () => {
  test("interactive cards remain sandboxed", () => {
    const safety = evaluateSafetyPolicy({
      classification: { taskType: "interactive_card" },
      messageType: "interactive",
    });
    assert.strictEqual(safety.permissionMode, "deny");
    assert.strictEqual(safety.cleanCwd, true);
    assert.strictEqual(safety.profileOverride, "fast");
  });
});

describe("prompt policy", () => {
  test("interactive message forces fast and deny permission", () => {
    const classification = { taskType: "interactive_card" };
    const safety = {
      permissionMode: "deny",
      cleanCwd: true,
      profileOverride: "fast",
    };
    const out = resolvePromptRequest({
      task: "hello",
      routing: { direct: true },
      forceFull: true,
      messageType: "interactive",
      classification,
      safety,
      normalizeCursorTask: (s) => s,
      appendFeishuOpenIdMentionHint: (s) => s,
      resolveCursorAgentProfile: () => ({ profile: "full", task: "hello" }),
    });
    assert.strictEqual(out.profile, "fast");
    assert.strictEqual(out.permissionMode, "deny");
    assert.strictEqual(out.cleanCwd, true);
  });

  test("relay prompt text warns on ambiguity instead of defaulting pronouns", () => {
    const text = buildPromptText("请通过小王问他今天天气如何", {
      taskType: "relay",
    });
    assert.match(text, /指代不清/);
    assert.doesNotMatch(text, /默认该代词指向/);
  });

  test("research clarify requires at least one question in spec", () => {
    const out = resolvePromptRequest({
      task: "调研 Redis",
      routing: { direct: true },
      forceFull: false,
      messageType: "text",
      classification: { taskType: "research", stage: "clarify" },
      safety: {},
      normalizeCursorTask: (s) => s,
      appendFeishuOpenIdMentionHint: (s) => s,
      resolveCursorAgentProfile: (t) => ({ profile: "full", task: t }),
    });
    assert.strictEqual(out.expectedOutput.kind, "clarification_questions");
    assert.strictEqual(out.expectedOutput.minQuestions, 1);
    assert.strictEqual(resolveEffectiveResearchStage({ taskType: "research", stage: "execute" }), "execute");
  });
});
