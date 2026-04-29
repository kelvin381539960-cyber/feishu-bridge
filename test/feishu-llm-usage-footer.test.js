"use strict";

const { test, describe, afterEach } = require("node:test");
const assert = require("node:assert");

const {
  appendLlmUsageFooterToReply,
  buildUsageDigest,
  buildUsageFooterLine,
  formatTokensAsK,
} = require("../lib/feishu-llm-usage-footer");
const { normalizeStructuredResult } = require("../lib/openclaw-control-plane/structured-result");

const prev = {
  footer: process.env.FEISHU_REPLY_USAGE_FOOTER,
  empty: process.env.FEISHU_REPLY_USAGE_EMPTY_ROW,
  skip: process.env.FEISHU_REPLY_USAGE_SKIP_WHEN_EMPTY,
  raw: process.env.FEISHU_REPLY_USAGE_TOKENS_RAW,
  cursorModel: process.env.CURSOR_AGENT_FULL_MODEL,
  execModel: process.env.FEISHU_REPLY_USAGE_EXECUTOR_MODEL,
  tokensUnit: process.env.FEISHU_REPLY_USAGE_TOKENS_UNIT,
  heavyAgentId: process.env.OPENCLAW_HEAVY_AGENT_ID,
};

afterEach(() => {
  for (const [k, v] of Object.entries(prev)) {
    const envKey =
      k === "footer"
        ? "FEISHU_REPLY_USAGE_FOOTER"
        : k === "empty"
          ? "FEISHU_REPLY_USAGE_EMPTY_ROW"
          : k === "skip"
            ? "FEISHU_REPLY_USAGE_SKIP_WHEN_EMPTY"
            : k === "raw"
              ? "FEISHU_REPLY_USAGE_TOKENS_RAW"
              : k === "cursorModel"
                ? "CURSOR_AGENT_FULL_MODEL"
                : k === "execModel"
                  ? "FEISHU_REPLY_USAGE_EXECUTOR_MODEL"
                  : k === "tokensUnit"
                    ? "FEISHU_REPLY_USAGE_TOKENS_UNIT"
                    : k === "heavyAgentId"
                      ? "OPENCLAW_HEAVY_AGENT_ID"
                    : "";
    if (!envKey) continue;
    if (v === undefined) delete process.env[envKey];
    else process.env[envKey] = v;
  }
});

