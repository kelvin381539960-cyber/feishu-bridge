"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");

const { loadFeishuCursorConfig } = require("../lib/feishu-cursor/config/load-feishu-cursor-config");
const { createTaskContext } = require("../lib/feishu-cursor/models/task-context");
const { createTaskClassification } = require("../lib/feishu-cursor/models/task-classification");
const { normalizeExecutionResult } = require("../lib/feishu-cursor/models/execution-result");

describe("feishu-cursor config loader", () => {
  test("defaults are stable and safe", () => {
    const c = loadFeishuCursorConfig({});
    assert.strictEqual(c.appId, "");
    assert.strictEqual(c.appSecretFile, "/etc/feishu-ws-cursor-bot.secret");
    assert.strictEqual(c.larkDomain, "feishu");
    assert.strictEqual(c.triggerEnabled, false);
    assert.strictEqual(c.mode, "prefix");
    assert.strictEqual(c.prefix, "/figma");
    assert.strictEqual(c.direct, false);
    assert.strictEqual(c.dedupTtlMs, 120000);
    assert.strictEqual(c.credentialPollMs, 60000);
    assert.deepStrictEqual(c.fullTaskPrefixes, ["/code", "/编程"]);
    assert.strictEqual(c.relayPolicyMode, "shadow");
    assert.strictEqual(c.queueMode, "inline");
    assert.strictEqual(c.telemetryFile, "");
    assert.strictEqual(c.stateStoreFile, "");
    assert.strictEqual(c.channelRuntimeMode, "legacy-bridge");
    assert.strictEqual(c.gatewayHeavyAgentId, "cursor");
    assert.strictEqual(c.gatewayLightAgentId, "main");
    assert.strictEqual(c.openclawFeishuSessionNamespace, "");
    assert.strictEqual(c.prefixMissHintEnabled, true);
    assert.strictEqual(c.researchClarifyFirst, true);
    assert.strictEqual(c.researchWorkflowV2, false);
    assert.strictEqual(c.researchCrawlerAgentId, "");
    assert.strictEqual(c.researchAnalystAgentId, "");
    assert.strictEqual(c.researchQualityRepair, true);
  });

  test("direct mode + flags parsed correctly", () => {
    const c = loadFeishuCursorConfig({
      FEISHU_APP_ID: "cli_xxx",
      FEISHU_APP_SECRET_FILE: "/tmp/secret",
      FEISHU_LARK_DOMAIN: "lark",
      FEISHU_CURSOR_TRIGGER_ENABLED: "1",
      FEISHU_CURSOR_MODE: "direct",
      FEISHU_CURSOR_TRIGGER_PREFIX: "/cursor",
      FEISHU_CURSOR_ENFORCE_ALLOWED_CHAT_IDS: "1",
      FEISHU_CURSOR_ALLOWED_CHAT_IDS: "oc_a,oc_b",
      FEISHU_CURSOR_GROUP_REQUIRE_AT_BOT: "0",
      FEISHU_CURSOR_DIRECT_PROFILE: "fast",
      CURSOR_FULL_TASK_PREFIXES: "/code,/dev",
      FEISHU_WS_DEDUP_TTL_MS: "90000",
      FEISHU_WS_CREDENTIAL_POLL_MS: "30000",
      FEISHU_CURSOR_RELAY_POLICY_MODE: "enforce",
      FEISHU_CURSOR_QUEUE_MODE: "serial",
      FEISHU_CURSOR_TELEMETRY_FILE: "/tmp/telemetry.jsonl",
      FEISHU_CURSOR_STATE_STORE_FILE: "/tmp/state.json",
      FEISHU_CHANNEL_RUNTIME_MODE: "plugin-native",
      OPENCLAW_HEAVY_AGENT_ID: "cursor-heavy",
      OPENCLAW_LIGHT_AGENT_ID: "main-light",
      OPENCLAW_FEISHU_SESSION_NAMESPACE: "bridge-a",
    });
    assert.strictEqual(c.appId, "cli_xxx");
    assert.strictEqual(c.appSecretFile, "/tmp/secret");
    assert.strictEqual(c.larkDomain, "lark");
    assert.strictEqual(c.triggerEnabled, true);
    assert.strictEqual(c.mode, "direct");
    assert.strictEqual(c.direct, true);
    assert.strictEqual(c.prefix, "/cursor");
    assert.strictEqual(c.enforceAllowedChatIds, true);
    assert.strictEqual(c.allowedChatIdsRaw, "oc_a,oc_b");
    assert.strictEqual(c.groupRequireAtBot, false);
    assert.strictEqual(c.directLegacyFast, true);
    assert.deepStrictEqual(c.fullTaskPrefixes, ["/code", "/dev"]);
    assert.strictEqual(c.dedupTtlMs, 90000);
    assert.strictEqual(c.credentialPollMs, 30000);
    assert.strictEqual(c.relayPolicyMode, "enforce");
    assert.strictEqual(c.queueMode, "serial");
    assert.strictEqual(c.telemetryFile, "/tmp/telemetry.jsonl");
    assert.strictEqual(c.stateStoreFile, "/tmp/state.json");
    assert.strictEqual(c.channelRuntimeMode, "plugin-native");
    assert.strictEqual(c.gatewayHeavyAgentId, "cursor-heavy");
    assert.strictEqual(c.gatewayLightAgentId, "main-light");
    assert.strictEqual(c.openclawFeishuSessionNamespace, "bridge-a");
  });

});

