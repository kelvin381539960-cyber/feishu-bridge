"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert");

const {
  buildFeishuTaskEnvelope,
} = require("../lib/feishu-channel/models/feishu-task-envelope");
const {
  buildGatewayChatSendParams,
  buildFallbackGatewayRequest,
} = require("../lib/openclaw-gateway-adhoc");
const {
  buildFeishuIdempotencyKey,
  buildFeishuSessionKey,
  buildOpenclawDispatchRequest,
} = require("../lib/openclaw-control-plane/session-dispatch");

describe("feishu task envelope", () => {
  test("builds normalized channel envelope", () => {
    const envelope = buildFeishuTaskEnvelope({
      extracted: {
        chatId: "oc_1",
        messageId: "m_1",
        messageType: "text",
        text: "hello",
        messageCreateTimeMs: 1710000000000,
      },
      data: {
        sender: { sender_id: { open_id: "ou_sender" } },
        message: {
          chat_id: "oc_1",
          message_id: "m_1",
          parent_id: "p_1",
          mentions: [{ id: { open_id: "ou_x" }, name: "张三" }],
        },
      },
      routing: { direct: true, prefix: "/figma" },
      runtimeMode: "plugin-native",
      groupRequireAtBot: true,
      fullTaskPrefixes: ["/code", "/编程"],
      task: "hello",
      userTask: "hello",
      normalizedTask: "hello normalized",
      receivedAtMs: 1710000000999,
    });

    assert.strictEqual(envelope.source, "feishu");
    assert.strictEqual(envelope.sourceChatId, "oc_1");
    assert.strictEqual(envelope.sourceMessageId, "m_1");
    assert.strictEqual(envelope.replyTarget.chatId, "oc_1");
    assert.strictEqual(envelope.replyTarget.parentId, "p_1");
    assert.strictEqual(envelope.channelConstraints.runtimeMode, "plugin-native");
    assert.deepStrictEqual(envelope.channelConstraints.fullTaskPrefixes, ["/code", "/编程"]);
    assert.strictEqual(envelope.timestamps.receivedAtMs, 1710000000999);
    assert.strictEqual(envelope.timestamps.messageCreateTimeMs, 1710000000000);
  });
});

