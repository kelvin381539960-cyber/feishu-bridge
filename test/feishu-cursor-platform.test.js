"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { test, describe, afterEach } = require("node:test");
const assert = require("node:assert");

const {
  createMemoryFacade,
} = require("../lib/feishu-cursor/memory/memory-facade");
const {
  createTaskQueue,
} = require("../lib/feishu-cursor/runner/task-queue");
const {
  createFileStateStore,
} = require("../lib/feishu-cursor/ingestion/state-store");
const {
  createTelemetry,
} = require("../lib/feishu-cursor/observability/telemetry");

const TMP_FILES = [];

afterEach(() => {
  while (TMP_FILES.length) {
    const p = TMP_FILES.pop();
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch (_) {}
  }
});

function makeTmpDir(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), name));
  TMP_FILES.push(dir);
  return dir;
}

describe("memory facade", () => {
  test("builtin provider persists and retrieves memory", async () => {
    const dir = makeTmpDir("feishu-memory-");
    const storePath = path.join(dir, "memory.json");
    process.env.FEISHU_CURSOR_MEMORY_STORE = storePath;
    const chatId = `oc_plat_kyc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const facade = createMemoryFacade({});
    const persisted = await facade.persistMemoryTurn({
      chatId,
      userTask: "讨论 KYC 回调问题",
      replyBody: "已建议检查 webhook 超时与重试。",
    });
    assert.strictEqual(persisted.ok, true);

    const assembled = await facade.assembleMemoryContext({
      chatId,
      task: "继续看 KYC webhook 问题",
    });
    assert.strictEqual(assembled.injected, true);
    assert.match(assembled.task, /会话摘要/);
    assert.match(assembled.task, /KYC/);
    delete process.env.FEISHU_CURSOR_MEMORY_STORE;
  });

  test("builtin memory buckets by sessionId when same chatId", async () => {
    const dir = makeTmpDir("feishu-memory-sess-");
    const storePath = path.join(dir, "memory.json");
    process.env.FEISHU_CURSOR_MEMORY_STORE = storePath;
    const facade = createMemoryFacade({});
    await facade.persistMemoryTurn({
      chatId: "oc_same",
      sessionId: "agent:main:feishu:oc_same",
      userTask: "topic A",
      replyBody: "reply A",
    });
    await facade.persistMemoryTurn({
      chatId: "oc_same",
      sessionId: "agent:cursor:feishu:oc_same",
      userTask: "topic B",
      replyBody: "reply B",
    });
    const a = await facade.assembleMemoryContext({
      chatId: "oc_same",
      sessionId: "agent:main:feishu:oc_same",
      task: "continue A",
    });
    const b = await facade.assembleMemoryContext({
      chatId: "oc_same",
      sessionId: "agent:cursor:feishu:oc_same",
      task: "continue B",
    });
    assert.match(a.task, /reply A/);
    assert.match(b.task, /reply B/);
    assert.ok(!String(a.task).includes("reply B"));
    assert.ok(!String(b.task).includes("reply A"));
    delete process.env.FEISHU_CURSOR_MEMORY_STORE;
  });
});

describe("task queue", () => {
  test("serial queue preserves order and captures wait time", async () => {
    const queue = createTaskQueue({ mode: "serial" });
    const order = [];
    const p1 = queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 40));
      order.push(1);
      return "one";
    });
    const p2 = queue.enqueue(async () => {
      order.push(2);
      return "two";
    });
    const r1 = await p1;
    const r2 = await p2;
    assert.deepStrictEqual(order, [1, 2]);
    assert.strictEqual(r1.result, "one");
    assert.strictEqual(r2.result, "two");
    assert.ok(r2.metadata.queueWaitMs >= 0);
  });
});

describe("state store and telemetry", () => {
  test("file state store round-trips snapshot", () => {
    const dir = makeTmpDir("feishu-state-");
    const file = path.join(dir, "state.json");
    const store = createFileStateStore(file);
    store.save({ recentMessageIds: [["m1", 1]] });
    assert.deepStrictEqual(store.load(), { recentMessageIds: [["m1", 1]] });
  });

  test("telemetry writes jsonl when file is configured", () => {
    const dir = makeTmpDir("feishu-telemetry-");
    const file = path.join(dir, "telemetry.jsonl");
    const logs = [];
    const telemetry = createTelemetry({
      logger: { log: (...args) => logs.push(args.join(" ")) },
      filePath: file,
    });
    telemetry.emit("runner_completed", { traceId: "t1", code: 0 });
    const content = fs.readFileSync(file, "utf8");
    assert.match(content, /runner_completed/);
    assert.ok(logs.length >= 1);
  });
});
