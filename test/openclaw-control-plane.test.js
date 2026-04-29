"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert");

const { planOpenclawExecution } = require("../lib/openclaw-control-plane/request-planner");
const { resolveOpenclawResultPolicy } = require("../lib/openclaw-control-plane/result-policy");
const { buildFeishuTaskEnvelope } = require("../lib/feishu-channel/models/feishu-task-envelope");
const {
  normalizeStructuredResult,
  selectReplyTextFromStructuredResult,
} = require("../lib/openclaw-control-plane/structured-result");
const { resolveGatewayRoute } = require("../lib/openclaw-control-plane/route-policy");

describe("openclaw control plane wrappers", () => {
  test("plans prompt, runner and dispatch with stable interfaces", () => {
    const envelope = buildFeishuTaskEnvelope({
      extracted: { chatId: "oc_x", messageId: "m_x", messageType: "text" },
      data: { message: { chat_id: "oc_x", message_id: "m_x" } },
    });
    const out = planOpenclawExecution({
      envelope,
      task: "写个报告",
      userTask: "写个报告",
      messageType: "text",
      message: { mentions: [] },
      botOpenId: "ou_bot",
      routing: { direct: true, prefix: "/figma" },
      forceFull: false,
      runtimeConfig: {},
      isRelayLikeTask: () => false,
      isReportLikeTask: () => true,
      isResearchLikeTask: () => false,
      normalizeCursorTask: (s) => `${s}\n\nnormalized`,
      appendFeishuOpenIdMentionHint: (s) => s,
      resolveCursorAgentProfile: (task) => ({ profile: "full", task }),
      parentContextInjected: false,
    });

    assert.strictEqual(out.classification.taskType, "report");
    assert.strictEqual(out.prompt.profile, "full");
    assert.strictEqual(out.runner.runnerType, "openclaw");
    assert.strictEqual(out.dispatch.route.routeClass, "heavy");
    assert.strictEqual(out.dispatch.route.agentId, "cursor");
    assert.strictEqual(out.dispatch.opts.sessionId, "agent:cursor:feishu:oc_x");
    assert.strictEqual(
      out.dispatch.opts.gatewayRequest.idempotencyKey,
      "feishu-msg:cursor:m_x"
    );
    assert.match(out.dispatch.task, /normalized/);
  });

  test("light general chat stays on light agent route", () => {
    const envelope = buildFeishuTaskEnvelope({
      extracted: { chatId: "oc_light", messageId: "m_light", messageType: "text" },
      data: { message: { chat_id: "oc_light", message_id: "m_light" } },
    });
    const out = planOpenclawExecution({
      envelope,
      task: "你好，帮我简单解释一下 JWT 是什么",
      userTask: "你好，帮我简单解释一下 JWT 是什么",
      messageType: "text",
      message: { mentions: [] },
      botOpenId: "ou_bot",
      routing: { direct: true, prefix: "/figma" },
      forceFull: false,
      runtimeConfig: {
        gatewayHeavyAgentId: "cursor",
        gatewayLightAgentId: "main",
      },
      isRelayLikeTask: () => false,
      isReportLikeTask: () => false,
      isResearchLikeTask: () => false,
      normalizeCursorTask: (s) => s,
      appendFeishuOpenIdMentionHint: (s) => s,
      resolveCursorAgentProfile: (task) => ({ profile: "full", task }),
      parentContextInjected: false,
    });

    assert.strictEqual(out.classification.taskType, "general");
    assert.strictEqual(out.dispatch.route.routeClass, "light");
    assert.strictEqual(out.dispatch.route.agentId, "main");
    assert.strictEqual(out.dispatch.opts.sessionId, "agent:main:feishu:oc_light");
    assert.strictEqual(
      out.dispatch.opts.gatewayRequest.idempotencyKey,
      "feishu-msg:main:m_light"
    );
  });

  test("classificationMerge augments planner output", () => {
    const envelope = buildFeishuTaskEnvelope({
      extracted: { chatId: "oc_x", messageId: "m_x", messageType: "text" },
      data: { message: { chat_id: "oc_x", message_id: "m_x" } },
    });
    const out = planOpenclawExecution({
      envelope,
      task: "hello",
      userTask: "hello",
      messageType: "text",
      message: { mentions: [] },
      botOpenId: "ou_bot",
      routing: { direct: true, prefix: "/figma" },
      forceFull: false,
      runtimeConfig: {},
      classificationMerge: {
        taskType: "research",
        stage: "execute",
        qaContext: "用户补充：只看开源方案",
        requiresTooling: true,
        requiresFullRunner: true,
        reasons: ["merged"],
      },
      isRelayLikeTask: () => false,
      isReportLikeTask: () => false,
      isResearchLikeTask: () => false,
      normalizeCursorTask: (s) => s,
      appendFeishuOpenIdMentionHint: (s) => s,
      resolveCursorAgentProfile: (task) => ({ profile: "full", task }),
      parentContextInjected: false,
    });

    assert.strictEqual(out.classification.taskType, "research");
    assert.strictEqual(out.classification.stage, "execute");
    assert.strictEqual(out.classification.qaContext, "用户补充：只看开源方案");
    assert.ok(out.classification.reasons.includes("merged"));
    assert.strictEqual(out.dispatch.route.routeClass, "heavy");
  });

  test("session namespace from runtimeConfig is wired into dispatch", () => {
    const envelope = buildFeishuTaskEnvelope({
      extracted: { chatId: "oc_x", messageId: "m_x", messageType: "text" },
      data: { message: { chat_id: "oc_x", message_id: "m_x" } },
    });
    const out = planOpenclawExecution({
      envelope,
      task: "写个报告",
      userTask: "写个报告",
      messageType: "text",
      message: { mentions: [] },
      botOpenId: "ou_bot",
      routing: { direct: true, prefix: "/figma" },
      forceFull: false,
      runtimeConfig: { openclawFeishuSessionNamespace: "feishu-bot" },
      isRelayLikeTask: () => false,
      isReportLikeTask: () => true,
      isResearchLikeTask: () => false,
      normalizeCursorTask: (s) => `${s}\n\nnormalized`,
      appendFeishuOpenIdMentionHint: (s) => s,
      resolveCursorAgentProfile: (task) => ({ profile: "full", task }),
      parentContextInjected: false,
    });

    assert.strictEqual(out.dispatch.opts.sessionId, "agent:cursor:feishu:feishu-bot:oc_x");
    assert.strictEqual(
      out.dispatch.opts.gatewayRequest.idempotencyKey,
      "feishu-msg:cursor:feishu-bot:m_x"
    );
  });

  test("result policy resolves export kind from classification-aware hook", () => {
    const prev = process.env.FEISHU_CLOUD_DOC_EXPORT;
    process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
    const out = resolveOpenclawResultPolicy({
      userTask: "技术调研 Redis 持久化",
      classification: { taskType: "research" },
      isResearchLikeTask: () => true,
      isReportLikeTask: () => false,
    });
    if (prev === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
    else process.env.FEISHU_CLOUD_DOC_EXPORT = prev;
    assert.strictEqual(out.exportKind, "research");
  });

  test("result policy suppresses export when structured result already has feishu doc", () => {
    const prev = process.env.FEISHU_CLOUD_DOC_EXPORT;
    process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
    const out = resolveOpenclawResultPolicy({
      userTask: "技术调研 Redis 持久化",
      classification: { taskType: "research" },
      structuredResult: {
        artifacts: [{ kind: "feishu_doc", url: "https://example.feishu.cn/docx/abc" }],
      },
      isResearchLikeTask: () => true,
      isReportLikeTask: () => false,
    });
    if (prev === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
    else process.env.FEISHU_CLOUD_DOC_EXPORT = prev;
    assert.strictEqual(out.exportKind, null);
    assert.strictEqual(out.hasFeishuDocArtifact, true);
  });
});

describe("structured result protocol", () => {
  test("normalizes gateway structured payload and prefers summary", () => {
    const structured = normalizeStructuredResult({
      code: 0,
      runId: "run_1",
      waitPayload: {
        structuredResult: {
          status: "succeeded",
          summary: "摘要",
          executor: "cursor",
          artifacts: [{ kind: "markdown", path: "docs/research/x.md" }],
          replyHints: { preferSummaryOnly: true },
        },
      },
      historyPayload: {
        messages: [
          { role: "assistant", content: [{ type: "text", text: "fallback text" }] },
        ],
      },
      fallbackText: "fallback text",
    });
    assert.strictEqual(structured.runId, "run_1");
    assert.strictEqual(structured.status, "succeeded");
    assert.strictEqual(structured.summary, "摘要");
    assert.strictEqual(structured.executor, "cursor");
    assert.deepStrictEqual(structured.replyHints, { preferSummaryOnly: true });
    assert.strictEqual(selectReplyTextFromStructuredResult(structured, "fallback text"), "摘要");
  });
});

describe("gateway route policy", () => {
  test("promotes code-like general requests to heavy route", () => {
    const route = resolveGatewayRoute({
      task: "请帮我修复登录接口并补测试",
      classification: {
        taskType: "general",
        requiresTooling: false,
        requiresFullRunner: false,
        reasons: [],
      },
      runtimeConfig: {
        gatewayHeavyAgentId: "cursor",
        gatewayLightAgentId: "main",
      },
    });

    assert.strictEqual(route.routeClass, "heavy");
    assert.strictEqual(route.agentId, "cursor");
    assert.ok(route.reasonCodes.includes("heavy_task_regex"));
  });
});
