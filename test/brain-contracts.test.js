"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert");

function assertRequiredString(obj, key) {
  assert.strictEqual(typeof obj[key], "string", `${key} must be string`);
  assert.ok(obj[key].trim(), `${key} must not be empty`);
}

function validateTaskEnvelope(envelope) {
  assertRequiredString(envelope, "source");
  assert.ok(envelope.channel && typeof envelope.channel === "object");
  assertRequiredString(envelope.channel, "name");
  assertRequiredString(envelope.channel, "chatId");
  assertRequiredString(envelope.channel, "messageId");
  assert.ok(envelope.content && typeof envelope.content === "object");
  assert.strictEqual(typeof envelope.content.text, "string");
  assert.ok(Array.isArray(envelope.content.attachments));
  assert.ok(envelope.context && typeof envelope.context === "object");
  assert.ok(Array.isArray(envelope.context.mentions));
  assert.ok(envelope.routing && typeof envelope.routing === "object");
  assert.strictEqual(typeof envelope.routing.allowed, "boolean");
  assert.ok(envelope.trace && typeof envelope.trace === "object");
  assertRequiredString(envelope.trace, "traceId");
  assert.strictEqual(typeof envelope.trace.receivedAtMs, "number");
}

function validateBrainContextV0(ctx) {
  validateTaskEnvelope(ctx.envelope);
  assert.ok(ctx.flags && typeof ctx.flags === "object");
  assert.strictEqual(typeof ctx.flags.shortCircuited, "boolean");
  assert.strictEqual(typeof ctx.flags.needsAck, "boolean");
  assert.ok(Array.isArray(ctx.telemetry));
  assert.ok(Array.isArray(ctx.errors));
}

function validateExecutionPlan(plan) {
  assertRequiredString(plan, "workflowKey");
  assertRequiredString(plan, "taskType");
  assertRequiredString(plan, "stage");
  assert.ok(["clarify", "execute", "finalize"].includes(plan.stage));
  assert.ok(plan.runner && typeof plan.runner === "object");
  assertRequiredString(plan.runner, "type");
  assert.strictEqual(typeof plan.runner.multiAgentRequired, "boolean");
  assert.ok(plan.dispatch && typeof plan.dispatch === "object");
  assert.strictEqual(typeof plan.dispatch.task, "string");
  assert.ok(plan.policy && typeof plan.policy === "object");
  assert.ok(Array.isArray(plan.policy.reasonCodes));
}

function validateMemoryPack(pack) {
  assert.strictEqual(typeof pack.injected, "boolean");
  assert.ok(Array.isArray(pack.records));
  assert.strictEqual(typeof pack.tokenEstimate, "number");
  if (pack.injected) assert.strictEqual(typeof pack.summary, "string");
  assert.ok(Array.isArray(pack.omitted || []));
}

function validateTokenBudget(budget) {
  for (const key of [
    "totalLimit",
    "reservedForOutput",
    "reservedForTools",
    "memoryBudget",
    "artifactBudget",
    "conversationBudget",
    "safetyMargin",
  ]) {
    assert.strictEqual(typeof budget[key], "number", `${key} must be number`);
  }
  assert.ok(budget.totalLimit > 0);
  assert.ok(budget.safetyMargin >= 0 && budget.safetyMargin < 1);
}

describe("brain contracts", () => {
  test("TaskEnvelope v0 contains required routing, channel, content and trace fields", () => {
    validateTaskEnvelope({
      source: "feishu",
      channel: {
        name: "feishu",
        chatId: "oc_1",
        messageId: "om_1",
        runtimeMode: "plugin-native",
      },
      content: {
        text: "hello",
        normalizedText: "hello",
        attachments: [],
      },
      context: {
        quotedParent: null,
        mentions: [],
        memory: null,
      },
      routing: {
        mode: "direct",
        prefixMatched: true,
        allowed: true,
        reason: "",
      },
      trace: {
        traceId: "trace_1",
        receivedAtMs: 1710000000000,
      },
    });
  });

  test("BrainContext v0 is intentionally minimal for P3/P4", () => {
    validateBrainContextV0({
      envelope: {
        source: "feishu",
        channel: { name: "feishu", chatId: "oc_1", messageId: "om_1" },
        content: { text: "hello", attachments: [] },
        context: { mentions: [] },
        routing: { mode: "direct", allowed: true },
        trace: { traceId: "trace_1", receivedAtMs: 1710000000000 },
      },
      flags: {
        shortCircuited: false,
        needsAck: true,
        needsMemoryPersist: true,
        needsDocExport: false,
        skipDocExport: false,
      },
      telemetry: [],
      errors: [],
    });
  });

  test("ExecutionPlan has a single executable dispatch target", () => {
    validateExecutionPlan({
      workflowKey: "general",
      taskType: "general",
      stage: "execute",
      runner: { type: "openclaw", agentProfile: "fast", multiAgentRequired: false },
      dispatch: { task: "final task", opts: { sessionId: "s1", gatewayRequest: {} } },
      policy: { taskSize: "small", safetyLevel: "normal", reasonCodes: [] },
    });
  });

  test("MemoryPack and TokenBudget enforce bounded memory injection shape", () => {
    validateMemoryPack({
      injected: true,
      records: [],
      summary: "relevant memory summary",
      tokenEstimate: 320,
      omitted: [{ reason: "low_relevance", count: 3 }],
    });
    validateTokenBudget({
      totalLimit: 128000,
      reservedForOutput: 8000,
      reservedForTools: 12000,
      memoryBudget: 1500,
      artifactBudget: 3000,
      conversationBudget: 1200,
      safetyMargin: 0.2,
    });
  });
});
