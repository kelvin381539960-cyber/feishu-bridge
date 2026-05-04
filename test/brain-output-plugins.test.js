"use strict";

const { test } = require("node:test");
const assert = require("node:assert");

const { outputPlugins, runOutputPlugins } = require("../lib/brain/output/output-registry");
const { UsagePlugin, _test: usageTest } = require("../lib/brain/output/usage-plugin");
const { FeishuLimitPlugin, _test: limitTest } = require("../lib/brain/output/feishu-limit-plugin");
const { appendLlmUsageFooterToReply } = require("../lib/feishu-llm-usage-footer");

test("output plugin registry order is doc export → usage → limit", () => {
  assert.deepStrictEqual(
    outputPlugins.map((plugin) => plugin.constructor && plugin.constructor.name),
    ["DocExportPlugin", "UsagePlugin", "FeishuLimitPlugin"]
  );
});

test("usage plugin has explicit switch and defaults to legacy footer behavior", () => {
  const env = { FEISHU_OUTPUT_USAGE_PLUGIN: "1" };
  assert.strictEqual(usageTest.usagePluginEnabled(env), true);
  assert.strictEqual(usageTest.usagePluginEnabled({ FEISHU_OUTPUT_USAGE_PLUGIN: "0" }), false);

  const executionResult = {
    code: 0,
    structuredResult: {
      raw: {
        openclaw: { model: "gw-model", usage: { total_tokens: 10000 } },
        cursor: { model: "cursor-model", usage: { total_tokens: 20000 } },
      },
    },
    routeAgentId: process.env.OPENCLAW_HEAVY_AGENT_ID || "cursor",
  };
  const plugin = new UsagePlugin();
  const input = { replyBody: "hello", metadata: { before: true } };
  const actual = plugin.process({ env, executionResult }, input);
  const expected = appendLlmUsageFooterToReply("hello", executionResult);
  assert.strictEqual(actual.replyBody, expected);
  assert.strictEqual(actual.metadata.before, true);
  assert.strictEqual(actual.metadata.usageFooterApplied, true);
});

test("usage plugin off switch is no-op", () => {
  const plugin = new UsagePlugin();
  assert.strictEqual(plugin.match({ env: { FEISHU_OUTPUT_USAGE_PLUGIN: "0" } }, { replyBody: "hello" }), false);
  assert.deepStrictEqual(
    plugin.process({ env: { FEISHU_OUTPUT_USAGE_PLUGIN: "0" }, executionResult: { code: 0 } }, { replyBody: "hello", metadata: { ok: true } }),
    { replyBody: "hello", metadata: { ok: true } }
  );
});

test("feishu limit truncate requires explicit opt-in", () => {
  const envWithoutOptIn = {
    FEISHU_OUTPUT_LIMIT_MODE: "truncate",
    FEISHU_OUTPUT_MAX_CHARS: "500",
  };
  const envWithOptIn = {
    ...envWithoutOptIn,
    FEISHU_OUTPUT_LIMIT_TRUNCATE_ENABLED: "1",
  };
  assert.strictEqual(limitTest.resolveMode(envWithoutOptIn), "off");
  assert.strictEqual(limitTest.resolveMode(envWithOptIn), "truncate");

  const plugin = new FeishuLimitPlugin();
  const longBody = "x".repeat(800);
  assert.strictEqual(plugin.match({ env: envWithoutOptIn }, { replyBody: longBody }), false);
  const truncated = plugin.process({ env: envWithOptIn }, { replyBody: longBody, metadata: {} });
  assert.strictEqual(truncated.replyBody.length <= 500, true);
  assert.strictEqual(truncated.metadata.feishuLimitMode, "truncate");
});

test("real output plugins process in doc → usage → limit order", async () => {
  const prev = {
    FEISHU_CLOUD_DOC_EXPORT: process.env.FEISHU_CLOUD_DOC_EXPORT,
    FEISHU_OUTPUT_LIMIT_MODE: process.env.FEISHU_OUTPUT_LIMIT_MODE,
    FEISHU_OUTPUT_MAX_CHARS: process.env.FEISHU_OUTPUT_MAX_CHARS,
    FEISHU_OUTPUT_USAGE_PLUGIN: process.env.FEISHU_OUTPUT_USAGE_PLUGIN,
    FEISHU_REPLY_USAGE_TOKENS_RAW: process.env.FEISHU_REPLY_USAGE_TOKENS_RAW,
    FEISHU_OUTPUT_LIMIT_TRUNCATE_ENABLED: process.env.FEISHU_OUTPUT_LIMIT_TRUNCATE_ENABLED,
  };
  process.env.FEISHU_CLOUD_DOC_EXPORT = "1";
  process.env.FEISHU_OUTPUT_USAGE_PLUGIN = "1";
  process.env.FEISHU_REPLY_USAGE_TOKENS_RAW = "1";
  process.env.FEISHU_OUTPUT_LIMIT_MODE = "segment";
  process.env.FEISHU_OUTPUT_MAX_CHARS = "500";
  delete process.env.FEISHU_OUTPUT_LIMIT_TRUNCATE_ENABLED;

  try {
    const calls = [];
    const output = await runOutputPlugins({
      userTaskForChain: "技术调研 output plugin order",
      planUserTask: "技术调研 output plugin order",
      classification: { taskType: "research", workflowKey: "research" },
      prompt: { stage: "execute" },
      executionResult: {
        code: 0,
        structuredResult: {
          raw: {
            openclaw: { model: "gw", usage: { total_tokens: 11 } },
            cursor: { model: "ex", usage: { total_tokens: 22 } },
          },
        },
        routeAgentId: process.env.OPENCLAW_HEAVY_AGENT_ID || "cursor",
      },
      deps: {
        logger: { log: () => {}, error: () => {} },
        isResearchLikeTask: () => true,
        isReportLikeTask: () => false,
        exportResearchDocHook: async ({ replyBody, exportKind }) => {
          calls.push(`doc:${exportKind}`);
          return { replyBody: `DOC-URL\n${replyBody}` };
        },
      },
    }, {
      replyBody: `${"body sentence. ".repeat(80)}`,
      metadata: {},
    });

    assert.deepStrictEqual(calls, ["doc:research"]);
    assert.ok(String(output.replyBody).startsWith("DOC-URL\n"));
    assert.strictEqual(output.metadata.usageFooterApplied, true);
    assert.strictEqual(output.metadata.feishuLimitMode, "segment");
    assert.ok(Array.isArray(output.metadata.replySegments));
    assert.ok(output.metadata.replySegments.length > 1);
    assert.ok(output.metadata.replySegments[0].includes("DOC-URL"));
    assert.ok(output.metadata.replySegments[output.metadata.replySegments.length - 1].includes("gw · 11"));
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
