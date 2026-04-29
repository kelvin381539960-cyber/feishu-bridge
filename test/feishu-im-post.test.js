"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  buildZhCnPostContentFromText,
  buildZhCnPostRichFromText,
} = require("../lib/feishu-im-post.js");

describe("feishu-im-post", () => {
  test("无 @ou_ 返回 null", () => {
    assert.strictEqual(buildZhCnPostContentFromText("hello"), null);
  });

  test("含 @ou_ 生成 post zh_cn", () => {
    const p = buildZhCnPostContentFromText("hi @ou_abc123 tail");
    assert.ok(p && p.zh_cn && p.zh_cn.content);
    const line = p.zh_cn.content[0];
    assert.deepStrictEqual(line[0], { tag: "text", text: "hi " });
    assert.deepStrictEqual(line[1], { tag: "at", user_id: "ou_abc123" });
    assert.deepStrictEqual(line[2], { tag: "text", text: " tail" });
  });

  test("多个 @ou_", () => {
    const p = buildZhCnPostContentFromText("@ou_a @ou_b");
    const line = p.zh_cn.content[0];
    assert.strictEqual(line.length, 3);
    assert.deepStrictEqual(line[0], { tag: "at", user_id: "ou_a" });
    assert.deepStrictEqual(line[1], { tag: "text", text: " " });
    assert.deepStrictEqual(line[2], { tag: "at", user_id: "ou_b" });
  });

  test("buildZhCnPostRichFromText 识别链接", () => {
    const p = buildZhCnPostRichFromText("见 https://feishu.cn/docx/abc 说明");
    assert.ok(p && p.zh_cn.content.length >= 1);
    const row = p.zh_cn.content[0];
    assert.ok(row.some((x) => x.tag === "a"));
  });
});
