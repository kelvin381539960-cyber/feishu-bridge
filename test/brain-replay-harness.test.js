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

function flushAsyncPersist() {
  return new Promise((resolve) => setImmediate(resolve));
}

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

function assertOrdered(trace, expected) {
  let cursor = -1;
  for (const step of expected) {
    const next = trace.findIndex((x, index) => index > cursor && x === step);
    assert.ok(next > cursor, `expected trace step ${step} after index ${cursor}; got ${trace.join(" -> ")}`);
    cursor = next;
  }
}

function buildHarness(overrides) {
  const o = overrides || {};
  const trace = [];
  const channel = createFakeFeishuChannel({
    shouldSkipGroupMessageWithoutAtBot: o.shouldSkipGroupMessageWithoutAtBot,
    botOpenId: "ou_fake_bot",
    formatReply:
      o.formatReply ||
      ((r) => (r && r.code !== 0 ? `ERR:${r.stderr || r.stdout || "failed"}` : `OK:${r.stdout || ""}`)),
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
      emit: (name, payload) => {
        trace.push(`telemetry:${name}`);
        telemetry.push({ name, payload });
      },
    },
    logger: { log: () => {}, error: () => {}, warn: () => {} },
    enqueueEvent: () => {},
    shouldSkipGroupMessageWithoutAtBot: channel.shouldSkipGroupMessageWithoutAtBot,
    sendFeishuTextToChat: async (chatId, text) => {
      trace.push(String(text).includes("已识别：") ? "send:workflow_hint" : "send:text");
      return channel.sendText(chatId, text);
    },
    sendFeishuChatReply: async (chatId, text) => {
      trace.push("send:reply");
      return channel.sendReply(chatId, text);
    },
    addFeishuMessageReaction: async (messageId, emoji) => {
      trace.push("send:reaction");
      return channel.addReaction(messageId, emoji);
    },
    getBotSelfOpenId: channel.getBotSelfOpenId,
    fetchChatMemberOpenIdLines: channel.fetchChatMemberOpenIdLines,
    getCursorTaskAckMessage: channel.getAckMessage,
    runCursorAdhocPrompt: async (task, opts) => {
      trace.push("execute:openclaw");
      return executor.run(task, opts);
    },
    formatCursorAdhocReply: channel.formatReply,
    appendFeishuTimingToReplyBody: channel.appendTiming,
    augmentTaskWithQuotedParent: async (task) => ({ task, injected: false }),
    normalizeSheetWriteTask: (task) => task,
    augmentTaskWithFeishuAtContext: async (task) => task,
    assembleMemoryContext: async (payload) => {
      trace.push("memory:assemble");
      return memory.assembleMemoryContext(payload);
    },
    persistMemoryTurn: async (payload) => {
      trace.push("memory:persist");
      return memory.persistMemoryTurn(payload);
    },
    bumpConversationEpoch: memory.bumpConversationEpoch,
    getLastTurnMetaForFresh: memory.getLastTurnMetaForFresh,
    maybeChainAfterCursor: async () => ({ chained: false }),
    normalizeCursorTask: (task) => task,
    appendFeishuOpenIdMentionHint: (task) => task,
    resolveCursorAgentProfile: (task) => ({ profile: "full", task }),
    isRelayLikeTask: o.isRelayLikeTask || (() => false),
    isReportLikeTask: o.isReportLikeTask || (() => false),
    isResearchLikeTask: o.isResearchLikeTask || (() => false),
    exportResearchDocHook: async (payload) => {
      trace.push("doc:export");
      return doc.hook(payload);
    },
    downloadImage: channel.downloadImage,
    downloadResource: channel.downloadResource,
    fetchMessage: channel.fetchMessage,
    cleanupFile: channel.cleanupFile,
    describeImage: async () => "",
    extractFileText: async () => "",
    transcribeAudio: async () => "",
    processVideo: async () => "",
    processSticker: () => "",
    ackMode: o.ackMode || "reaction",
    ackReactionEmoji: o.ackReactionEmoji || "Typing",
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
    trace,
  };
}

