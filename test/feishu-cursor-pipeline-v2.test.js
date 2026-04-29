"use strict";

const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  createFeishuCursorPipelineV2,
} = require("../lib/feishu-cursor/pipeline-v2");
const {
  createInMemoryPipelineState,
} = require("../lib/feishu-cursor/ingestion/in-memory-state");

function buildDeps(overrides) {
  const calls = {
    run: [],
    sentText: [],
    sentReply: [],
    memoryAssemble: [],
    memoryPersist: [],
  };
  const base = {
    runtimeConfig: { groupRequireAtBot: false },
    routing: { enabled: true, direct: true, prefix: "/figma", chatAllowed: () => true },
    state: createInMemoryPipelineState({ dedupTtlMs: 60000 }),
    logger: { log: () => {}, error: () => {} },
    enqueueEvent: () => {},
    shouldSkipGroupMessageWithoutAtBot: () => false,
    sendFeishuTextToChat: async (c, t) => calls.sentText.push([c, t]),
    sendFeishuChatReply: async (c, t) => calls.sentReply.push([c, t]),
    addFeishuMessageReaction: async () => true,
    getBotSelfOpenId: async () => "ou_bot",
    fetchChatMemberOpenIdLines: async () => "",
    getCursorTaskAckMessage: () => "⏳",
    runCursorAdhocPrompt: async (task, opts) => {
      calls.run.push([task, opts]);
      return { code: 0, stdout: "OK", stderr: "", error: null };
    },
    formatCursorAdhocReply: () => "OK",
    appendFeishuTimingToReplyBody: (x) => x,
    augmentTaskWithQuotedParent: async (task) => ({ task, injected: false }),
    normalizeSheetWriteTask: (task) => task,
    augmentTaskWithFeishuAtContext: async (task) => task,
    assembleMemoryContext: async (payload) => {
      calls.memoryAssemble.push(payload || {});
      return { injected: false, task: payload.task };
    },
    persistMemoryTurn: async (payload) => {
      calls.memoryPersist.push(payload || {});
      return { ok: true, turnCount: 1 };
    },
    maybeChainAfterCursor: async () => ({ chained: false }),
    normalizeCursorTask: (task) => task,
    appendFeishuOpenIdMentionHint: (task) => task,
    resolveCursorAgentProfile: (task) => ({ profile: "full", task }),
    isRelayLikeTask: () => false,
    isReportLikeTask: () => false,
    isResearchLikeTask: () => false,
    downloadImage: async () => null,
    downloadResource: async () => null,
    fetchMessage: async () => ({}),
    cleanupFile: () => {},
    describeImage: async () => "",
    extractFileText: async () => "",
    transcribeAudio: async () => "",
    processVideo: async () => "",
    processSticker: () => "",
    ackMode: "reaction",
    ackReactionEmoji: "Typing",
    ackFallbackText: true,
  };
  return { ...base, ...(overrides || {}), calls };
}

