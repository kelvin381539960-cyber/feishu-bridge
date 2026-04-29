"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");

const { markdownToFeishuDescendants } = require("../lib/feishu-docx-markdown");

describe("markdownToFeishuDescendants", () => {
  test("heading and paragraph", () => {
    const blocks = markdownToFeishuDescendants("# Title\n\nHello world.");
    assert.ok(blocks.length >= 2);
    assert.strictEqual(blocks[0].block_type, 22);
    assert.strictEqual(blocks[1].block_type, 3);
  });

  test("bullet and ordered", () => {
    const blocks = markdownToFeishuDescendants("- a\n1. b");
    assert.strictEqual(blocks[0].block_type, 12);
    assert.strictEqual(blocks[1].block_type, 13);
  });

  test("code fence", () => {
    const blocks = markdownToFeishuDescendants("```\nx\n```");
    assert.strictEqual(blocks[0].block_type, 14);
  });

  test("divider", () => {
    const blocks = markdownToFeishuDescendants("---");
    assert.strictEqual(blocks[0].block_type, 22);
  });

  test("table becomes code block", () => {
    const md = "|a|b|\n|---|---|\n|1|2|";
    const blocks = markdownToFeishuDescendants(md);
    assert.strictEqual(blocks[0].block_type, 14);
    assert.ok(String(blocks[0].code.elements[0].text_run.content).includes("a"));
  });
});
