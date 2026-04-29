"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");

const {
  stripLeadingProcessNarration,
} = require("../lib/feishu-cursor/strip-process-narration");

describe("strip-process-narration PR2", () => {
  test("removes leading noise lines", () => {
    const raw = "正在检索资料…\n正在整理中\n\n# 标题\n正文";
    const out = stripLeadingProcessNarration(raw);
    assert.match(out, /^# 标题/);
  });

  test("no-op when substantive first", () => {
    const raw = "# 报告\n正文";
    assert.strictEqual(stripLeadingProcessNarration(raw), raw);
  });
});
