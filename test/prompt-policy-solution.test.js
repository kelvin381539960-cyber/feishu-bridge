"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");

const { buildPromptText } = require("../lib/feishu-cursor/policies/prompt-policy");

describe("prompt-policy solution PR2", () => {
  test("release mode injects 灰度 structure", () => {
    const out = buildPromptText("灰度方案", {
      workflowKey: "solution",
      taskType: "solution",
      solutionMode: "release",
    });
    assert.match(out, /灰度\s*\/\s*发布方案/);
    assert.match(out, /禁止输出过程性语句/);
    assert.match(out, /Markdown 表格/);
  });
});
