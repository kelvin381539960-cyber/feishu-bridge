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

function botMention() {
  return { id: { open_id: "ou_fake_bot" }, name: "Bot" };
}

function userMention(openId) {
  return { id: { open_id: openId }, name: "User" };
}

function buildHarness(overrides) {
  const o = overrides || {};
  const trace = [];
  const loggerCalls = { log: [], error: [], warn: [] };
  const channel = createFakeFeishuChannel({
    ...(o.channel || {}),
    botOpenId: (o.channel && o.channel.botOpenId) || "ou_fake_bot",
    shouldSkipGroupMessageWithoutAtBot:
      o.shouldSkipGroupMessageWithoutAtBot || (o.channel && o.channel.shouldSkipGroupMessageWithoutAtBot),
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
    logger: {
      log: (...args) => loggerCalls.log.push(args),
      error: (...args) => loggerCalls.error.push(args),
      warn: (...args) => loggerCalls.warn.push(args),
    },
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
    loggerCalls,
  };
}

describe("brain replay harness", { concurrency: false }, () => {
  test("text basic: direct mode locks exact side effects, executor opts, trace, reply and memory", async () => {
    const h = buildHarness({ executor: { stdout: "BASIC_OK" } });
    await h.run(textEvent({ chatId: "oc_basic", messageId: "om_basic", text: "hello" }));
    await flushAsyncPersist();

    assert.strictEqual(h.executor.calls.length, 1);
    assert.strictEqual(h.executor.calls[0].task, "hello");
    assert.strictEqual(h.executor.calls[0].opts.messageId, "om_basic");
    assert.strictEqual(h.executor.calls[0].opts.chatId, "oc_basic");
    assert.ok(String(h.executor.calls[0].opts.sessionId || "").includes("oc_basic"));
    assert.ok(h.executor.calls[0].opts.gatewayRequest && typeof h.executor.calls[0].opts.gatewayRequest === "object");

    assert.deepStrictEqual(h.channel.calls.reactions, [
      { messageId: "om_basic", emoji: "Typing" },
    ]);
    assert.strictEqual(h.channel.calls.sentText.length, 1);
    assert.deepStrictEqual(h.channel.calls.sentText[0], {
      chatId: "oc_basic",
      text: "已识别：general / execute",
    });
    assert.strictEqual(h.channel.calls.sentReply.length, 1);
    assert.strictEqual(h.channel.calls.sentReply[0].chatId, "oc_basic");
    assert.match(String(h.channel.calls.sentReply[0].text), /OK:BASIC_OK/);
    assert.strictEqual(h.doc.calls.length, 0);

    assert.strictEqual(h.memory.calls.assemble.length, 1);
    assert.strictEqual(h.memory.calls.assemble[0].chatId, "oc_basic");
    assert.strictEqual(h.memory.calls.persist.length, 1);
    assert.strictEqual(h.memory.calls.persist[0].chatId, "oc_basic");
    assert.deepStrictEqual(h.trace, [
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
    assert.deepStrictEqual(h.trace, ["send:text"]);
  });

  test("group @bot gate: real mentions without bot open id are skipped", async () => {
    const h = buildHarness({ runtimeConfig: { groupRequireAtBot: true } });
    await h.run(textEvent({
      chatId: "oc_group_skip",
      messageId: "om_group_skip",
      text: "hello group",
      mentions: [userMention("ou_user_1")],
    }));
    await flushAsyncPersist();

    assert.strictEqual(h.executor.calls.length, 0);
    assert.strictEqual(h.channel.calls.sentText.length, 0);
    assert.strictEqual(h.channel.calls.sentReply.length, 0);
    assert.strictEqual(h.channel.calls.reactions.length, 0);
    assert.strictEqual(h.memory.calls.assemble.length, 0);
    assert.strictEqual(h.memory.calls.persist.length, 0);
    assert.deepStrictEqual(h.trace, []);
  });

  test("group @bot gate: real mentions with bot open id enter pipeline", async () => {
    const h = buildHarness({ runtimeConfig: { groupRequireAtBot: true }, executor: { stdout: "GROUP_OK" } });
    await h.run(textEvent({
      chatId: "oc_group_hit",
      messageId: "om_group_hit",
      text: "hello group",
      mentions: [botMention(), userMention("ou_user_1")],
    }));
    await flushAsyncPersist();

    assert.strictEqual(h.executor.calls.length, 1);
    assert.strictEqual(h.channel.calls.sentReply.length, 1);
    assert.match(String(h.channel.calls.sentReply[0].text), /OK:GROUP_OK/);
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
      mentions: [botMention(), userMention("ou_u1")],
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

  test("doc export throw: final reply is still sent and logger records exporter failure", async () => {
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
      assert.ok(h.loggerCalls.error.some((args) => String(args[0]).includes("[feishu-docx-export] hook error") && String(args[1]).includes("doc failed")));
    } finally {
      if (prev === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
      else process.env.FEISHU_CLOUD_DOC_EXPORT = prev;
    }
  });

  test("workflow hint sendText failure is logged and does not stop execution", async () => {
    const h = buildHarness({ channel: { failSendText: "send text failed" }, executor: { stdout: "SENDTEXT_OK" } });
    await h.run(textEvent({ chatId: "oc_sendtext_fail", messageId: "om_sendtext_fail", text: "hello" }));
    await flushAsyncPersist();

    assert.strictEqual(h.channel.calls.sentText.length, 1);
    assert.strictEqual(h.executor.calls.length, 1);
    assert.strictEqual(h.channel.calls.sentReply.length, 1);
    assert.match(String(h.channel.calls.sentReply[0].text), /OK:SENDTEXT_OK/);
    assert.ok(h.loggerCalls.error.some((args) => String(args[0]).includes("[feishu-workflow-hint] send failed")));
  });

  test("reaction fallback: fake reactionResult=false falls back to text ack", async () => {
    const h = buildHarness({
      ackMode: "reaction",
      channel: { reactionResult: false },
      executor: { stdout: "ACK_OK" },
    });
    await h.run(textEvent({ chatId: "oc_ack", messageId: "om_ack", text: "hello ack" }));
    await flushAsyncPersist();

    assert.deepStrictEqual(h.channel.calls.reactions, [{ messageId: "om_ack", emoji: "Typing" }]);
    assert.ok(h.channel.calls.sentText.some((x) => x.chatId === "oc_ack" && String(x.text).includes("⏳")));
    assert.ok(h.telemetry.some((e) => e.name === "ack_sent" && e.payload.ackMode === "fallback_text"));
    assert.strictEqual(h.channel.calls.sentReply.length, 1);
  });

  test("output plugins: doc export error keeps reply order, memory and telemetry stable", async () => {
    const prev = process.env.FEISHU_CLOUD_DOC_EXPORT;
    process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
    try {
      const h = buildHarness({
        runtimeConfig: { researchClarifyFirst: false },
        isResearchLikeTask: () => true,
        docExport: { throwOnExport: "doc failed" },
        executor: { stdout: "DOC_ORDER_OK" },
      });
      await h.run(textEvent({ chatId: "oc_doc_order", messageId: "om_doc_order", text: "技术调研 doc error" }));
      await flushAsyncPersist();

      assert.strictEqual(h.doc.calls.length, 1);
      assert.strictEqual(h.channel.calls.sentReply.length, 1);
      assert.match(String(h.channel.calls.sentReply[0].text), /OK:DOC_ORDER_OK/);
      assert.strictEqual(h.memory.calls.persist.length, 1);
      assert.match(String(h.memory.calls.persist[0].replyBody), /OK:DOC_ORDER_OK/);
      assert.ok(h.telemetry.some((e) => e.name === "runner_completed"));
      assert.ok(h.telemetry.some((e) => e.name === "reply_sent" && e.payload.exportKind === "research"));
      assert.ok(h.trace.indexOf("send:reply") < h.trace.indexOf("memory:persist"));
      assert.ok(h.trace.indexOf("memory:persist") < h.trace.indexOf("telemetry:reply_sent"));
    } finally {
      if (prev === undefined) delete process.env.FEISHU_CLOUD_DOC_EXPORT;
      else process.env.FEISHU_CLOUD_DOC_EXPORT = prev;
    }
  });

  test("output plugins: usage append keeps single reply, memory and telemetry", async () => {
    const prev = {
      FEISHU_OUTPUT_USAGE_PLUGIN: process.env.FEISHU_OUTPUT_USAGE_PLUGIN,
      FEISHU_REPLY_USAGE_TOKENS_RAW: process.env.FEISHU_REPLY_USAGE_TOKENS_RAW,
    };
    process.env.FEISHU_OUTPUT_USAGE_PLUGIN = "1";
    process.env.FEISHU_REPLY_USAGE_TOKENS_RAW = "1";
    try {
      const h = buildHarness({
        executor: {
          responses: [{
            code: 0,
            stdout: "USAGE_OK",
            stderr: "",
            error: null,
            structuredResult: {
              raw: {
                openclaw: { model: "gw", usage: { total_tokens: 7 } },
                cursor: { model: "ex", usage: { total_tokens: 9 } },
              },
            },
            routeAgentId: process.env.OPENCLAW_HEAVY_AGENT_ID || "cursor",
          }],
        },
      });
      await h.run(textEvent({ chatId: "oc_usage", messageId: "om_usage", text: "hello usage" }));
      await flushAsyncPersist();

      assert.strictEqual(h.channel.calls.sentReply.length, 1);
      assert.match(String(h.channel.calls.sentReply[0].text), /OK:USAGE_OK/);
      assert.match(String(h.channel.calls.sentReply[0].text), /gw · 7/);
      assert.strictEqual(h.memory.calls.persist.length, 1);
      assert.match(String(h.memory.calls.persist[0].replyBody), /gw · 7/);
      assert.ok(h.telemetry.some((e) => e.name === "reply_sent"));
      assert.deepStrictEqual(h.trace.filter((x) => x === "send:reply"), ["send:reply"]);
    } finally {
      for (const [key, value] of Object.entries(prev)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test("output plugins: limit segment is opt-in and preserves reply order, memory and telemetry", async () => {
    const prev = {
      FEISHU_OUTPUT_LIMIT_MODE: process.env.FEISHU_OUTPUT_LIMIT_MODE,
      FEISHU_OUTPUT_MAX_CHARS: process.env.FEISHU_OUTPUT_MAX_CHARS,
      FEISHU_OUTPUT_LIMIT_TRUNCATE_ENABLED: process.env.FEISHU_OUTPUT_LIMIT_TRUNCATE_ENABLED,
    };
    process.env.FEISHU_OUTPUT_LIMIT_MODE = "segment";
    process.env.FEISHU_OUTPUT_MAX_CHARS = "500";
    delete process.env.FEISHU_OUTPUT_LIMIT_TRUNCATE_ENABLED;
    try {
      const longText = Array.from({ length: 90 }, (_, i) => `段落${i}：这是一段用于验证分段顺序的长文本。`).join("\n\n");
      const h = buildHarness({ executor: { stdout: longText } });
      await h.run(textEvent({ chatId: "oc_segment", messageId: "om_segment", text: "hello segment" }));
      await flushAsyncPersist();

      assert.ok(h.channel.calls.sentReply.length > 1);
      assert.match(String(h.channel.calls.sentReply[0].text), /^（1\/\d+）\nOK:/);
      assert.match(String(h.channel.calls.sentReply[1].text), /^（2\/\d+）\n/);
      assert.deepStrictEqual(h.trace.filter((x) => x === "send:reply").length, h.channel.calls.sentReply.length);
      assert.strictEqual(h.memory.calls.persist.length, 1);
      assert.match(String(h.memory.calls.persist[0].replyBody), /OK:/);
      assert.ok(!String(h.memory.calls.persist[0].replyBody).startsWith("（1/"));
      assert.ok(h.telemetry.some((e) => e.name === "reply_sent"));
      assert.ok(h.trace.lastIndexOf("send:reply") < h.trace.indexOf("memory:persist"));
      assert.ok(h.trace.indexOf("memory:persist") < h.trace.indexOf("telemetry:reply_sent"));
    } finally {
      for (const [key, value] of Object.entries(prev)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test("output plugins: truncate mode is ignored unless explicitly opted in", async () => {
    const prev = {
      FEISHU_OUTPUT_LIMIT_MODE: process.env.FEISHU_OUTPUT_LIMIT_MODE,
      FEISHU_OUTPUT_MAX_CHARS: process.env.FEISHU_OUTPUT_MAX_CHARS,
      FEISHU_OUTPUT_LIMIT_TRUNCATE_ENABLED: process.env.FEISHU_OUTPUT_LIMIT_TRUNCATE_ENABLED,
    };
    process.env.FEISHU_OUTPUT_LIMIT_MODE = "truncate";
    process.env.FEISHU_OUTPUT_MAX_CHARS = "500";
    delete process.env.FEISHU_OUTPUT_LIMIT_TRUNCATE_ENABLED;
    try {
      const longText = "T".repeat(900);
      const h = buildHarness({ executor: { stdout: longText } });
      await h.run(textEvent({ chatId: "oc_truncate_off", messageId: "om_truncate_off", text: "hello truncate" }));
      await flushAsyncPersist();

      assert.strictEqual(h.channel.calls.sentReply.length, 1);
      assert.match(String(h.channel.calls.sentReply[0].text), /T{100}/);
      assert.ok(!String(h.channel.calls.sentReply[0].text).includes("已截断"));
      assert.strictEqual(h.memory.calls.persist.length, 1);
      assert.ok(h.telemetry.some((e) => e.name === "reply_sent"));
    } finally {
      for (const [key, value] of Object.entries(prev)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
