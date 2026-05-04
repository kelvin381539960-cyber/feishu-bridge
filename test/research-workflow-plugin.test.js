"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { ResearchWorkflowPlugin } = require("../lib/feishu-cursor/workflows/research-workflow");
const { createFeishuCursorPipelineV2 } = require("../lib/feishu-cursor/pipeline-v2");
const { createInMemoryPipelineState } = require("../lib/feishu-cursor/ingestion/in-memory-state");

function textEvent(chatId, messageId, text) {
  return {
    sender: { sender_type: "user" },
    message: {
      message_id: messageId,
      chat_id: chatId,
      message_type: "text",
      content: JSON.stringify({ text }),
      create_time: "1710000000",
    },
  };
}

function buildDeps(overrides) {
  const calls = { run: [], sentReply: [], sentText: [], memoryPersist: [] };
  const deps = {
    runtimeConfig: { groupRequireAtBot: false, researchQualityRepair: false },
    routing: { enabled: true, direct: true, prefix: "/figma", chatAllowed: () => true },
    state: createInMemoryPipelineState({ dedupTtlMs: 60000 }),
    logger: { log: () => {}, error: () => {}, warn: () => {} },
    telemetry: { emit: () => {} },
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
    formatCursorAdhocReply: (r) => (r && r.code !== 0 ? `ERR:${r.stderr || r.stdout}` : `OK:${r.stdout || ""}`),
    appendFeishuTimingToReplyBody: (x) => x,
    augmentTaskWithQuotedParent: async (task) => ({ task, injected: false }),
    normalizeSheetWriteTask: (task) => task,
    augmentTaskWithFeishuAtContext: async (task) => task,
    assembleMemoryContext: async (payload) => ({ injected: false, task: payload.task }),
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
    calls,
  };
  return Object.assign(deps, overrides || {});
}