describe("pipeline v2", { concurrency: false }, () => {
  beforeEach(() => {
    delete process.env.FEISHU_CURSOR_MEMORY_STORE;
    delete process.env.FEISHU_CURSOR_MEMORY_PROVIDER;
  });

  test("runs full happy path", async () => {
    const deps = buildDeps();
    const run = createFeishuCursorPipelineV2(deps);
    const chatId = `oc_happy_${Date.now()}`;
    const messageId = `m_happy_${Date.now()}`;
    await run({
      sender: { sender_type: "user" },
      message: {
        message_id: messageId,
        chat_id: chatId,
        message_type: "text",
        content: JSON.stringify({ text: "hello" }),
        create_time: "1710000000",
      },
    });
    assert.strictEqual(deps.calls.run.length, 1);
    assert.match(String(deps.calls.run[0][0]), /hello/);
    assert.strictEqual(deps.calls.run[0][1].messageId, messageId);
    assert.strictEqual(deps.calls.sentText.length, 1);
    assert.strictEqual(deps.calls.sentText[0][0], chatId);
    assert.match(String(deps.calls.sentText[0][1]), /已识别：general/);
    assert.strictEqual(deps.calls.sentReply.length, 1);
    assert.strictEqual(deps.calls.memoryAssemble.length, 1);
    assert.strictEqual(deps.calls.memoryAssemble[0].sessionId, deps.calls.run[0][1].sessionId);
    assert.strictEqual(deps.calls.memoryPersist.length, 1);
    assert.strictEqual(deps.calls.memoryPersist[0].sessionId, deps.calls.run[0][1].sessionId);
  });

  test("workflow trace hint can be disabled", async () => {
    process.env.FEISHU_WORKFLOW_TRACE_HINT = "0";
    const deps = buildDeps();
    const run = createFeishuCursorPipelineV2(deps);
    await run({
      sender: { sender_type: "user" },
      message: {
        message_id: "m_hint_off",
        chat_id: "oc_hint_off",
        message_type: "text",
        content: JSON.stringify({ text: "hello" }),
      },
    });
    assert.strictEqual(deps.calls.sentText.length, 0);
    delete process.env.FEISHU_WORKFLOW_TRACE_HINT;
  });

  test("plugin-native mode passes isolated gateway session semantics", async () => {
    const deps = buildDeps({
      runtimeConfig: {
        groupRequireAtBot: false,
        channelRuntimeMode: "plugin-native",
      },
    });
    const run = createFeishuCursorPipelineV2(deps);
    await run({
      sender: { sender_type: "user" },
      message: {
        message_id: "m-plugin",
        chat_id: "oc_plugin",
        message_type: "text",
        content: JSON.stringify({ text: "hello plugin mode" }),
      },
    });

    assert.strictEqual(deps.calls.run.length, 1);
    assert.deepStrictEqual(deps.calls.run[0][1].gatewayRequest, {
      sessionKey: "agent:main:feishu-plugin:oc_plugin",
      idempotencyKey: "feishu-plugin-msg:main:m-plugin",
      channelRuntimeMode: "plugin-native",
    });
  });

  test("prefix miss in prefix mode should not run cursor", async () => {
    const deps = buildDeps({
      routing: {
        enabled: true,
        direct: false,
        prefix: "/figma",
        chatAllowed: () => true,
      },
    });
    const run = createFeishuCursorPipelineV2(deps);
    await run({
      sender: { sender_type: "user" },
      message: {
        message_id: "m2",
        chat_id: "oc_1",
        message_type: "text",
        content: JSON.stringify({ text: "hello" }),
      },
    });
    assert.strictEqual(deps.calls.run.length, 0);
    assert.strictEqual(deps.calls.sentText.length, 1);
    assert.ok(String(deps.calls.sentText[0][1]).includes("/figma"));
  });

  test("prefix miss hint can be disabled", async () => {
    const deps = buildDeps({
      runtimeConfig: { groupRequireAtBot: false, prefixMissHintEnabled: false },
      routing: {
        enabled: true,
        direct: false,
        prefix: "/figma",
        chatAllowed: () => true,
      },
    });
    const run = createFeishuCursorPipelineV2(deps);
    await run({
      sender: { sender_type: "user" },
      message: {
        message_id: "m2b",
        chat_id: "oc_1",
        message_type: "text",
        content: JSON.stringify({ text: "no prefix" }),
      },
    });
    assert.strictEqual(deps.calls.run.length, 0);
    assert.strictEqual(deps.calls.sentText.length, 0);
  });

  test("relay shadow mode should continue to cursor for ambiguous relay", async () => {
    const deps = buildDeps({
      runtimeConfig: {
        groupRequireAtBot: false,
        relayPolicyMode: "shadow",
      },
      isRelayLikeTask: () => true,
    });
    const run = createFeishuCursorPipelineV2(deps);
    const relayChat = `oc_relay_shadow_${Date.now()}`;
    await run({
      sender: { sender_type: "user" },
      message: {
        message_id: "m3",
        chat_id: relayChat,
        message_type: "text",
        mentions: [
          { id: { open_id: "ou_bot" }, name: "小智" },
          { id: { open_id: "ou_u1" }, name: "Atome Card 小龙虾" },
        ],
        content: JSON.stringify({
          text: "@小智 需要你通过 @Atome Card 小龙虾 来问他今天天气如何",
        }),
      },
    });
    assert.strictEqual(deps.calls.run.length, 1);
    assert.strictEqual(deps.calls.sentReply.length, 1);
  });

  test("relay enforce mode may short-circuit simple direct relay", async () => {
    const deps = buildDeps({
      runtimeConfig: {
        groupRequireAtBot: false,
        relayPolicyMode: "enforce",
      },
      isRelayLikeTask: () => true,
    });
    const run = createFeishuCursorPipelineV2(deps);
    await run({
      sender: { sender_type: "user" },
      message: {
        message_id: "m4",
        chat_id: "oc_1",
        message_type: "text",
        mentions: [
          { id: { open_id: "ou_bot" }, name: "小智" },
          { id: { open_id: "ou_u1" }, name: "小王" },
        ],
        content: JSON.stringify({
          text: "请帮我问今天雨大吗",
        }),
      },
    });
    assert.strictEqual(deps.calls.run.length, 0);
    assert.deepStrictEqual(deps.calls.sentReply[0], ["oc_1", "@ou_u1 今天雨大吗？"]);
  });

  test("research doc hook may extend reply body when exportKind set", async () => {
    const prev = process.env.FEISHU_CLOUD_DOC_EXPORT;
    process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
    const deps = buildDeps({
      runtimeConfig: { groupRequireAtBot: false, researchClarifyFirst: false },
      isResearchLikeTask: () => true,
      exportResearchDocHook: async ({ replyBody, exportKind }) => ({
        replyBody:
          exportKind === "research"
            ? `${replyBody}\n\n---\n云文档：https://example.feishu.cn/docx/TOKEN`
            : replyBody,
      }),
    });
    const run = createFeishuCursorPipelineV2(deps);
    await run({
      sender: { sender_type: "user" },
      message: {
        message_id: "m5",
        chat_id: "oc_1",
        message_type: "text",
        content: JSON.stringify({ text: "技术调研 Redis 持久化" }),
        create_time: "1710000000",
      },
    });
    if (prev === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
    else process.env.FEISHU_CLOUD_DOC_EXPORT = prev;
    assert.strictEqual(deps.calls.sentReply.length, 1);
    assert.ok(String(deps.calls.sentReply[0][1]).includes("云文档：https://example.feishu.cn/docx/TOKEN"));
  });

  test("long reply: general task forces exportKind report into doc hook", async () => {
    const prevCloud = process.env.FEISHU_CLOUD_DOC_EXPORT;
    const prevMin = process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS;
    process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
    process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS = "20";
    const kinds = [];
    const longBody = "L".repeat(80);
    const deps = buildDeps({
      formatCursorAdhocReply: () => longBody,
      exportResearchDocHook: async (x) => {
        kinds.push(x.exportKind);
        return { replyBody: x.replyBody };
      },
    });
    const run = createFeishuCursorPipelineV2(deps);
    await run({
      sender: { sender_type: "user" },
      message: {
        message_id: "m-long-doc",
        chat_id: "oc_long_doc_isolated",
        message_type: "text",
        content: JSON.stringify({ text: "hello" }),
        create_time: "1710000000",
      },
    });
    if (prevCloud === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
    else process.env.FEISHU_CLOUD_DOC_EXPORT = prevCloud;
    if (prevMin === undefined) delete process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS;
    else process.env.FEISHU_DOC_EXPORT_LONG_REPLY_MIN_CHARS = prevMin;
    assert.deepStrictEqual(kinds, ["report"]);
  });

  test("doc hook memoryReplyBody：会话记忆存全文，聊天发短回复", async () => {
    const prev = process.env.FEISHU_CLOUD_DOC_EXPORT;
    process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
    const persisted = [];
    const deps = buildDeps({
      runtimeConfig: { groupRequireAtBot: false, researchClarifyFirst: false },
      isResearchLikeTask: () => true,
      persistMemoryTurn: async (x) => {
        persisted.push(x);
        return { ok: true, turnCount: 1 };
      },
      exportResearchDocHook: async ({ replyBody, exportKind }) => {
        if (exportKind !== "research") return { replyBody };
        return { replyBody: "SHORT_SUMMARY_CARD", memoryReplyBody: replyBody };
      },
    });
    const run = createFeishuCursorPipelineV2(deps);
    await run({
      sender: { sender_type: "user" },
      message: {
        message_id: "m6",
        chat_id: "oc_1",
        message_type: "text",
        content: JSON.stringify({ text: "技术调研 Redis 持久化" }),
        create_time: "1710000000",
      },
    });
    if (prev === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
    else process.env.FEISHU_CLOUD_DOC_EXPORT = prev;
    assert.ok(String(deps.calls.sentReply[0][1]).startsWith("SHORT_SUMMARY_CARD"));
    assert.strictEqual(persisted[0] && persisted[0].replyBody, "OK");
  });

  test("research clarify first: state roundtrip then execute prompt on follow-up", async () => {
    const tmp = path.join(os.tmpdir(), `feishu-research-pipe-${Date.now()}.json`);
    process.env.FEISHU_RESEARCH_WORKFLOW_STATE_FILE = tmp;
    try {
      const deps = buildDeps({
        isResearchLikeTask: (t) => /调研/.test(String(t || "")),
        runtimeConfig: {
          groupRequireAtBot: false,
          researchClarifyFirst: true,
          researchWorkflowV2: false,
          researchQualityRepair: false,
        },
      });
      const run = createFeishuCursorPipelineV2(deps);
      await run({
        sender: { sender_type: "user" },
        message: {
          message_id: "mr_a",
          chat_id: "oc_rw_pipe",
          message_type: "text",
          content: JSON.stringify({ text: "技术调研 Redis" }),
        },
      });
      const nAfterClarify = deps.calls.run.length;
      assert.ok(nAfterClarify >= 1);
      assert.match(String(deps.calls.run[0][0]), /先澄清再生成/);
      assert.ok(String(deps.calls.sentReply[0] && deps.calls.sentReply[0][1]).includes("回复选项："));

      const store = JSON.parse(fs.readFileSync(tmp, "utf8"));
      assert.ok(store.chats.oc_rw_pipe);
      assert.strictEqual(store.chats.oc_rw_pipe.phase, "clarify_sent");

      await run({
        sender: { sender_type: "user" },
        message: {
          message_id: "mr_b",
          chat_id: "oc_rw_pipe",
          message_type: "text",
          content: JSON.stringify({ text: "1. 仅开源\n2. 关注持久化" }),
        },
      });
      assert.ok(deps.calls.run.length > nAfterClarify);
      assert.match(
        String(deps.calls.run[nAfterClarify][0]),
        /正式调研与报告生成/
      );

      const store2 = JSON.parse(fs.readFileSync(tmp, "utf8"));
      assert.strictEqual(store2.chats.oc_rw_pipe, undefined);
    } finally {
      delete process.env.FEISHU_RESEARCH_WORKFLOW_STATE_FILE;
      try {
        fs.unlinkSync(tmp);
      } catch (_) {
        /* ignore */
      }
    }
  });

  test("research clarify control: end task should short-circuit and not run cursor again", async () => {
    const tmp = path.join(os.tmpdir(), `feishu-research-end-${Date.now()}.json`);
    process.env.FEISHU_RESEARCH_WORKFLOW_STATE_FILE = tmp;
    try {
      const deps = buildDeps({
        isResearchLikeTask: (t) => /调研/.test(String(t || "")),
        runtimeConfig: {
          groupRequireAtBot: false,
          researchClarifyFirst: true,
          researchWorkflowV2: false,
          researchQualityRepair: false,
        },
      });
      const run = createFeishuCursorPipelineV2(deps);
      await run({
        sender: { sender_type: "user" },
        message: {
          message_id: "mr_end_a",
          chat_id: "oc_rw_end",
          message_type: "text",
          content: JSON.stringify({ text: "技术调研 Redis" }),
        },
      });
      const nAfterClarify = deps.calls.run.length;
      assert.ok(nAfterClarify >= 1);
      await run({
        sender: { sender_type: "user" },
        message: {
          message_id: "mr_end_b",
          chat_id: "oc_rw_end",
          message_type: "text",
          content: JSON.stringify({ text: "结束任务" }),
        },
      });
      assert.strictEqual(deps.calls.run.length, nAfterClarify);
      assert.ok(
        String(deps.calls.sentReply[deps.calls.sentReply.length - 1][1]).includes("已结束本次调研")
      );
    } finally {
      delete process.env.FEISHU_RESEARCH_WORKFLOW_STATE_FILE;
      try {
        fs.unlinkSync(tmp);
      } catch (_) {
        /* ignore */
      }
    }
  });

  test("research workflow v2 invokes runOpenclawGatewayPrompt twice", async () => {
    const deps = buildDeps({
      isResearchLikeTask: () => true,
      runtimeConfig: {
        groupRequireAtBot: false,
        researchClarifyFirst: false,
        researchWorkflowV2: true,
        researchCrawlerAgentId: "crawl_a",
        researchAnalystAgentId: "analyst_b",
        researchQualityRepair: false,
        gatewayHeavyAgentId: "cursor",
        gatewayLightAgentId: "main",
      },
      runCursorAdhocPrompt: async (task, opts) => {
        deps.calls.run.push([task, opts]);
        const n = deps.calls.run.length;
        if (n === 1) {
          return {
            code: 0,
            stdout: "## 检索摘要\n- s\n## 资料条目列表\n### z\n- 标题：t  - 链接：https://ex.example",
            stderr: "",
            error: null,
          };
        }
        const body = [
          "# T",
          "## 0. 用户意图与调研范围",
          "a\nb\nc",
          "## 1. 执行摘要",
          "a\nb\nc",
          "## 2. 背景与定义",
          "### 2.1 核心概念",
          "### 2.2 问题背景",
          "abc",
          "## 3. 核心机制 / 判断框架",
          "abc",
          "## 4. 主流方案 / 实现对比",
          "| x | y |\n| --- | --- |\n| 1 | 2 |",
          "## 5. 优劣势、风险与适用场景",
          "abc",
          "## 6. 现实案例 / 生产落地",
          "abc",
          "## 7. 结论与建议",
          "### 7.1 结论",
          "### 7.2 对用户当前场景的建议",
          "### 7.3 建议优先级（高 / 中 / 低）",
          "abc",
          "## 参考资料",
          "r",
          "x".repeat(1900),
        ].join("\n");
        return { code: 0, stdout: body, stderr: "", error: null };
      },
    });
    const run = createFeishuCursorPipelineV2(deps);
    await run({
      sender: { sender_type: "user" },
      message: {
        message_id: "mr_v2",
        chat_id: "oc_v2",
        message_type: "text",
        content: JSON.stringify({ text: "调研消息队列选型" }),
      },
    });
    assert.strictEqual(deps.calls.run.length, 2);
    assert.match(String(deps.calls.run[0][1].sessionId || ""), /^agent:crawl_a:/);
    assert.match(String(deps.calls.run[1][1].sessionId || ""), /^agent:analyst_b:/);
    assert.ok(deps.calls.memoryPersist.length >= 1);
    const lastPersist = deps.calls.memoryPersist[deps.calls.memoryPersist.length - 1];
    assert.ok(lastPersist.cursorResult && lastPersist.cursorResult.runtimeRunTrace);
    assert.strictEqual(lastPersist.cursorResult.runtimeRunTrace.source, "runtime");
  });

  test("PR1 synthetic: hard fresh memory ignore + telemetry + sessionResetHint", async () => {
    const telemetryEvents = [];
    const deps = buildDeps({
      telemetry: {
        emit: (name, payload) => telemetryEvents.push({ name, payload }),
      },
      isResearchLikeTask: () => false,
    });
    const run = createFeishuCursorPipelineV2(deps);
    const cid = `oc_pr1_hard_${Date.now()}`;
    const mid = `om_pr1_${Date.now()}`;
    await run({
      sender: { sender_type: "user" },
      message: {
        message_id: mid,
        chat_id: cid,
        message_type: "text",
        content: JSON.stringify({ text: "新任务，帮我做一个新产品灰度发布方案" }),
      },
    });
    const fresh = telemetryEvents.find((e) => e.name === "conversation_fresh_reset");
    assert.ok(fresh);
    assert.strictEqual(fresh.payload.reason, "fresh_hard");
    assert.strictEqual(deps.calls.memoryAssemble[0].memoryMode, "ignore");
    assert.ok(deps.calls.memoryAssemble[0].conversationEpochKey);
    const gr = deps.calls.run[0][1].gatewayRequest;
    assert.strictEqual(gr && gr.sessionResetHint, true);
  });

  test("PR1 synthetic: weak fresh with clarify_sent clears state + telemetry", async () => {
    const tmpRw = path.join(os.tmpdir(), `rw-pr1w-${Date.now()}.json`);
    process.env.FEISHU_RESEARCH_WORKFLOW_STATE_FILE = tmpRw;
    const {
      researchWorkflowStateKey,
      markResearchClarifySent,
      loadResearchWorkflowState,
    } = require("../lib/feishu-cursor/research-workflow-state");
    const cid = `oc_pr1_weak_${Date.now()}`;
    const rwKey = researchWorkflowStateKey(cid, "");
    markResearchClarifySent(rwKey, { originalUserTask: "u0", originalTask: "t0" });
    assert.ok(loadResearchWorkflowState(rwKey));
    const telemetryEvents = [];
    const deps = buildDeps({
      telemetry: {
        emit: (name, payload) => telemetryEvents.push({ name, payload }),
      },
      isResearchLikeTask: () => false,
    });
    const run = createFeishuCursorPipelineV2(deps);
    await run({
      sender: { sender_type: "user" },
      message: {
        message_id: `om_w_${Date.now()}`,
        chat_id: cid,
        message_type: "text",
        content: JSON.stringify({ text: "另外做一个灰度发布方案" }),
      },
    });
    delete process.env.FEISHU_RESEARCH_WORKFLOW_STATE_FILE;
    try {
      fs.unlinkSync(tmpRw);
    } catch (_) {
      /* ignore */
    }
    const fresh = telemetryEvents.find((e) => e.name === "conversation_fresh_reset");
    assert.ok(fresh);
    assert.strictEqual(fresh.payload.reason, "fresh_weak_with_evidence");
    assert.strictEqual(loadResearchWorkflowState(rwKey), null);
  });

  test("PR1 synthetic: followup weak does not fire conversation_fresh_reset", async () => {
    const telemetryEvents = [];
    const deps = buildDeps({
      telemetry: {
        emit: (name, payload) => telemetryEvents.push({ name, payload }),
      },
      isResearchLikeTask: () => false,
    });
    const run = createFeishuCursorPipelineV2(deps);
    await run({
      sender: { sender_type: "user" },
      message: {
        message_id: `om_fu_${Date.now()}`,
        chat_id: `oc_pr1_fu_${Date.now()}`,
        message_type: "text",
        content: JSON.stringify({ text: "继续优化上一版" }),
      },
    });
    assert.ok(!telemetryEvents.some((e) => e.name === "conversation_fresh_reset"));
  });
});
