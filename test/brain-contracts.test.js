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

function assertEnum(value, allowed, label) {
  assert.ok(allowed.includes(value), `${label} must be one of ${allowed.join(",")}`);
}

function validateMentionItem(item) {
  assert.ok(item && typeof item === "object", "mention item must be object");
  assert.ok(item.id && typeof item.id === "object", "mention.id must be object");
  assertRequiredString(item.id, "open_id");
}

function validateAttachmentItem(item) {
  assert.ok(item && typeof item === "object", "attachment item must be object");
  assertRequiredString(item, "type");
  assertEnum(item.type, ["image", "audio", "file", "video", "sticker", "merge_forward", "text"], "attachment.type");
}

function validateTaskEnvelope(envelope) {
  assertRequiredString(envelope, "source");
  assertEnum(envelope.source, ["feishu"], "source");
  assert.ok(envelope.channel && typeof envelope.channel === "object");
  assertRequiredString(envelope.channel, "name");
  assertEnum(envelope.channel.name, ["feishu"], "channel.name");
  assertRequiredString(envelope.channel, "chatId");
  assertRequiredString(envelope.channel, "messageId");
  assert.ok(envelope.content && typeof envelope.content === "object");
  assert.strictEqual(typeof envelope.content.text, "string");
  assert.ok(Array.isArray(envelope.content.attachments), "content.attachments must be array");
  for (const attachment of envelope.content.attachments) validateAttachmentItem(attachment);
  assert.ok(envelope.context && typeof envelope.context === "object");
  assert.ok(Array.isArray(envelope.context.mentions), "context.mentions must be array");
  for (const mention of envelope.context.mentions) validateMentionItem(mention);
  assert.ok(envelope.routing && typeof envelope.routing === "object");
  assertEnum(envelope.routing.mode, ["direct", "prefix"], "routing.mode");
  assert.strictEqual(typeof envelope.routing.allowed, "boolean");
  assert.ok(envelope.trace && typeof envelope.trace === "object");
  assertRequiredString(envelope.trace, "traceId");
  assert.strictEqual(typeof envelope.trace.receivedAtMs, "number");
}

function validateBrainContextV0(ctx) {
  validateTaskEnvelope(ctx.envelope);
  assert.ok(ctx.flags && typeof ctx.flags === "object");
  for (const key of ["shortCircuited", "needsAck", "needsMemoryPersist", "needsDocExport", "skipDocExport"]) {
    assert.strictEqual(typeof ctx.flags[key], "boolean", `${key} must be boolean`);
  }
  assert.ok(Array.isArray(ctx.telemetry));
  assert.ok(Array.isArray(ctx.errors));
}

function validateExecutionPlan(plan) {
  assertRequiredString(plan, "workflowKey");
  assertRequiredString(plan, "taskType");
  assertEnum(plan.stage, ["clarify", "execute", "finalize"], "stage");
  assert.ok(plan.runner && typeof plan.runner === "object");
  assertRequiredString(plan.runner, "type");
  assertEnum(plan.runner.type, ["openclaw", "specialized", "research-v2"], "runner.type");
  assert.strictEqual(typeof plan.runner.multiAgentRequired, "boolean");
  assert.ok(plan.dispatch && typeof plan.dispatch === "object");
  assertRequiredString(plan.dispatch, "task");
  assert.ok(plan.dispatch.opts && typeof plan.dispatch.opts === "object");
  assertRequiredString(plan.dispatch.opts, "sessionId");
  assert.ok(plan.dispatch.opts.gatewayRequest && typeof plan.dispatch.opts.gatewayRequest === "object", "gatewayRequest required");
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
  assertEnum(record.scope, ["user", "project", "workflow", "session", "artifact", "negative"], "scope");
  assert.strictEqual(typeof record.confidence, "number");
  assert.ok(record.confidence >= 0 && record.confidence <= 1);
}

function validateMemoryPack(pack) {
  assert.strictEqual(typeof pack.injected, "boolean");
  assert.ok(Array.isArray(pack.records));
  for (const record of pack.records) validateMemoryRecord(record);
  assert.strictEqual(typeof pack.tokenEstimate, "number");
  assert.ok(pack.tokenEstimate >= 0);
  if (pack.injected) assertRequiredString(pack, "summary");
  assert.ok(Array.isArray(pack.omitted));
}

function validateTokenBudget(budget) {
  for (const key of ["totalLimit", "reservedForOutput", "reservedForTools", "memoryBudget", "artifactBudget", "conversationBudget", "safetyMargin"]) {
    assert.strictEqual(typeof budget[key], "number", `${key} must be number`);
  }
  assert.ok(budget.totalLimit > 0);
  assert.ok(budget.safetyMargin >= 0 && budget.safetyMargin < 1);
  const allocated = budget.reservedForOutput + budget.reservedForTools + budget.memoryBudget + budget.artifactBudget + budget.conversationBudget;
  assert.ok(allocated < budget.totalLimit, "allocated budget must stay below total limit");
}

