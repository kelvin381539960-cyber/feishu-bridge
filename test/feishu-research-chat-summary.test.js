"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");

const {
  extractFirstH1Text,
  extractH2Outline,
  extractSummaryNarrative,
  buildResearchChatSummary,
} = require("../lib/feishu-research-chat-summary");

describe("feishu-research-chat-summary", () => {
  test("extractFirstH1Text", () => {
    const md = "# Hello\n\n## A\n";
    assert.strictEqual(extractFirstH1Text(md), "Hello");
  });

  test("extractH2Outline skips 澄清假设", () => {
    const md = `# T\n\n## 澄清假设与待确认问题\n\n## 背景\n\n## 机制\n`;
    const o = extractH2Outline(md);
    assert.ok(o.includes("背景"));
    assert.ok(!o.some((x) => /澄清假设/.test(x)));
  });

  test("extractSummaryNarrative skips 澄清 and takes next section", () => {
    const md = [
      "# T",
      "## 澄清假设与待确认问题",
      "x",
      "## 背景",
      "马来西亚与菲律宾银行应用常用「Payment due」类表述。",
      "",
    ].join("\n");
    const n = extractSummaryNarrative(md, 500);
    assert.ok(n.includes("马来西亚"));
    assert.ok(!n.includes("澄清"));
  });

  test("buildResearchChatSummary uses H1, 总结 narrative, and 章节要点", () => {
    const full = [
      "# 马来西亚与菲律宾信贷/银行/信用卡类 App「即将到期还款」用语调研",
      "",
      "> 日期",
      "",
      "## 1. 背景与定义",
      "",
      "两国监管与用语习惯不同，信用卡 App 常展示下期账单日与最低还款。",
      "",
      "## 2. 应用侧用语",
      "",
    ].join("\n");
    const s = buildResearchChatSummary({
      fullMarkdown: full,
      docUrl: "https://example.feishu.cn/docx/abc123",
      fallbackTitle: "fallback",
    });
    assert.ok(s.includes("马来西亚与菲律宾"));
    assert.ok(s.includes("总结"));
    assert.ok(s.includes("章节要点"));
    assert.ok(s.includes("1. 背景与定义"));
    assert.ok(s.includes("信用卡") || s.includes("两国"));
    assert.ok(s.includes("https://example.feishu.cn/docx/abc123"));
  });
});
