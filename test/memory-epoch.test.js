"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const mem = require("../lib/feishu-cursor/memory/default-memory-provider");

describe("memory epoch PR1", () => {
  test("composeMemoryKey and bump isolate chats", async () => {
    const tmp = path.join(os.tmpdir(), `mem-epoch-${Date.now()}.json`);
    process.env.FEISHU_CURSOR_MEMORY_STORE = tmp;
    try {
      const conv = "ns:oc_epoch_test";
      const sid = "agent:full:feishu:ns:oc_epoch_test";
      await mem.persistMemoryTurn({
        chatId: "oc_epoch_test",
        sessionId: sid,
        conversationEpochKey: conv,
        userTask: "u1",
        replyBody: "long reply " + "x".repeat(1300),
        workflowKey: "research",
      });
      const m1 = await mem.assembleMemoryContext({
        chatId: "oc_epoch_test",
        sessionId: sid,
        conversationEpochKey: conv,
        task: "t2",
      });
      assert.strictEqual(m1.injected, true);
      mem.bumpConversationEpoch({ conversationKey: conv, newEpoch: "msg-new-1" });
      const m2 = await mem.assembleMemoryContext({
        chatId: "oc_epoch_test",
        sessionId: sid,
        conversationEpochKey: conv,
        task: "t2",
      });
      assert.strictEqual(m2.injected, false);
      const ev = mem.getLastTurnMetaForFresh({ conversationKey: conv, sessionId: sid });
      assert.strictEqual(ev, null);
    } finally {
      delete process.env.FEISHU_CURSOR_MEMORY_STORE;
      try {
        fs.unlinkSync(tmp);
      } catch (_) {
        /* ignore */
      }
    }
  });

  test("memoryMode meta_followup injects last-turn excerpt only", async () => {
    const tmp = path.join(os.tmpdir(), `mem-meta-${Date.now()}.json`);
    process.env.FEISHU_CURSOR_MEMORY_STORE = tmp;
    try {
      const conv = "oc_meta_conv";
      const sid = "agent:main:feishu:oc_meta_conv";
      await mem.persistMemoryTurn({
        chatId: "oc_meta_conv",
        sessionId: sid,
        conversationEpochKey: conv,
        userTask: "调研 WalletConnect",
        replyBody: "WC 结论 " + "y".repeat(500),
        workflowKey: "research",
        artifactRef: "docx:abc",
      });
      const out = await mem.assembleMemoryContext({
        chatId: "oc_meta_conv",
        sessionId: sid,
        conversationEpochKey: conv,
        memoryMode: "meta_followup",
        task: "继续优化上一版",
      });
      assert.strictEqual(out.injected, true);
      assert.strictEqual(out.memoryMode, "meta_followup");
      assert.match(out.task, /\[上一轮上下文摘要/);
      assert.match(out.task, /上轮工作流：research/);
      assert.ok(out.task.includes("[当前任务]"));
      assert.ok(out.task.includes("继续优化上一版"));
      assert.ok(!out.task.includes("[会话摘要]"));
    } finally {
      delete process.env.FEISHU_CURSOR_MEMORY_STORE;
      try {
        fs.unlinkSync(tmp);
      } catch (_) {
        /* ignore */
      }
    }
  });

  test("memoryMode ignore skips injection", async () => {
    const tmp = path.join(os.tmpdir(), `mem-ign-${Date.now()}.json`);
    process.env.FEISHU_CURSOR_MEMORY_STORE = tmp;
    try {
      const conv = "oc_ign";
      const sid = "sid-ign";
      await mem.persistMemoryTurn({
        chatId: "oc_ign",
        sessionId: sid,
        conversationEpochKey: conv,
        userTask: "a",
        replyBody: "b",
      });
      const out = await mem.assembleMemoryContext({
        chatId: "oc_ign",
        sessionId: sid,
        conversationEpochKey: conv,
        memoryMode: "ignore",
        task: "hello",
      });
      assert.strictEqual(out.injected, false);
      assert.strictEqual(out.task, "hello");
    } finally {
      delete process.env.FEISHU_CURSOR_MEMORY_STORE;
      try {
        fs.unlinkSync(tmp);
      } catch (_) {
        /* ignore */
      }
    }
  });
});
