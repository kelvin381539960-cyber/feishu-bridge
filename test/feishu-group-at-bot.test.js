"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  isP2PChatType,
  mentionsIncludeBotOpenId,
  shouldSkipGroupMessageWithoutAtBot,
} = require("../lib/feishu-group-at-bot.js");

describe("feishu-group-at-bot", () => {
  test("isP2PChatType", () => {
    assert.strictEqual(isP2PChatType("p2p"), true);
    assert.strictEqual(isP2PChatType("p2p_chat"), true);
    assert.strictEqual(isP2PChatType("group"), false);
    assert.strictEqual(isP2PChatType(""), false);
  });

  test("mentionsIncludeBotOpenId：post 无 mentions 但正文 at 含本 bot", () => {
    const bot = "ou_f5bf974a9e4a4bbee59ceed6b8a498dd";
    const content = JSON.stringify({
      zh_cn: {
        content: [
          [
            { tag: "at", user_id: bot },
            { tag: "text", text: " 需要你通过 " },
            { tag: "at", user_id: "ou_other" },
            { tag: "text", text: " 问天气" },
          ],
        ],
      },
    });
    assert.strictEqual(
      mentionsIncludeBotOpenId(
        { message_type: "post", mentions: [], content },
        bot
      ),
      true
    );
  });

  test("mentionsIncludeBotOpenId", () => {
    const bot = "ou_aaa";
    assert.strictEqual(
      mentionsIncludeBotOpenId(
        {
          mentions: [{ id: { open_id: "ou_other" }, name: "x" }],
        },
        bot
      ),
      false
    );
    assert.strictEqual(
      mentionsIncludeBotOpenId(
        {
          mentions: [{ id: { open_id: "ou_aaa" }, name: "小智" }],
        },
        bot
      ),
      true
    );
  });

  test("shouldSkipGroupMessageWithoutAtBot: 私聊不跳过", () => {
    assert.strictEqual(
      shouldSkipGroupMessageWithoutAtBot(
        { chat_type: "p2p", mentions: [] },
        "ou_aaa"
      ),
      false
    );
  });

  test("shouldSkipGroupMessageWithoutAtBot: 群无 @ 跳过", () => {
    assert.strictEqual(
      shouldSkipGroupMessageWithoutAtBot(
        { chat_type: "group", mentions: [] },
        "ou_aaa"
      ),
      true
    );
  });

  test("shouldSkipGroupMessageWithoutAtBot: 群有 @ 本 bot 不跳过", () => {
    assert.strictEqual(
      shouldSkipGroupMessageWithoutAtBot(
        {
          chat_type: "group",
          mentions: [{ id: { open_id: "ou_aaa" }, name: "小智" }],
        },
        "ou_aaa"
      ),
      false
    );
  });

  test("shouldSkipGroupMessageWithoutAtBot: botOpenId 缺失则跳过群消息", () => {
    assert.strictEqual(
      shouldSkipGroupMessageWithoutAtBot({ chat_type: "group", mentions: [] }, null),
      true
    );
  });
});
