"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  buildInteractiveCardPayload,
  extractTrailingUsageLine,
  atOuToLarkMd,
  MAX_CARD_JSON_BYTES,
} = require("../lib/feishu-im-card.js");

describe("feishu-im-card", () => {
  test("atOuToLarkMd", () => {
    assert.strictEqual(
      atOuToLarkMd("hi @ou_xx tail"),
      'hi <at id="ou_xx"></at> tail'
    );
  });

  test("buildInteractiveCardPayload 含 hr 与表格", () => {
    const md = `✅ 标题一行\n\n飞书文档已更新。\n\n---\n\n📸 **新增**\n\n| 样式 | 说明 |\n|------|------|\n| A | B |\n`;
    const { card, truncated } = buildInteractiveCardPayload(md);
    assert.strictEqual(truncated, false);
    assert.ok(card.config && card.config.wide_screen_mode);
    assert.ok(Array.isArray(card.elements));
    assert.ok(card.elements.some((e) => e.tag === "hr"));
    assert.ok(card.elements.some((e) => e.tag === "markdown"));
    assert.ok(Buffer.byteLength(JSON.stringify(card), "utf8") <= MAX_CARD_JSON_BYTES);
  });

  test("超长正文触发截断逻辑不抛错", () => {
    const huge = "x".repeat(50000);
    const { card } = buildInteractiveCardPayload(huge);
    assert.ok(card && card.elements && card.elements.length >= 1);
    assert.ok(Buffer.byteLength(JSON.stringify(card), "utf8") <= MAX_CARD_JSON_BYTES);
  });

  test("extractTrailingUsageLine 拆出末尾用量行", () => {
    const footer = "gpt-4o \u00b7 4.3k \u00b7 \u2014 \u00b7 \u2014";
    const t = `正文一行\n${footer}`;
    const ex = extractTrailingUsageLine(t);
    assert.strictEqual(ex.footer, footer);
    assert.ok(ex.body.includes("正文"));
  });

  test("交互卡片把用量行放在独立 element 末尾", () => {
    const footer = "m1 \u00b7 1k \u00b7 m2 \u00b7 2k";
    const t = `回答摘要\n${footer}`;
    const { card } = buildInteractiveCardPayload(t);
    const last = card.elements[card.elements.length - 1];
    assert.ok(!Object.prototype.hasOwnProperty.call(card, "header"));
    assert.strictEqual(last && last.text && last.text.tag, "lark_md");
    assert.ok(String(last.text.content).includes("2k"));
  });
});
