"use strict";

const { test, describe, afterEach } = require("node:test");
const assert = require("node:assert");
const {
  timingAnchorLabel,
  getCursorMetaStyle,
  buildFeishuTimingFooter,
  appendFeishuTimingToReplyBody,
} = require("../lib/feishu-reply-timing.js");

describe("feishu-reply-timing", () => {
  afterEach(() => {
    delete process.env.FEISHU_CURSOR_META_STYLE;
  });

  test("timingAnchorLabel", () => {
    assert.strictEqual(timingAnchorLabel({}), "本服务收到事件");
    assert.strictEqual(
      timingAnchorLabel({ messageCreateTimeMs: 1 }),
      "飞书消息时间"
    );
  });

  test("buildFeishuTimingFooter compact (default)", () => {
    const f = buildFeishuTimingFooter(11000, 10000, { messageCreateTimeMs: 1 });
    assert.strictEqual(f, " R=1.0s");
    assert.strictEqual(buildFeishuTimingFooter(NaN, 10000, {}), "");
  });

  test("getCursorMetaStyle / off", () => {
    process.env.FEISHU_CURSOR_META_STYLE = "off";
    assert.strictEqual(getCursorMetaStyle(), "off");
    assert.strictEqual(
      buildFeishuTimingFooter(11000, 10000, { messageCreateTimeMs: 1 }),
      ""
    );
  });

  test("buildFeishuTimingFooter full", () => {
    process.env.FEISHU_CURSOR_META_STYLE = "full";
    const f = buildFeishuTimingFooter(11000, 10000, { messageCreateTimeMs: 1 });
    assert.ok(f.includes("1.0"));
    assert.ok(f.includes("飞书消息时间"));
  });

  test("appendFeishuTimingToReplyBody compact strips trailing newlines", () => {
    const body = "line1\n\nmeta | M=1s API=1s\n\n";
    const out = appendFeishuTimingToReplyBody(body, 11000, 10000, {});
    assert.strictEqual(out, "line1\n\nmeta | M=1s API=1s R=1.0s\n");
  });

  test("appendFeishuTimingToReplyBody full appends block", () => {
    process.env.FEISHU_CURSOR_META_STYLE = "full";
    const body = "ok\n";
    const out = appendFeishuTimingToReplyBody(body, 11000, 10000, {});
    assert.ok(out.startsWith("ok\n"));
    assert.ok(out.includes("端到端"));
  });
});
