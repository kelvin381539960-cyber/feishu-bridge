"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");

const { resolveSolutionMode } = require("../lib/feishu-cursor/policies/solution-mode");

describe("solution-mode PR2", () => {
  test("release wins for 灰度发布方案", () => {
    assert.strictEqual(
      resolveSolutionMode("新任务，帮我做一个新产品灰度发布方案"),
      "release"
    );
  });

  test("feasibility before release when both appear", () => {
    assert.strictEqual(
      resolveSolutionMode("对比两个方案的可行性，并给一个灰度上线建议"),
      "feasibility"
    );
  });

  test("growth for 增长实验", () => {
    assert.strictEqual(resolveSolutionMode("增长方案与 A/B 实验设计"), "growth");
  });

  test("plan default for generic 方案", () => {
    assert.strictEqual(resolveSolutionMode("帮我出一个整体方案"), "plan");
  });
});
