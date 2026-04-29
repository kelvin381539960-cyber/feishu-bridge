"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  assembleMemoryContext,
  persistMemoryTurn,
} = require("../lib/feishu-session-memory");
const { maybeChainAfterCursor } = require("../lib/feishu-chain-next");

describe("pipeline fallback adapters", () => {
  const originalStore = process.env.FEISHU_CURSOR_MEMORY_STORE;

  function prepareIsolatedMemoryStore() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feishu-memory-fallback-"));
    process.env.FEISHU_CURSOR_MEMORY_STORE = path.join(dir, "memory.json");
    return dir;
  }

  function restoreMemoryStore(dir) {
    if (originalStore === undefined) delete process.env.FEISHU_CURSOR_MEMORY_STORE;
    else process.env.FEISHU_CURSOR_MEMORY_STORE = originalStore;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  }

  test("memory adapter falls back to builtin provider without external module", async () => {
    const dir = prepareIsolatedMemoryStore();
    try {
      const out = await assembleMemoryContext({ chatId: "oc_x", task: "hello" });
      assert.deepStrictEqual(out, {
        injected: false,
        task: "hello",
        memory: null,
        providerName: "builtin",
      });

      const persisted = await persistMemoryTurn({
        chatId: "oc_x",
        userTask: "u",
        replyBody: "r",
      });
      assert.strictEqual(persisted.ok, true);
      assert.strictEqual(persisted.providerName, "builtin");
    } finally {
      restoreMemoryStore(dir);
    }
  });

  test("chain adapter is safe no-op without provider", async () => {
    const out = await maybeChainAfterCursor({
      chatId: "oc_x",
      replyBody: "ok",
    });
    assert.strictEqual(out.chained, false);
    assert.strictEqual(out.skipped, true);
  });
});
