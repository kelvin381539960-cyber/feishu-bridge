"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert");
const { createMemoryRecord } = require("../lib/brain/memory/memory-record");
const { routeMemory } = require("../lib/brain/memory/memory-router");
const { validateMemoryPack } = require("../lib/brain/memory/memory-pack");

function rec(input) {
  return createMemoryRecord({
    scope: "project",
    subject: "pipeline",
    key: "note",
    value: "use structured memory pack",
    source: "explicit",
    confidence: 0.8,
    updatedAt: "2026-05-04T00:00:00.000Z",
    ...input,
  });
}

describe("memory router", () => {
  test("returns MemoryPack with routing metadata and no prompt summary", () => {
    const pack = routeMemory({
      records: [rec({ id: "m1", key: "router" })],
      query: { task: "router" },
      budget: { memoryBudget: 100 },
      routing: { provider: "test" },
    });
    validateMemoryPack(pack);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(pack, "summary"), false);
    assert.strictEqual(pack.routing.provider, "test");
    assert.strictEqual(pack.routing.router, "memory-router");
  });

  test("negative memory is selected before positive memory", () => {
    const pack = routeMemory({
      records: [
        rec({ id: "pos", scope: "project", value: "positive task mode" }),
        rec({ id: "neg", scope: "negative", key: "do_not", value: "do not auto enter task mode" }),
      ],
      query: { task: "task mode" },
      budget: { memoryBudget: 200 },
      topK: 1,
    });
    assert.strictEqual(pack.partitions.negative.length, 1);
    assert.strictEqual(pack.records[0].id, "neg");
  });

  test("overflow trims by budget and records omitted reasons", () => {
    const pack = routeMemory({
      records: [
        rec({ id: "small", value: "small router memory" }),
        rec({ id: "huge", value: "x".repeat(1000) }),
      ],
      query: { task: "router" },
      budget: { memoryBudget: 20 },
      topK: 10,
    });
    assert.ok(pack.tokenEstimate <= 20);
    assert.ok(pack.omitted.some((item) => item.reason === "budget"));
  });

  test("negativeTopK caps excessive negative memory so it cannot consume all slots", () => {
    const pack = routeMemory({
      records: [
        rec({ id: "n1", scope: "negative", value: "negative one" }),
        rec({ id: "n2", scope: "negative", value: "negative two" }),
        rec({ id: "p1", scope: "project", value: "positive one" }),
      ],
      query: { task: "one two" },
      budget: { memoryBudget: 200 },
      topK: 3,
      negativeTopK: 1,
    });
    assert.strictEqual(pack.partitions.negative.length, 1);
    assert.ok(pack.partitions.positive.length >= 1);
  });
});