describe("openclaw dispatch shaping", () => {
  test("builds stable session and dispatch request from envelope", () => {
    const envelope = buildFeishuTaskEnvelope({
      extracted: { chatId: "oc_2", messageId: "m_2", messageType: "text" },
      data: { message: { chat_id: "oc_2", message_id: "m_2" } },
    });
    // Test session key without route (backward compatibility - returns legacy format)
    assert.strictEqual(buildFeishuSessionKey(envelope), "feishu:oc_2");
    // Test session key with route (new format with agent id)
    assert.strictEqual(buildFeishuSessionKey(envelope, { agentId: "main" }), "agent:main:feishu:oc_2");

    const dispatch = buildOpenclawDispatchRequest({
      envelope,
      prompt: { task: "run task" },
      runner: {
        agentProfile: "full",
        permissionMode: "workspace-write",
        cleanCwd: false,
      },
    });

    assert.deepStrictEqual(dispatch, {
      task: "run task",
      route: {
        routeClass: "light",
        agentId: "main",
        fallbackAgentId: "main",
        reasonCodes: [],
      },
      opts: {
        chatId: "oc_2",
        messageId: "m_2",
        sessionId: "agent:main:feishu:oc_2",
        agentProfile: "full",
        permissionMode: "workspace-write",
        cleanCwd: false,
        routeHint: dispatch.opts.routeHint, // circular reference in actual
        gatewayRequest: {
          sessionKey: "agent:main:feishu:oc_2",
          idempotencyKey: "feishu-msg:main:m_2",
          channelRuntimeMode: "legacy-bridge",
        },
      },
    });
  });

  test("plugin-native mode changes session and idempotency namespace", () => {
    const envelope = buildFeishuTaskEnvelope({
      extracted: { chatId: "oc_3", messageId: "m_3", messageType: "text" },
      data: { message: { chat_id: "oc_3", message_id: "m_3" } },
      runtimeMode: "plugin-native",
    });
    // Without route, returns legacy format
    assert.strictEqual(buildFeishuSessionKey(envelope), "feishu-plugin:oc_3");
    assert.strictEqual(buildFeishuIdempotencyKey(envelope), "feishu-plugin-msg:main:m_3");
    // With route including agentId, returns new format
    assert.strictEqual(buildFeishuSessionKey(envelope, { agentId: "main" }), "agent:main:feishu-plugin:oc_3");
    assert.strictEqual(buildFeishuIdempotencyKey(envelope, { agentId: "main" }), "feishu-plugin-msg:main:m_3");

    const dispatch = buildOpenclawDispatchRequest({
      envelope,
      prompt: { task: "run task" },
      runner: {},
    });
    assert.deepStrictEqual(dispatch.opts.gatewayRequest, {
      sessionKey: "agent:main:feishu-plugin:oc_3",
      idempotencyKey: "feishu-plugin-msg:main:m_3",
      channelRuntimeMode: "plugin-native",
    });
  });

  test("OPENCLAW_FEISHU_SESSION_NAMESPACE segments session and idempotency keys", () => {
    const envelope = buildFeishuTaskEnvelope({
      extracted: { chatId: "oc_ns", messageId: "m_ns", messageType: "text" },
      data: { message: { chat_id: "oc_ns", message_id: "m_ns" } },
      userTask: "ping",
      task: "ping",
    });
    const runtimeConfig = { openclawFeishuSessionNamespace: "prod" };
    assert.strictEqual(
      buildFeishuSessionKey(envelope, { agentId: "main" }, runtimeConfig),
      "agent:main:feishu:prod:oc_ns"
    );
    assert.strictEqual(
      buildFeishuIdempotencyKey(envelope, { agentId: "cursor" }, runtimeConfig),
      "feishu-msg:cursor:prod:m_ns"
    );

    const dispatch = buildOpenclawDispatchRequest({
      envelope,
      prompt: { task: "ping" },
      runner: {},
      classification: { taskType: "general" },
      runtimeConfig,
    });
    assert.strictEqual(dispatch.opts.sessionId, "agent:main:feishu:prod:oc_ns");
    assert.strictEqual(dispatch.opts.gatewayRequest.idempotencyKey, "feishu-msg:main:prod:m_ns");
  });

  test("namespace applies to plugin-native session rest", () => {
    const envelope = buildFeishuTaskEnvelope({
      extracted: { chatId: "oc_p", messageId: "m_p", messageType: "text" },
      data: { message: { chat_id: "oc_p", message_id: "m_p" } },
      runtimeMode: "plugin-native",
    });
    const runtimeConfig = { openclawFeishuSessionNamespace: "gray" };
    assert.strictEqual(
      buildFeishuSessionKey(envelope, { agentId: "main" }, runtimeConfig),
      "agent:main:feishu-plugin:gray:oc_p"
    );
    assert.strictEqual(
      buildFeishuIdempotencyKey(envelope, { agentId: "main" }, runtimeConfig),
      "feishu-plugin-msg:main:gray:m_p"
    );
  });

  test("gateway fallback replaces agent id with namespace in idempotency", () => {
    const fb = buildFallbackGatewayRequest(
      {
        sessionKey: "agent:cursor:feishu:prod:oc_1",
        idempotencyKey: "feishu-msg:cursor:prod:m_1",
      },
      { fallbackAgentId: "main", agentId: "cursor" }
    );
    assert.strictEqual(fb.sessionKey, "agent:main:feishu:prod:oc_1");
    assert.strictEqual(fb.idempotencyKey, "feishu-msg:main:prod:m_1");
  });

  test("gateway params prefer explicit gateway request over legacy fields", () => {
    const params = buildGatewayChatSendParams("hello", {
      sessionId: "feishu:old",
      messageId: "m_legacy",
      gatewayRequest: {
        sessionKey: "feishu:new",
        idempotencyKey: "custom-key",
        timeoutMs: 1234,
      },
    });
    assert.deepStrictEqual(params, {
      taskStr: "hello",
      sessionKey: "feishu:new",
      idempotencyKey: "custom-key",
      waitMs: 1234,
      channelRuntimeMode: "legacy-bridge",
    });
  });
});
