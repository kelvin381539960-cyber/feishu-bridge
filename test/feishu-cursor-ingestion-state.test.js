"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");

const {
  createInMemoryPipelineState,
} = require("../lib/feishu-cursor/ingestion/in-memory-state");

describe("in-memory pipeline state", () => {
  test("dedup and outbound echo behavior", async () => {
    const s = createInMemoryPipelineState({ dedupTtlMs: 60000 });
    assert.strictEqual(await s.dedupConsume("m1"), false);
    assert.strictEqual(await s.dedupConsume("m1"), true);

    await s.rememberOutboundReply("oc_1", "hello");
    assert.strictEqual(await s.consumeRecentOutboundReply("oc_1", "hello"), true);
    assert.strictEqual(await s.consumeRecentOutboundReply("oc_1", "hello"), false);
  });

  test("merge-forward debounce keeps latest payload", async () => {
    const s = createInMemoryPipelineState({ mergeDebounceMs: 50 });
    const got = [];
    s.scheduleMergeForwardDebounce("c1", { id: 1 }, (x) => got.push(x.id));
    s.scheduleMergeForwardDebounce("c1", { id: 2 }, (x) => got.push(x.id));
    await new Promise((r) => setTimeout(r, 480));
    assert.deepStrictEqual(got, [2]);
  });
});
