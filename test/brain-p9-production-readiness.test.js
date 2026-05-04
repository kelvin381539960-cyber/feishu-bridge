"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert");

const { createFeishuCursorPipelineV2 } = require("../lib/feishu-cursor/pipeline-v2");
const { createInMemoryPipelineState } = require("../lib/feishu-cursor/ingestion/in-memory-state");
const { createFeatureFlags, resolveFeatureFlags } = require("../lib/brain/runtime/feature-flags");

function flushAsyncPersist() {
  return new Promise((resolve) => setImmediate(resolve));
}

function textEvent({ chatId, messageId, text }) {
  return {
    sender: { sender_type: "user" },
    message: {
      message_id: messageId,
      chat_id: chatId,
      message_type: "text",
      mentions: [],
      content: JSON.stringify({ text }),
      create_time: "1710000000",
    },
  };
}

function buildHarness(overrides) {
  const o = overrides || {};
  const telemetry = [];
  const loggerCalls = { log: [], error: [], warn: [] };
  const calls = {
    sentText: [],
    sentReply: [],
    reactions: [],
    executor: [],
    memoryAssemble: [],
    memoryPersist: [],
    legacy: [],
  };

  const deps = {
    runtimeConfig: {
      groupRequireAtBot: false,
      ...(o.runtimeConfig || {}),
    },
    featureFlags: o.featureFlags,
    legacyPipeline: o.legacyPipeline
      ? async (data) => {
          calls.legacy.push(data);
          return o.legacyPipeline(data);
        }
      : undefined,
    routing: {
      enabled: true,
      direct: true,
      prefix: "/figma",
      chatAllowed: () => true,
      ...(o.routing || {}),
    },
    state: createInMemoryPipelineState({ dedupTtlMs: 60000, mergeDebounceMs: 5 }),
    taskQueue: {
      mode: "inline",
      enqueue: async (fn) => ({
        result: await fn(),
        metadata: {
          mode: "inline",
          queueWaitMs: 0,
          queueDepth: 0,
          startedAt: Date.now(),
          finishedAt: Date.now(),
        },
      }),
    },
    telemetry: {
      emit: (name, payload) => telemetry.push({ name, payload }),
    },
    logger: {
      log: (...args) => loggerCalls.log.push(args),
      error: (...args) => loggerCalls.error.push(args),
      warn: (...args) => loggerCalls.warn.push(args),
    },
    enqueueEvent: () => {},
    shouldSkipGroupMessageWithoutAtBot: () => false,
    sendFeishuTextToChat: async (chatId, text) => {
      calls.sentText.push({ chatId, text });
      return true;
    },
    sendFeishuChatReply: async (chatId, text) => {
      calls.sentReply.push({ chatId, text });
      return true;
    },
    addFeishuMessageReaction: async (messageId, emoji) => {
      calls.reactions.push({ messageId, emoji });
      return true;
    },
    getBotSelfOpenId: async () => "ou_fake_bot",
    fetchChatMemberOpenIdLines: async () => [],
    getCursorTaskAckMessage: () => "⏳ 已收到，正在执行…",
    runCursorAdhocPrompt: async (task, opts) => {
      calls.executor.push({ task, opts });
      return { code: 0, stdout: o.stdout || "P9_OK", stderr: "", error: null };
    },
    formatCursorAdhocReply: (r) => (r && r.code !== 0 ? `ERR:${r.stderr || r.stdout || "failed"}` : `OK:${r.stdout || ""}`),
    appendFeishuTimingToReplyBody: (body) => body,
    augmentTaskWithQuotedParent: async (task) => ({ task, injected: false }),
    normalizeSheetWriteTask: (task) => task,
    augmentTaskWithFeishuAtContext: async (task) => task,
    assembleMemoryContext: async (payload) => {
      calls.memoryAssemble.push(payload);
      if (o.memoryThrow) throw new Error("memory boom");
      if (o.memoryInject) {
        return { injected: true, task: `${payload.task}\n\n[MEMORY] injected`, tokenUsage: { totalTokens: 3 } };
      }
      return null;
    },
    persistMemoryTurn: async (payload) => {
      calls.memoryPersist.push(payload);
      return { ok: true, turnCount: 1 };
    },
    bumpConversationEpoch: () => {},
    getLastTurnMetaForFresh: () => null,
    maybeChainAfterCursor: async () => ({ chained: false }),
    normalizeCursorTask: (task) => task,
    appendFeishuOpenIdMentionHint: (task) => task,
    resolveCursorAgentProfile: (task) => ({ profile: "full", task }),
    isRelayLikeTask: () => false,
    isReportLikeTask: () => false,
    isResearchLikeTask: o.isResearchLikeTask || (() => false),
    selectWorkflowPlugin: o.selectWorkflowPlugin,
    exportResearchDocHook: async () => null,
    downloadImage: async () => null,
    downloadResource: async () => null,
    fetchMessage: async () => null,
    cleanupFile: async () => {},
    describeImage: async () => "",
    extractFileText: async () => "",
    transcribeAudio: async () => "",
    processVideo: async () => "",
    processSticker: () => "",
    ackMode: "reaction",
    ackReactionEmoji: "Typing",
    ackFallbackText: true,
  };

  return {
    deps,
    run: createFeishuCursorPipelineV2(deps),
    calls,
    telemetry,
    loggerCalls,
  };
}

