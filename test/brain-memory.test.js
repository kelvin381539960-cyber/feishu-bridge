"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert");

const { createMemoryRecord } = require("../lib/brain/memory/memory-record");
const { createMemoryStore } = require("../lib/brain/memory/memory-store");
const { routeMemory } = require("../lib/brain/memory/memory-router");
const { createTokenBudget, enforceMemoryBudget } = require("../lib/brain/kernel/token-budget");
const { memoryStage, memoryPersistStage } = require("../lib/brain/kernel/memory-stages");

function rec(input) {
  return createMemoryRecord({
    scope: "project",
    subject: "feishu-bridge",
    key: "preference",
    value: "use bounded memory router",
    confidence: 0.8,
    source: "explicit",
    updatedAt: "2026-05-04T00:00:00.000Z",
    ...input,
  });
}

describe("P5 long memory", () => {
  test("memory injection: executor receives task with memory when records exist and no injection when empty", async () => {
    const store = createMemoryStore({ records: [rec({ key: "router", value: "inject memory through task.memory only" })] });
    const ctx = { memoryStore: store, task: "please use router", tokenBudget: { memoryBudget: 200 }, telemetry: [], flags: {} };
    await memoryStage(ctx);
    assert.strictEqual(ctx.memoryInjected, true);
    assert.ok(ctx.task.memory.injected);
    assert.match(ctx.task.memory.summary, /router/);

    const emptyCtx = { memoryStore: createMemoryStore(), task: "hello", tokenBudget: { memoryBudget: 200 }, telemetry: [], flags: {} };
    await memoryStage(emptyCtx);
    assert.strictEqual(emptyCtx.memoryInjected, false);
    assert.strictEqual(typeof emptyCtx.task, "string");
  });

  test("budget limiting trims memory and keeps tokenEstimate within memoryBudget", () => {
    const budget = createTokenBudget({ memoryBudget: 20 });
    const pack = routeMemory({
      records: [
        rec({ id: "small", key: "small", value: "small relevant router note" }),
        rec({ id: "huge", key: "huge", value: "x".repeat(1000) }),
      ],
      query: { task: "router" },
      budget,
      topK: 5,
    });
    enforceMemoryBudget(pack, budget);
    assert.ok(pack.tokenEstimate <= budget.memoryBudget);
    assert.ok(pack.omitted.some((item) => item.reason === "budget"));
  });

  test("negative memory has higher priority and is retained before positive records", () => {
    const negative = rec({ id: "neg", scope: "negative", key: "do_not", value: "do not auto enter task mode" });
    const positive = rec({ id: "pos", scope: "project", key: "task_mode", value: "task mode preference" });
    const pack = routeMemory({ records: [positive, negative], query: { task: "task mode" }, budget: { memoryBudget: 100 }, topK: 1 });
    assert.strictEqual(pack.records.length, 1);
    assert.strictEqual(pack.records[0].scope, "negative");
  });

  test("persist writes reply into memory and preserves memoryInjected marker", async () => {
    const store = createMemoryStore();
    const ctx = {
      memoryStore: store,
      flags: { needsMemoryPersist: true },
      task: { original: "build memory" },
      reply: "done",
      memoryInjected: true,
      sessionId: "s1",
      telemetry: [],
    };
    await memoryPersistStage(ctx);
    const records = await store.queryMemory({});
    assert.strictEqual(records.length, 1);
    assert.match(records[0].value, /reply: done/);
    assert.match(records[0].value, /memoryInjected: true/);
  });
});