function validEnvelope() {
  return buildFeishuTaskEnvelope({
    data: {
      sender: { sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_1",
        chat_id: "oc_1",
        message_type: "text",
        mentions: [{ id: { open_id: "ou_bot" }, name: "Bot" }],
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
}

describe("brain contracts", () => {
  test("TaskEnvelope contract validates production buildFeishuTaskEnvelope output", () => {
    const envelope = validEnvelope();
    validateTaskEnvelope(envelope);
    assert.strictEqual(envelope.channel.runtimeMode, "plugin-native");
    assert.strictEqual(envelope.routing.mode, "direct");
  });

  test("TaskEnvelope contract rejects missing fields, invalid enums, mentions and attachments", () => {
    const envelope = validEnvelope();
    assert.throws(() => validateTaskEnvelope({ ...envelope, source: "" }));
    assert.throws(() => validateTaskEnvelope({ ...envelope, source: "slack" }));
    assert.throws(() => validateTaskEnvelope({ ...envelope, channel: { ...envelope.channel, chatId: "" } }));
    assert.throws(() => validateTaskEnvelope({ ...envelope, content: { ...envelope.content, attachments: null } }));
    assert.throws(() => validateTaskEnvelope({ ...envelope, content: { ...envelope.content, attachments: [{ type: "unknown" }] } }));
    assert.throws(() => validateTaskEnvelope({ ...envelope, context: { ...envelope.context, mentions: [{ id: {} }] } }));
    assert.throws(() => validateTaskEnvelope({ ...envelope, routing: { ...envelope.routing, mode: "unknown" } }));
    assert.throws(() => validateTaskEnvelope({ ...envelope, trace: { ...envelope.trace, receivedAtMs: "171" } }));
  });

  test("BrainContext v0 is intentionally minimal and rejects missing required flags", () => {
    const ctx = {
      envelope: validEnvelope(),
      flags: {
        shortCircuited: false,
        needsAck: true,
        needsMemoryPersist: true,
        needsDocExport: false,
        skipDocExport: false,
      },
      telemetry: [],
      errors: [],
    };
    validateBrainContextV0(ctx);
    assert.throws(() => validateBrainContextV0({ ...ctx, flags: { shortCircuited: false } }));
  });

  test("ExecutionPlan contract validates production planOpenclawExecution output", () => {
    const envelope = validEnvelope();
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

  test("ExecutionPlan contract rejects invalid runner, blank task and missing gatewayRequest", () => {
    const plan = {
      workflowKey: "general",
      taskType: "general",
      stage: "execute",
      runner: { type: "openclaw", multiAgentRequired: false },
      dispatch: { task: "hello", opts: { sessionId: "s1", gatewayRequest: {} }, route: { reasonCodes: [] } },
      policy: { reasonCodes: [] },
    };
    validateExecutionPlan(plan);
    assert.throws(() => validateExecutionPlan({ ...plan, runner: { type: "bad", multiAgentRequired: false } }));
    assert.throws(() => validateExecutionPlan({ ...plan, dispatch: { ...plan.dispatch, task: "" } }));
    assert.throws(() => validateExecutionPlan({ ...plan, dispatch: { ...plan.dispatch, opts: { sessionId: "s1" } } }));
  });

  test("ExecutionResult validates production normalizeExecutionResult output", () => {
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

  test("MemoryPack and TokenBudget enforce bounded memory injection shape and reject invalid values", () => {
    validateMemoryPack({
      injected: true,
      records: [{
        id: "mem_1",
        scope: "negative",
        subject: "feishu-bridge",
        key: "do_not_auto_task_mode",
        value: "do not auto enter task mode",
        source: "explicit",
        confidence: 1,
        updatedAt: "2026-05-04T00:00:00Z",
      }],
      summary: "relevant memory summary",
      tokenEstimate: 320,
      omitted: [{ reason: "low_relevance", count: 3 }],
    });
    validateTokenBudget({ totalLimit: 128000, reservedForOutput: 8000, reservedForTools: 12000, memoryBudget: 1500, artifactBudget: 3000, conversationBudget: 1200, safetyMargin: 0.2 });
    assert.throws(() => validateMemoryPack({ injected: true, records: [], tokenEstimate: 1, omitted: [] }));
    assert.throws(() => validateMemoryPack({ injected: true, records: [{ id: "m", scope: "bad", subject: "s", key: "k", value: "v", source: "explicit", confidence: 1, updatedAt: "now" }], summary: "x", tokenEstimate: 1, omitted: [] }));
    assert.throws(() => validateMemoryPack({ injected: true, records: [{ id: "m", scope: "user", subject: "s", key: "k", value: "v", source: "explicit", confidence: 2, updatedAt: "now" }], summary: "x", tokenEstimate: 1, omitted: [] }));
    assert.throws(() => validateTokenBudget({ totalLimit: 100, reservedForOutput: 50, reservedForTools: 30, memoryBudget: 20, artifactBudget: 10, conversationBudget: 5, safetyMargin: 0.2 }));
  });
});
