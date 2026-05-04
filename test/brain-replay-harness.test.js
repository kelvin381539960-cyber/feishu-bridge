"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert");

const {
  createFeishuCursorPipelineV2,
} = require("../lib/feishu-cursor/pipeline-v2");
const {
  createInMemoryPipelineState,
} = require("../lib/feishu-cursor/ingestion/in-memory-state");
const { createFakeFeishuChannel } = require("./helpers/fake-feishu-channel");
const { createFakeOpenclawExecutor } = require("./helpers/fake-openclaw-executor");
const { createFakeMemoryStore } = require("./helpers/fake-memory-store");
const { createFakeDocExporter } = require("./helpers/fake-doc-exporter");

function textEvent({ chatId, messageId, text, mentions }) {
  return {
    sender: { sender_type: "user" },
    message: {
      message_id: messageId,
      chat_id: chatId,
      message_type: "text",
      mentions: mentions || [],
      content: JSON.stringify({ text }),
      create_time: "1710000000",
    },
  };
}

function buildHarness(overrides) {
  const o = overrides || {};
  const channel = createFakeFeishuChannel({
    shouldSkipGroupMessageWithoutAtBot: o.shouldSkipGroupMessageWithoutAtBot,
    botOpenId: "ou_fake_bot",
  });
  const executor = createFakeOpenclawExecutor(o.executor);
  const memory = createFakeMemoryStore(o.memory);
  const doc = createFakeDocExporter(o.docExport);
  const telemetry = [];
  const deps = {
    runtimeConfig: {
      groupRequireAtBot: false,
      ...(o.runtimeConfig || {}),
    },
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
    logger: { log: () => {}, error: () => {}, warn: () => {} },
    enqueueEvent: () => {},
    shouldSkipGroupMessageWithoutAtBot: channel.shouldSkipGroupMessageWithoutAtBot,
    sendFeishuTextToChat: async (chatId, text) => channel.sendText(chatId, text),
    sendFeishuChatReply: async (chatId, text) => channel.sendReply(chatId, text),
    addFeishuMessageReaction: async (messageId, emoji) => channel.addReaction(messageId, emoji),
    getBotSelfOpenId: channel.getBotSelfOpenId,
    fetchChatMemberOpenIdLines: channel.fetchChatMemberOpenIdLines,
    getCursorTaskAckMessage: channel.getAckMessage,
    runCursorAdhocPrompt: executor.run,
    formatCursorAdhocReply: channel.formatReply,
    appendFeishuTimingToReplyBody: channel.appendTiming,
    augmentTaskWithQuotedParent: async (task) => ({ task, injected: false }),
    normalizeSheetWriteTask: (task) => task,
    augmentTaskWithFeishuAtContext: async (task) => task,
    assembleMemoryContext: memory.assembleMemoryContext,
    persistMemoryTurn: memory.persistMemoryTurn,
    bumpConversationEpoch: memory.bumpConversationEpoch,
    getLastTurnMetaForFresh: memory.getLastTurnMetaForFresh,
    maybeChainAfterCursor: async () => ({ chained: false }),
    normalizeCursorTask: (task) => task,
    appendFeishuOpenIdMentionHint: (task) => task,
    resolveCursorAgentProfile: (task) => ({ profile: "full", task }),
    isRelayLikeTask: o.isRelayLikeTask || (() => false),
    isReportLikeTask: o.isReportLikeTask || (() => false),
    isResearchLikeTask: o.isResearchLikeTask || (() => false),
    exportResearchDocHook: doc.hook,
    downloadImage: channel.downloadImage,
    downloadResource: channel.downloadResource,
    fetchMessage: channel.fetchMessage,
    cleanupFile: channel.cleanupFile,
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
    channel,
    executor,
    memory,
    doc,
    telemetry,
  };
}

describe("brain replay harness", { concurrency: false }, () => {
  test("text basic: direct mode runs executor, sends ack hint and final reply", async () => {
    const h = buildHarness();
    await h.run(textEvent({ chatId: "oc_basic", messageId: "om_basic", text: "hello" }));
    assert.strictEqual(h.executor.calls.length, 1);
    assert.match(String(h.executor.calls[0].task), /hello/);
    assert.ok(h.channel.calls.sentText.some((x) => String(x.text).includes("已识别：general")));
    assert.strictEqual(h.channel.calls.sentReply.length, 1);
    assert.strictEqual(h.memory.calls.assemble.length, 1);
    assert.strictEqual(h.memory.calls.persist.length, 1);
  });

  test("prefix miss: prefix mode short-circuits without executor", async () => {
    const h = buildHarness({ routing: { direct: false, prefix: "/figma" } });
    await h.run(textEvent({ chatId: "oc_prefix", messageId: "om_prefix", text: "hello" }));
    assert.strictEqual(h.executor.calls.length, 0);
    assert.ok(h.channel.calls.sentText.some((x) => String(x.text).includes("/figma")));
  });

  test("group @bot gate: skipped group message does not call executor or reply", async () => {
    const h = buildHarness({
      runtimeConfig: { groupRequireAtBot: true },
      shouldSkipGroupMessageWithoutAtBot: () => true,
    });
    await h.run(textEvent({ chatId: "oc_group", messageId: "om_group", text: "hello group" }));
    assert.strictEqual(h.executor.calls.length, 0);
    assert.strictEqual(h.channel.calls.sentText.length, 0);
    assert.strictEqual(h.channel.calls.sentReply.length, 0);
  });

  test("relay-like task in enforce mode short-circuits before executor", async () => {
    const h = buildHarness({
      runtimeConfig: { relayPolicyMode: "enforce" },
      isRelayLikeTask: () => true,
    });
    await h.run(textEvent({
      chatId: "oc_relay",
      messageId: "om_relay",
      text: "请帮我问今天雨大吗",
      mentions: [
        { id: { open_id: "ou_fake_bot" }, name: "小智" },
        { id: { open_id: "ou_u1" }, name: "小王" },
      ],
    }));
    assert.strictEqual(h.executor.calls.length, 0);
    assert.strictEqual(h.channel.calls.sentReply.length, 1);
    assert.match(String(h.channel.calls.sentReply[0].text), /@ou_u1/);
  });
});