describe("brain replay harness", { concurrency: false }, () => {
  test("text basic: direct mode locks executor opts, ordering, ack reaction, telemetry, reply and memory", async () => {
    const h = buildHarness({ executor: { stdout: "BASIC_OK" } });
    await h.run(textEvent({ chatId: "oc_basic", messageId: "om_basic", text: "hello" }));
    await flushAsyncPersist();

    assert.strictEqual(h.executor.calls.length, 1);
    assert.match(String(h.executor.calls[0].task), /hello/);
    assert.strictEqual(h.executor.calls[0].opts.messageId, "om_basic");
    assert.strictEqual(h.executor.calls[0].opts.chatId, "oc_basic");
    assert.ok(String(h.executor.calls[0].opts.sessionId || "").includes("oc_basic"));
    assert.ok(h.executor.calls[0].opts.gatewayRequest);

    assert.deepStrictEqual(h.channel.calls.reactions, [
      { messageId: "om_basic", emoji: "Typing" },
    ]);
    assert.ok(h.channel.calls.sentText.some((x) => x.chatId === "oc_basic" && String(x.text).includes("已识别：general")));
    assert.strictEqual(h.channel.calls.sentReply.length, 1);
    assert.strictEqual(h.channel.calls.sentReply[0].chatId, "oc_basic");
    assert.match(String(h.channel.calls.sentReply[0].text), /OK:BASIC_OK/);

    assert.strictEqual(h.memory.calls.assemble.length, 1);
    assert.strictEqual(h.memory.calls.assemble[0].chatId, "oc_basic");
    assert.strictEqual(h.memory.calls.persist.length, 1);
    assert.strictEqual(h.memory.calls.persist[0].chatId, "oc_basic");
    assert.ok(h.telemetry.some((e) => e.name === "classification" && e.payload.taskType === "general"));
    assert.ok(h.telemetry.some((e) => e.name === "ack_sent" && e.payload.ackSent === true));
    assert.ok(h.telemetry.some((e) => e.name === "reply_sent" && e.payload.replyStatus === "sent"));
    assertOrdered(h.trace, [
      "telemetry:classification",
      "memory:assemble",
      "telemetry:policy_decision",
      "send:workflow_hint",
      "send:reaction",
      "telemetry:ack_sent",
      "execute:openclaw",
      "telemetry:runner_completed",
      "send:reply",
      "memory:persist",
      "telemetry:reply_sent",
    ]);
  });

  test("prefix miss: prefix mode short-circuits cleanly without ack, memory, doc or executor", async () => {
    const h = buildHarness({ routing: { direct: false, prefix: "/figma" } });
    await h.run(textEvent({ chatId: "oc_prefix", messageId: "om_prefix", text: "hello" }));
    await flushAsyncPersist();

    assert.strictEqual(h.executor.calls.length, 0);
    assert.deepStrictEqual(h.channel.calls.reactions, []);
    assert.strictEqual(h.channel.calls.sentText.length, 1);
    assert.strictEqual(h.channel.calls.sentText[0].chatId, "oc_prefix");
    assert.ok(String(h.channel.calls.sentText[0].text).includes("/figma"));
    assert.strictEqual(h.channel.calls.sentReply.length, 0);
    assert.strictEqual(h.memory.calls.assemble.length, 0);
    assert.strictEqual(h.memory.calls.persist.length, 0);
    assert.strictEqual(h.doc.calls.length, 0);
  });

  test("group @bot gate: skipped group message does not call downstream side effects", async () => {
    const h = buildHarness({
      runtimeConfig: { groupRequireAtBot: true },
      shouldSkipGroupMessageWithoutAtBot: () => true,
    });
    await h.run(textEvent({ chatId: "oc_group", messageId: "om_group", text: "hello group" }));
    await flushAsyncPersist();

    assert.strictEqual(h.executor.calls.length, 0);
    assert.strictEqual(h.channel.calls.sentText.length, 0);
    assert.strictEqual(h.channel.calls.sentReply.length, 0);
    assert.strictEqual(h.channel.calls.reactions.length, 0);
    assert.strictEqual(h.memory.calls.assemble.length, 0);
    assert.strictEqual(h.memory.calls.persist.length, 0);
  });

  test("relay-like task in enforce mode short-circuits before executor and memory", async () => {
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
    await flushAsyncPersist();

    assert.strictEqual(h.executor.calls.length, 0);
    assert.strictEqual(h.channel.calls.sentReply.length, 1);
    assert.deepStrictEqual(h.channel.calls.sentReply[0], {
      chatId: "oc_relay",
      text: "@ou_u1 今天雨大吗？",
    });
    assert.strictEqual(h.memory.calls.assemble.length, 0);
    assert.strictEqual(h.memory.calls.persist.length, 0);
    assert.ok(h.telemetry.some((e) => e.name === "relay_short_circuit"));
  });

  test("memory injected: executor receives injected task and memory persist keeps final reply", async () => {
    const h = buildHarness({
      memory: {
        assemble: async (payload) => ({
          injected: true,
          task: `${payload.task}\n\n[MEMORY] user prefers concise output`,
          memoryMode: payload.memoryMode,
        }),
      },
      executor: { stdout: "MEMORY_OK" },
    });
    await h.run(textEvent({ chatId: "oc_mem", messageId: "om_mem", text: "summarize" }));
    await flushAsyncPersist();

    assert.strictEqual(h.executor.calls.length, 1);
    assert.match(h.executor.calls[0].task, /\[MEMORY\]/);
    assert.strictEqual(h.memory.calls.persist.length, 1);
    assert.strictEqual(h.memory.calls.persist[0].taskContext.memoryInjected, true);
    assert.match(String(h.memory.calls.persist[0].replyBody), /OK:MEMORY_OK/);
  });

  test("executor non-zero: sends formatted error reply and still records telemetry", async () => {
    const h = buildHarness({
      executor: { responses: [{ code: 1, stdout: "", stderr: "boom", error: { message: "boom" } }] },
    });
    await h.run(textEvent({ chatId: "oc_fail", messageId: "om_fail", text: "fail please" }));
    await flushAsyncPersist();

    assert.strictEqual(h.executor.calls.length, 1);
    assert.strictEqual(h.channel.calls.sentReply.length, 1);
    assert.match(String(h.channel.calls.sentReply[0].text), /ERR:boom/);
    assert.ok(h.telemetry.some((e) => e.name === "runner_completed" && e.payload.code === 1));
    assert.ok(h.telemetry.some((e) => e.name === "reply_sent"));
  });

  test("doc export throw: final reply is still sent without leaking exporter failure", async () => {
    const prev = process.env.FEISHU_CLOUD_DOC_EXPORT;
    process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
    try {
      const h = buildHarness({
        runtimeConfig: { researchClarifyFirst: false },
        isResearchLikeTask: () => true,
        docExport: { throwOnExport: "doc failed" },
        executor: { stdout: "DOC_OK" },
      });
      await h.run(textEvent({ chatId: "oc_doc", messageId: "om_doc", text: "技术调研 Redis" }));
      await flushAsyncPersist();

      assert.strictEqual(h.doc.calls.length, 1);
      assert.strictEqual(h.doc.calls[0].exportKind, "research");
      assert.strictEqual(h.channel.calls.sentReply.length, 1);
      assert.match(String(h.channel.calls.sentReply[0].text), /OK:DOC_OK/);
    } finally {
      if (prev === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
      else process.env.FEISHU_CLOUD_DOC_EXPORT = prev;
    }
  });

  test("reaction fallback: failed reaction falls back to text ack", async () => {
    const h = buildHarness({ ackMode: "reaction", executor: { stdout: "ACK_OK" } });
    h.deps.addFeishuMessageReaction = async () => false;
    await h.run(textEvent({ chatId: "oc_ack", messageId: "om_ack", text: "hello ack" }));
    await flushAsyncPersist();

    assert.ok(h.channel.calls.sentText.some((x) => x.chatId === "oc_ack" && String(x.text).includes("⏳")));
    assert.ok(h.telemetry.some((e) => e.name === "ack_sent" && e.payload.ackMode === "text"));
    assert.strictEqual(h.channel.calls.sentReply.length, 1);
  });
});