describe("task context model", () => {
  test("createTaskContext builds normalized shape", () => {
    const x = createTaskContext({
      traceId: "t1",
      chatId: "oc_x",
      messageId: "m1",
      task: "hello",
      parentContextInjected: 1,
      profile: "fast",
      meta: { source: "ws" },
    });
    assert.deepStrictEqual(x, {
      traceId: "t1",
      chatId: "oc_x",
      messageId: "m1",
      messageType: "",
      rawTask: "hello",
      task: "hello",
      userTask: "hello",
      normalizedTask: "hello",
      mediaText: "",
      parentContextInjected: true,
      mentionContextInjected: false,
      memoryInjected: false,
      sheetTaskDetected: false,
      relayShortcutReply: "",
      profile: "fast",
      classification: null,
      relayDecision: null,
      safety: null,
      memory: null,
      prompt: null,
      execution: null,
      meta: { source: "ws" },
    });
  });

  test("task classification and execution result models normalize fields", () => {
    const c = createTaskClassification({
      taskType: "relay",
      confidence: 2,
      requiresTooling: 1,
      reasons: ["a", "", "b"],
    });
    assert.deepStrictEqual(c, {
      taskType: "relay",
      confidence: 1,
      requiresTooling: true,
      requiresFullRunner: false,
      needsClarification: false,
      reasons: ["a", "b"],
    });

    const cr = createTaskClassification({
      taskType: "research",
      stage: "execute",
      qaContext: "  ans  ",
      workflowId: "wf1",
      reasons: ["r"],
    });
    assert.strictEqual(cr.taskType, "research");
    assert.strictEqual(cr.stage, "execute");
    assert.strictEqual(cr.qaContext, "ans");
    assert.strictEqual(cr.workflowId, "wf1");

    const r = normalizeExecutionResult({
      code: 0,
      stdout: "ok",
      runnerType: "openclaw",
      queueWaitMs: 9,
      agentProfile: "fast",
      researchMeta: { mode: "research_v2", crawlerOk: true },
    });
    assert.deepStrictEqual(r, {
      ok: true,
      code: 0,
      stdout: "ok",
      stderr: "",
      error: null,
      runnerType: "openclaw",
      backendMode: "openclaw",
      queueMode: "inline",
      queueWaitMs: 9,
      queueDepth: 0,
      agentProfile: "fast",
      permissionMode: undefined,
      cleanCwd: false,
      ackMode: undefined,
      degradeReason: "",
      routeClass: "",
      routeAgentId: "",
      sessionId: "",
      routeReasonCodes: [],
      structuredResult: null,
      researchMeta: { mode: "research_v2", crawlerOk: true },
    });
  });
});