describe("feishu llm usage footer", () => {
  test("formatTokensAsK defaults to wan (万)", () => {
    delete process.env.FEISHU_REPLY_USAGE_TOKENS_UNIT;
    assert.strictEqual(formatTokensAsK("1555000"), "155.5万");
    assert.strictEqual(formatTokensAsK("4310"), "0.43万");
    assert.strictEqual(formatTokensAsK("150"), "0.02万");
    assert.strictEqual(formatTokensAsK("42"), "0.0042万");
    assert.strictEqual(formatTokensAsK("0"), "0万");
  });

  test("formatTokensAsK uses k when FEISHU_REPLY_USAGE_TOKENS_UNIT=k", () => {
    process.env.FEISHU_REPLY_USAGE_TOKENS_UNIT = "k";
    assert.strictEqual(formatTokensAsK("4310"), "4.31k");
    assert.strictEqual(formatTokensAsK("150"), "0.15k");
    assert.strictEqual(formatTokensAsK("0"), "0k");
  });

  test("buildUsageDigest maps openclaw and cursor branches; footer uses 万", () => {
    const d = buildUsageDigest({
      candidate: {
        openclaw: { model: "router-mini", usage: { total_tokens: 42 } },
        cursor: { model: "sonnet", usage: { prompt_tokens: 100, completion_tokens: 50 } },
      },
    });
    assert.strictEqual(d.gwM, "router-mini");
    assert.strictEqual(d.gwT, "42");
    assert.strictEqual(d.exM, "sonnet");
    assert.strictEqual(d.exT, "150");
    const line = buildUsageFooterLine(d);
    assert.ok(line.includes("router-mini"));
    assert.ok(line.includes("0.0042万"));
    assert.ok(line.includes("sonnet"));
    assert.ok(line.includes("0.02万"));
  });

  test("OpenClaw usage prefers per-turn tokens and excludes cacheRead", () => {
    const d = buildUsageDigest({
      candidate: {
        openclaw: {
          model: "doubao",
          usage: { input: 123591, output: 80, totalTokens: 131663, cacheRead: 7992 },
        },
      },
    });
    assert.strictEqual(d.gwM, "doubao");
    assert.strictEqual(d.gwT, "123671");
    assert.ok(buildUsageFooterLine(d).includes("12.4万"));
  });

  test("append adds placeholder line when no usage signal and skip unset", () => {
    process.env.FEISHU_REPLY_USAGE_FOOTER = "1";
    delete process.env.FEISHU_REPLY_USAGE_SKIP_WHEN_EMPTY;
    const sr = normalizeStructuredResult({
      code: 0,
      runId: "r1",
      waitPayload: {
        structuredResult: {
          summary: "hi",
          executor: "cursor",
        },
      },
      fallbackText: "",
    });
    const out = appendLlmUsageFooterToReply("body\n", { code: 0, structuredResult: sr });
    assert.ok(out.startsWith("body\n"));
    assert.ok(out.includes("\u2014"));
    assert.match(out, /\n[^\n]+\n$/);
  });

  test("FEISHU_REPLY_USAGE_SKIP_WHEN_EMPTY=1 skips when no signal", () => {
    process.env.FEISHU_REPLY_USAGE_FOOTER = "1";
    process.env.FEISHU_REPLY_USAGE_SKIP_WHEN_EMPTY = "1";
    const sr = normalizeStructuredResult({
      code: 0,
      runId: "r1",
      waitPayload: {
        structuredResult: {
          summary: "hi",
          executor: "cursor",
        },
      },
      fallbackText: "",
    });
    const out = appendLlmUsageFooterToReply("body\n", { code: 0, structuredResult: sr });
    assert.strictEqual(out, "body\n");
  });

  test("single assistant in history: executor token blank when label is only from CURSOR hint", () => {
    process.env.CURSOR_AGENT_FULL_MODEL = "composer-2";
    process.env.OPENCLAW_HEAVY_AGENT_ID = "cursor";
    const d = buildUsageDigest({
      candidate: null,
      waitPayload: null,
      sendPayload: null,
      routeAgentId: "cursor",
      historyPayload: {
        messages: [
          {
            role: "assistant",
            model: "doubao-seed-2.0-code",
            usage: { input: 300000, output: 3500 },
            content: [{ type: "text", text: "a" }],
          },
        ],
      },
    });
    assert.strictEqual(d.gwM, "doubao-seed-2.0-code");
    assert.strictEqual(d.gwT, "303500");
    assert.strictEqual(d.exM, "composer-2");
    assert.strictEqual(d.exT, "");
    const line = buildUsageFooterLine(d);
    assert.ok(line.includes("composer-2"));
    assert.ok(line.endsWith(` \u00b7 \u2014`));
  });

  test("when history model duplicates gateway, executor label uses CURSOR_AGENT_FULL_MODEL", () => {
    process.env.CURSOR_AGENT_FULL_MODEL = "composer-2";
    process.env.OPENCLAW_HEAVY_AGENT_ID = "cursor";
    const d = buildUsageDigest({
      candidate: null,
      waitPayload: null,
      sendPayload: null,
      routeAgentId: "cursor",
      historyPayload: {
        messages: [
          {
            role: "assistant",
            model: "doubao-seed-2.0-code",
            usage: { input: 100000, output: 30300 },
            content: [{ type: "text", text: "a" }],
          },
          {
            role: "assistant",
            model: "doubao-seed-2.0-code",
            usage: { input: 100000, output: 30900 },
            content: [{ type: "text", text: "b" }],
          },
        ],
      },
    });
    assert.strictEqual(d.gwM, "doubao-seed-2.0-code");
    assert.strictEqual(d.exM, "composer-2");
    assert.ok(d.gwT && d.exT);
  });

  test("when route stays on main, cursor token is blank but cursor model still shown", () => {
    process.env.CURSOR_AGENT_FULL_MODEL = "composer-2";
    process.env.OPENCLAW_HEAVY_AGENT_ID = "cursor";
    const d = buildUsageDigest({
      candidate: null,
      waitPayload: { runId: "r1", status: "succeeded" },
      sendPayload: { runId: "r1" },
      routeAgentId: "main",
      historyPayload: {
        messages: [
          {
            role: "assistant",
            model: "doubao-seed-2.0-code",
            usage: { input: 123591, output: 80, totalTokens: 131663, cacheRead: 7992 },
            content: [{ type: "text", text: "hello" }],
          },
        ],
      },
    });
    assert.strictEqual(d.gwM, "doubao-seed-2.0-code");
    assert.strictEqual(d.gwT, "123671");
    assert.strictEqual(d.exM, "composer-2");
    assert.strictEqual(d.exT, "");
    assert.ok(buildUsageFooterLine(d).includes("composer-2"));
    assert.ok(buildUsageFooterLine(d).endsWith("—"));
  });

  test("usage from chat.history assistant message (OpenClaw input/output usage)", () => {
    process.env.FEISHU_REPLY_USAGE_FOOTER = "1";
    process.env.FEISHU_REPLY_USAGE_SKIP_WHEN_EMPTY = "1";
    const sr = normalizeStructuredResult({
      code: 0,
      runId: "r1",
      waitPayload: { runId: "r1", status: "succeeded" },
      sendPayload: { runId: "r1" },
      historyPayload: {
        messages: [
          { role: "user", content: "hi" },
          {
            role: "assistant",
            model: "composer-2",
            usage: { input: 120, output: 30, total: 150 },
            content: [{ type: "text", text: "hello" }],
          },
        ],
      },
      fallbackText: "hello",
    });
    const out = appendLlmUsageFooterToReply("body\n", { code: 0, structuredResult: sr });
    assert.ok(out.includes("composer-2"));
    assert.ok(out.includes("0.02万"));
  });

  test("append adds model and wan tokens when usageDigest has signal", () => {
    process.env.FEISHU_REPLY_USAGE_FOOTER = "1";
    const sr = normalizeStructuredResult({
      code: 0,
      runId: "r1",
      waitPayload: {
        structuredResult: {
          summary: "hi",
          model: "gpt-test",
          usage: { total_tokens: 9000 },
          executor: "cursor",
        },
      },
      fallbackText: "",
    });
    const out = appendLlmUsageFooterToReply("line", { code: 0, structuredResult: sr });
    assert.ok(out.includes("gpt-test"));
    assert.ok(out.includes("0.9万"));
    assert.match(out, /\n[^\n]+\n$/);
  });

  test("FEISHU_REPLY_USAGE_TOKENS_RAW shows integer tokens", () => {
    process.env.FEISHU_REPLY_USAGE_TOKENS_RAW = "1";
    const d = buildUsageDigest({
      candidate: {
        openclaw: { model: "m", usage: { total_tokens: 1000 } },
      },
    });
    const line = buildUsageFooterLine(d);
    assert.ok(line.includes("1000"));
    assert.ok(!line.includes("1k"));
  });
});
