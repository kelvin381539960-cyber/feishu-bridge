"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert");

const { buildFeishuTaskEnvelope } = require("../lib/feishu-channel/models/feishu-task-envelope");
const { planOpenclawExecution } = require("../lib/openclaw-control-plane/request-planner");
const { normalizeExecutionResult } = require("../lib/feishu-cursor/models/execution-result");

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
  assert.strictEqual(typeof envelope.routing.mode, "string");
  assert.strictEqual(typeof envelope.routing.allowed, "boolean");
  assert.ok(envelope.trace && typeof envelope.trace === "object");
  assertRequiredString(envelope.trace, "traceId");
  assert.strictEqual(typeof envelope.trace.receivedAtMs, "number");
}

function validateBrainContextV0(ctx) {
  validateTaskEnvelope(ctx.envelope);
  assert.ok(ctx.flags && typeof ctx.flags === "object");
  for (const key of [
    "shortCircuited",
    "needsAck",
    "needsMemoryPersist",
    "needsDocExport",
    "skipDocExport",
  ]) {
    assert.strictEqual(typeof ctx.flags[key], "boolean", `${key} must be boolean`);
  }
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
  assert.ok(plan.dispatch.opts && typeof plan.dispatch.opts === "object");
  assert.strictEqual(typeof plan.dispatch.opts.sessionId, "string");
  assert.ok(plan.dispatch.opts.gatewayRequest && typeof plan.dispatch.opts.gatewayRequest === "object");
  assert.ok(plan.dispatch.route && typeof plan.dispatch.route === "object");
  assert.ok(Array.isArray(plan.dispatch.route.reasonCodes));
  assert.ok(plan.policy && typeof plan.policy === "object");
  assert.ok(Array.isArray(plan.policy.reasonCodes));
}

function validateExecutionResult(result) {
  assert.strictEqual(typeof result.code, "number");
  assert.strictEqual(typeof result.stdout, "string");
  assert.strictEqual(typeof result.stderr, "string");
  assert.ok(Array.isArray(result.artifacts));
  assert.ok(result.runtimeRunTrace || result.runtimeTrace || result.runnerType);
}

function validateMemoryRecord(record) {
  for (const key of ["id", "scope", "subject", "key", "value", "source", "updatedAt"]) {
    assertRequiredString(record, key);
  }
  assert.ok(["user", "project", "workflow", "session", "artifact", "negative"].includes(record.scope));
  assert.strictEqual(typeof record.confidence, "number");
  assert.ok(record.confidence >= 0 && record.confidence <= 1);
}

function validateMemoryPack(pack) {
  assert.strictEqual(typeof pack.injected, "boolean");
  assert.ok(Array.isArray(pack.records));
  for (const record of pack.records) validateMemoryRecord(record);
  assert.strictEqual(typeof pack.tokenEstimate, "number");
  if (pack.injected) assert.strictEqual(typeof pack.summary, "string");
  assert.ok(Array.isArray(pack.omitted));
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
  const allocated =
    budget.reservedForOutput +
    budget.reservedForTools +
    budget.memoryBudget +
    budget.artifactBudget +
    budget.conversationBudget;
  assert.ok(allocated < budget.totalLimit, "allocated budget must stay below total limit");
}

describe("brain contracts", () => {
  test("TaskEnvelope contract is validated against production buildFeishuTaskEnvelope output", () => {
    const envelope = buildFeishuTaskEnvelope({
      data: {
        sender: { sender_id: { open_id: "ou_1" } },
        message: {
          message_id: "om_1",
          chat_id: "oc_1",
          message_type: "text",
          content: JSON.stringify({ text: "hello" }),
        },
      },
      extracted: {
        chatId: "oc_1",
        messageId: "om_1",
        senderId: "ou_1",
        messageType: "text",
        text: "hello",
      },
      routing: { enabled: true, direct: true, prefix: "/figma" },
      runtimeMode: "plugin-native",
      groupRequireAtBot: false,
      fullTaskPrefixes: [],
      task: "hello",
      userTask: "hello",
      receivedAtMs: 1710000000000,
    });
    validateTaskEnvelope(envelope);
    assert.strictEqual(envelope.channel.runtimeMode, "plugin-native");
    assert.strictEqual(envelope.routing.mode, "direct");
  });

  test("BrainContext v0 is intentionally minimal for P3/P4", () => {
    const envelope = buildFeishuTaskEnvelope({
      data: {
        sender: { sender_id: { open_id: "ou_1" } },
        message: { message_id: "om_1", chat_id: "oc_1", message_type: "text" },
      },
      extracted: { chatId: "oc_1", messageId: "om_1", messageType: "text", text: "hello" },
      routing: { enabled: true, direct: true },
      task: "hello",
      userTask: "hello",
      receivedAtMs: 1710000000000,
    });
    validateBrainContextV0({
      envelope,
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

  test("ExecutionPlan contract is validated against production planOpenclawExecution output", () => {
    const envelope = buildFeishuTaskEnvelope({
      data: {
        sender: { sender_id: { open_id: "ou_1" } },
        message: { message_id: "om_plan", chat_id: "oc_plan", message_type: "text" },
      },
      extracted: { chatId: "oc_plan", messageId: "om_plan", messageType: "text", text: "hello" },
      routing: { enabled: true, direct: true },
      task: "hello",
      userTask: "hello",
      receivedAtMs: 1710000000000,
    });
    const planned = planOpenclawExecution({
      envelope,
      task: "hello",
      userTask: "hello",
      classificationMerge: null,
      messageType: "text",
      message: { message_id: "om_plan", chat_id: "oc_plan" },
      botOpenId: "ou_bot",
      routing: { enabled: true, direct: true },
      runtimeConfig: { channelRuntimeMode: "plugin-native" },
      isRelayLikeTask: () => false,
      isReportLikeTask: () => false,
      isResearchLikeTask: () => false,
      normalizeCursorTask: (x) => x,
      appendFeishuOpenIdMentionHint: (x) => x,
      resolveCursorAgentProfile: (task) => ({ profile: "full", task }),
    });
    validateExecutionPlan({
      workflowKey: planned.classification.workflowKey || planned.classification.taskType,
      taskType: planned.classification.taskType,
      stage: planned.prompt.stage,
      runner: {
        type: planned.runner.runnerType || "openclaw",
        agentProfile: planned.runner.agentProfile,
        multiAgentRequired: false,
      },
      dispatch: planned.dispatch,
      policy: {
        taskSize: "small",
        safetyLevel: planned.safety && planned.safety.blocked ? "blocked" : "normal",
        reasonCodes: planned.dispatch.route.reasonCodes || [],
      },
    });
  });

  test("ExecutionResult contract is validated against production normalizeExecutionResult output", () => {
    const result = normalizeExecutionResult({
      code: 1,
      stdout: "",
      stderr: "boom",
      error: { message: "boom" },
      runnerType: "openclaw",
      queueWaitMs: 7,
      routeReasonCodes: ["test"],
    });
    validateExecutionResult(result);
    assert.strictEqual(result.code, 1);
    assert.match(result.stderr, /boom/);
  });

  test("MemoryPack and TokenBudget enforce bounded memory injection shape", () => {
    validateMemoryPack({
      injected: true,
      records: [
        {
          id: "mem_1",
          scope: "negative",
          subject: "feishu-bridge",
          key: "do_not_auto_task_mode",
          value: "do not auto enter task mode",
          source: "explicit",
          confidence: 1,
          updatedAt: "2026-05-04T00:00:00Z",
        },
      ],
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
