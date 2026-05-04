"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert");

const { createMemoryRecord } = require("../lib/brain/memory/memory-record");
const { createMemoryStore } = require("../lib/brain/memory/memory-store");
const { routeMemory } = require("../lib/brain/memory/memory-router");
const { validateMemoryPack } = require("../lib/brain/memory/memory-pack");
const { createTokenBudget, makeTokenBudgetController, enforceMemoryBudget } = require("../lib/brain/kernel/token-budget");
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
  test("memory injection: executor receives task with structured MemoryPack when records exist and no injection when empty", async () => {
    const store = createMemoryStore({ records: [rec({ key: "router", value: "inject memory through task.memory only" })] });
    const ctx = { memoryStore: store, task: "please use router", tokenBudget: { memoryBudget: 200 }, telemetry: [], flags: {} };
    await memoryStage(ctx);
    assert.strictEqual(ctx.memoryInjected, true);
    validateMemoryPack(ctx.task.memory);
    assert.ok(ctx.task.memory.partitions.positive.length > 0);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(ctx.task.memory, "summary"), false);

    const emptyCtx = { memoryStore: createMemoryStore(), task: "hello", tokenBudget: { memoryBudget: 200 }, telemetry: [], flags: {} };
    await memoryStage(emptyCtx);
    assert.strictEqual(emptyCtx.memoryInjected, false);
    assert.strictEqual(typeof emptyCtx.task, "string");
  });

  test("budget controller trims memory instead of throwing and keeps tokenEstimate within memoryBudget", () => {
    const budget = createTokenBudget({ memoryBudget: 20 });
    const controller = makeTokenBudgetController(budget);
    const pack = routeMemory({
      records: [
        rec({ id: "small", key: "small", value: "small relevant router note" }),
        rec({ id: "huge", key: "huge", value: "x".repeat(1000) }),
      ],
      query: { task: "router" },
      controller,
      topK: 5,
    });
    const enforced = enforceMemoryBudget(pack, budget);
    assert.ok(enforced.tokenEstimate <= budget.memoryBudget);
    assert.ok(pack.omitted.some((item) => item.reason === "budget"));
  });

  test("negative memory is hard-priority bucket and does not count behind positive topK", () => {
    const negative = rec({ id: "neg", scope: "negative", key: "do_not", value: "do not auto enter task mode" });
    const positive = rec({ id: "pos", scope: "project", key: "task_mode", value: "task mode preference" });
    const pack = routeMemory({ records: [positive, negative], query: { task: "task mode" }, budget: { memoryBudget: 100 }, topK: 1 });
    assert.strictEqual(pack.partitions.negative.length, 1);
    assert.strictEqual(pack.records[0].scope, "negative");
  });

  test("persist filters junk turns and writes durable reply only when confidence/size threshold passes", async () => {
    const store = createMemoryStore({ minPersistChars: 20, persistConfidenceThreshold: 0.7 });
    await memoryPersistStage({
      memoryStore: store,
      flags: { needsMemoryPersist: true },
      task: "hi",
      reply: "ok",
      memoryInjected: true,
      sessionId: "s1",
      telemetry: [],
      memoryPersistConfidence: 0.5,
    });
    assert.strictEqual((await store.queryMemory({})).length, 0);

    await memoryPersistStage({
      memoryStore: store,
      flags: { needsMemoryPersist: true },
      task: { original: "build bounded memory" },
      reply: "persist this durable lesson for later reuse",
      memoryInjected: true,
      sessionId: "s1",
      telemetry: [],
      memoryPersistConfidence: 0.8,
    });
    const records = await store.queryMemory({});
    assert.strictEqual(records.length, 1);
    assert.match(records[0].value, /reply: persist this durable lesson/);
    assert.doesNotMatch(records[0].value, /memoryInjected/);
  });

  test("store retention keeps negative records and caps total records", async () => {
    const store = createMemoryStore({ maxRecords: 2, ttlMs: 1, nowMs: Date.parse("2026-05-04T00:00:00.000Z") });
    store.upsert(rec({ id: "old", key: "old", updatedAt: "2020-01-01T00:00:00.000Z" }));
    store.upsert(rec({ id: "neg", scope: "negative", key: "neg", updatedAt: "2020-01-01T00:00:00.000Z" }));
    store.upsert(rec({ id: "fresh", key: "fresh", updatedAt: "2026-05-04T00:00:00.000Z" }));
    const records = await store.queryMemory({});
    assert.ok(records.some((record) => record.id === "neg"));
    assert.ok(records.some((record) => record.id === "fresh"));
    assert.ok(!records.some((record) => record.id === "old"));
    assert.ok(records.length <= 2);
  });
});