describe("brain P9 production readiness", { concurrency: false }, () => {
  test("feature flags resolve env, runtime config and runtime override", () => {
    const flags = resolveFeatureFlags({
      env: { FEISHU_BRAIN_MEMORY: "0", FEISHU_BRAIN_WORKFLOW_PLUGINS: "1" },
      runtimeConfig: { featureFlags: { memory: true, outputPlugins: false } },
      overrides: { workflowPlugins: false },
    });

    assert.strictEqual(flags.newKernel, true);
    assert.strictEqual(flags.memory, true);
    assert.strictEqual(flags.workflowPlugins, false);
    assert.strictEqual(flags.outputPlugins, false);
    assert.strictEqual(flags.observability, false);

    const mutable = createFeatureFlags({ overrides: { memory: false } });
    assert.strictEqual(mutable.isEnabled("memory"), false);
    assert.strictEqual(mutable.setOverride("memory", true), true);
    assert.strictEqual(mutable.isEnabled("memory"), true);
  });

  test("memory flag off skips memory and preserves executor reply", async () => {
    const h = buildHarness({
      featureFlags: createFeatureFlags({ overrides: { memory: false } }),
      stdout: "NO_MEMORY_OK",
    });

    await h.run(textEvent({ chatId: "oc_p9_mem_off", messageId: "om_p9_mem_off", text: "hello" }));
    await flushAsyncPersist();

    assert.strictEqual(h.calls.executor.length, 1);
    assert.strictEqual(h.calls.memoryAssemble.length, 0);
    assert.strictEqual(h.calls.memoryPersist.length, 0);
    assert.strictEqual(h.calls.sentReply.length, 1);
    assert.match(String(h.calls.sentReply[0].text), /OK:NO_MEMORY_OK/);
    assert.ok(h.telemetry.some((e) => e.name === "feature_flag_disabled" && e.payload.flag === "memory"));
  });

  test("workflow flag off falls back to original execution", async () => {
    const h = buildHarness({
      featureFlags: createFeatureFlags({ overrides: { workflowPlugins: false } }),
      selectWorkflowPlugin: () => ({ run: async () => ({ type: "override", result: { code: 0, stdout: "PLUGIN_SHOULD_NOT_RUN" } }) }),
      stdout: "WORKFLOW_FALLBACK_OK",
    });

    await h.run(textEvent({ chatId: "oc_p9_wf_off", messageId: "om_p9_wf_off", text: "hello workflow" }));
    await flushAsyncPersist();

    assert.strictEqual(h.calls.executor.length, 1);
    assert.match(String(h.calls.sentReply[0].text), /OK:WORKFLOW_FALLBACK_OK/);
    assert.ok(h.telemetry.some((e) => e.name === "feature_flag_disabled" && e.payload.flag === "workflowPlugins"));
  });

  test("new kernel off delegates to legacy pipeline without touching new path", async () => {
    const h = buildHarness({
      featureFlags: createFeatureFlags({ overrides: { newKernel: false } }),
      legacyPipeline: async () => ({ ok: true, mode: "legacy" }),
    });

    const ret = await h.run(textEvent({ chatId: "oc_p9_rollback", messageId: "om_p9_rollback", text: "hello rollback" }));
    await flushAsyncPersist();

    assert.deepStrictEqual(ret, { ok: true, mode: "legacy" });
    assert.strictEqual(h.calls.legacy.length, 1);
    assert.strictEqual(h.calls.executor.length, 0);
    assert.strictEqual(h.calls.memoryAssemble.length, 0);
    assert.ok(h.telemetry.some((e) => e.name === "rollback_legacy_pipeline"));
  });

  test("workflow plugin throw is logged and reply still succeeds", async () => {
    const h = buildHarness({
      selectWorkflowPlugin: () => ({ run: async () => { throw new Error("plugin boom"); } }),
      stdout: "PLUGIN_FAILSAFE_OK",
    });

    await h.run(textEvent({ chatId: "oc_p9_plugin_throw", messageId: "om_p9_plugin_throw", text: "hello plugin" }));
    await flushAsyncPersist();

    assert.strictEqual(h.calls.executor.length, 1);
    assert.strictEqual(h.calls.sentReply.length, 1);
    assert.match(String(h.calls.sentReply[0].text), /OK:PLUGIN_FAILSAFE_OK/);
    assert.ok(h.loggerCalls.error.some((args) => String(args[0]).includes("[workflow-plugin] failed")));
    assert.ok(h.telemetry.some((e) => e.name === "plugin_execution" && e.payload.status === "error"));
  });

  test("observability flag on emits stage latency and memory token usage", async () => {
    const h = buildHarness({
      featureFlags: createFeatureFlags({ overrides: { observability: true } }),
      memoryInject: true,
      stdout: "OBS_OK",
    });

    await h.run(textEvent({ chatId: "oc_p9_obs", messageId: "om_p9_obs", text: "hello obs" }));
    await flushAsyncPersist();

    const stages = h.telemetry.filter((e) => e.name === "stage_latency").map((e) => e.payload.stage);
    assert.ok(stages.includes("parse"));
    assert.ok(stages.includes("planning_pre"));
    assert.ok(stages.includes("planning_final"));
    assert.ok(stages.includes("memory"));
    assert.ok(stages.includes("output_plugins"));
    const memoryMetric = h.telemetry.find((e) => e.name === "stage_latency" && e.payload.stage === "memory");
    assert.deepStrictEqual(memoryMetric.payload.memoryTokenUsage, { totalTokens: 3 });
  });

  test("memory throw is logged, skipped, and executor reply still succeeds", async () => {
    const h = buildHarness({ memoryThrow: true, stdout: "MEMORY_FAILSAFE_OK" });

    await h.run(textEvent({ chatId: "oc_p9_memory_throw", messageId: "om_p9_memory_throw", text: "hello memory" }));
    await flushAsyncPersist();

    assert.strictEqual(h.calls.memoryAssemble.length, 1);
    assert.strictEqual(h.calls.executor.length, 1);
    assert.strictEqual(h.calls.sentReply.length, 1);
    assert.match(String(h.calls.sentReply[0].text), /OK:MEMORY_FAILSAFE_OK/);
    assert.ok(h.loggerCalls.error.some((args) => String(args[0]).includes("[feishu-memory] assemble failed")));
    assert.ok(h.telemetry.some((e) => e.name === "memory_failed"));
  });
});