describe("ResearchWorkflowPlugin", { concurrency: false }, () => {
  test("passthrough: clarify lifecycle remains pipeline-owned", async () => {
    const plugin = new ResearchWorkflowPlugin();
    let nextCalled = 0;
    const out = await plugin.run({
      classification: { taskType: "research", role: "specialized" },
      prompt: { stage: "clarify" },
      next: async () => {
        nextCalled += 1;
        return { code: 0, stdout: "clarify" };
      },
    });
    assert.strictEqual(nextCalled, 1);
    assert.strictEqual(out.type, "passthrough");
    assert.deepStrictEqual(out.result, { code: 0, stdout: "clarify" });
    assert.strictEqual(out.meta.owner, "pipeline_lifecycle");
    assert.strictEqual(out.error, null);
  });

  test("override: execute fallback can run adhoc", async () => {
    const plugin = new ResearchWorkflowPlugin();
    const calls = [];
    const out = await plugin.run({
      classification: { taskType: "research", role: "fallback" },
      prompt: { stage: "execute" },
      executionPolicy: { multiAgentRequired: false },
      rwV2: false,
      task: "research task",
      dispatch: { opts: { sessionId: "s1" } },
      runOpenclawGatewayPrompt: async (task, opts) => {
        calls.push([task, opts]);
        return { code: 0, stdout: "adhoc" };
      },
      next: async () => ({ code: 9 }),
    });
    assert.strictEqual(out.type, "override");
    assert.strictEqual(out.meta.runner, "adhoc");
    assert.deepStrictEqual(calls, [["research task", { sessionId: "s1" }]]);
    assert.deepStrictEqual(out.result, { code: 0, stdout: "adhoc" });
  });

  test("override: execute specialized uses specialized solo runner", async () => {
    const plugin = new ResearchWorkflowPlugin();
    const calls = [];
    const out = await plugin.run({
      classification: { taskType: "research", role: "specialized", stage: "execute" },
      prompt: { stage: "execute" },
      executionPolicy: { multiAgentRequired: false, workflow: "research" },
      rwV2: false,
      dispatch: { task: "dispatch task", opts: { sessionId: "solo-session" } },
      runOpenclawGatewayPrompt: async (task, opts) => {
        calls.push([task, opts]);
        return { code: 0, stdout: "solo" };
      },
      next: async () => ({ code: 9 }),
    });
    assert.strictEqual(out.type, "override");
    assert.strictEqual(out.meta.runner, "specialized_solo");
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0][0], "dispatch task");
    assert.strictEqual(out.result.code, 0);
    assert.ok(out.result.runtimeRunTrace);
  });

  test("pipeline lifecycle: clarify-first then clarify answer executes and clears state", async () => {
    const tmp = path.join(os.tmpdir(), `rw-plugin-clarify-${Date.now()}.json`);
    process.env.FEISHU_RESEARCH_WORKFLOW_STATE_FILE = tmp;
    try {
      const deps = buildDeps({
        isResearchLikeTask: (t) => /调研/.test(String(t || "")),
        runtimeConfig: { groupRequireAtBot: false, researchClarifyFirst: true, researchWorkflowV2: false, researchQualityRepair: false },
      });
      const run = createFeishuCursorPipelineV2(deps);
      await run(textEvent("oc_plugin_clarify", "m_pc_a", "技术调研 Redis"));
      const afterClarify = deps.calls.run.length;
      assert.ok(afterClarify >= 1);
      assert.ok(JSON.parse(fs.readFileSync(tmp, "utf8")).chats.oc_plugin_clarify);

      await run(textEvent("oc_plugin_clarify", "m_pc_b", "1. 仅开源\n2. 关注持久化"));
      assert.ok(deps.calls.run.length > afterClarify);
      assert.strictEqual(JSON.parse(fs.readFileSync(tmp, "utf8")).chats.oc_plugin_clarify, undefined);
    } finally {
      delete process.env.FEISHU_RESEARCH_WORKFLOW_STATE_FILE;
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
  });

  test("pipeline lifecycle: end task short-circuits without plugin execute", async () => {
    const tmp = path.join(os.tmpdir(), `rw-plugin-end-${Date.now()}.json`);
    process.env.FEISHU_RESEARCH_WORKFLOW_STATE_FILE = tmp;
    try {
      const deps = buildDeps({
        isResearchLikeTask: (t) => /调研/.test(String(t || "")),
        runtimeConfig: { groupRequireAtBot: false, researchClarifyFirst: true, researchWorkflowV2: false, researchQualityRepair: false },
      });
      const run = createFeishuCursorPipelineV2(deps);
      await run(textEvent("oc_plugin_end", "m_pe_a", "技术调研 Redis"));
      const afterClarify = deps.calls.run.length;
      await run(textEvent("oc_plugin_end", "m_pe_b", "结束任务"));
      assert.strictEqual(deps.calls.run.length, afterClarify);
      assert.ok(String(deps.calls.sentReply.at(-1)[1]).includes("已结束本次调研"));
    } finally {
      delete process.env.FEISHU_RESEARCH_WORKFLOW_STATE_FILE;
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
  });

  test("pipeline lifecycle: failed research execute writes failed snapshot", async () => {
    const tmpSnap = path.join(os.tmpdir(), `rw-plugin-failed-${Date.now()}.json`);
    process.env.FEISHU_FAILED_RESEARCH_SNAPSHOT_FILE = tmpSnap;
    try {
      const deps = buildDeps({
        isResearchLikeTask: () => true,
        runtimeConfig: { groupRequireAtBot: false, researchClarifyFirst: false, researchWorkflowV2: false, researchQualityRepair: false },
        runCursorAdhocPrompt: async (task, opts) => {
          deps.calls.run.push([task, opts]);
          return { code: 1, stdout: "", stderr: "boom", error: { message: "boom" } };
        },
      });
      const run = createFeishuCursorPipelineV2(deps);
      await run(textEvent("oc_plugin_failed", "m_pf", "技术调研 Redis"));
      const snap = JSON.parse(fs.readFileSync(tmpSnap, "utf8"));
      const keys = Object.keys(snap.byKey || {});
      assert.strictEqual(keys.length, 1);
      assert.strictEqual(snap.byKey[keys[0]].workflow, "research");
      assert.strictEqual(snap.byKey[keys[0]].stage, "execute");
      assert.match(snap.byKey[keys[0]].error, /boom/);
    } finally {
      delete process.env.FEISHU_FAILED_RESEARCH_SNAPSHOT_FILE;
      try { fs.unlinkSync(tmpSnap); } catch (_) {}
    }
  });
});
