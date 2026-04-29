"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  augmentTaskWithFeishuAtContext,
  parseBotOpenIdMap,
  buildMentionBlock,
  shouldInjectChatMembers,
  buildRelevantBotMapBlock,
} = require("../lib/feishu-at-context.js");

describe("feishu-at-context", () => {
  test("buildMentionBlock", () => {
    const b = buildMentionBlock({
      mentions: [{ name: "小智", id: { open_id: "ou_self" } }],
    });
    assert.ok(b.includes("ou_self"));
    assert.ok(b.includes("小智"));
  });

  test("parseBotOpenIdMap 从环境变量", () => {
    const saved = process.env.FEISHU_BOT_OPEN_ID_MAP;
    try {
      process.env.FEISHU_BOT_OPEN_ID_MAP = "JARVIS=ou_abc123,jarvis=ou_abc123";
      const rows = parseBotOpenIdMap();
      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[0].val, "ou_abc123");
    } finally {
      if (saved === undefined) delete process.env.FEISHU_BOT_OPEN_ID_MAP;
      else process.env.FEISHU_BOT_OPEN_ID_MAP = saved;
    }
  });

  test("buildRelevantBotMapBlock：仅注入任务里出现的 bot 别名", () => {
    const saved = process.env.FEISHU_BOT_OPEN_ID_MAP;
    try {
      process.env.FEISHU_BOT_OPEN_ID_MAP =
        "JARVIS=ou_jarvis123,jarvis=ou_jarvis123,小智=ou_xz999";
      const a = buildRelevantBotMapBlock("让 JARVIS 继续");
      assert.ok(a.includes("JARVIS"));
      assert.ok(!a.includes("小智 → ou_xz999"));
      const b = buildRelevantBotMapBlock("通过 Atome Card 去问他");
      assert.strictEqual(b, "");
    } finally {
      if (saved === undefined) delete process.env.FEISHU_BOT_OPEN_ID_MAP;
      else process.env.FEISHU_BOT_OPEN_ID_MAP = saved;
    }
  });

  test("shouldInjectChatMembers：默认不为普通代问任务注入整群成员", () => {
    assert.strictEqual(
      shouldInjectChatMembers(
        "@小智 需要你通过 @Atome Card 小龙虾 来问他今天天气如何",
        {
          chat_type: "group",
          mentions: [{ name: "小智", id: { open_id: "ou_self" } }],
        }
      ),
      false
    );
    assert.strictEqual(
      shouldInjectChatMembers("把本群所有成员列出来", { chat_type: "group" }),
      true
    );
  });

  test("augmentTask：默认仅注入 mentions，不注入整群成员列表", async () => {
    const out = await augmentTaskWithFeishuAtContext("用户指令", {
      message: {
        chat_type: "group",
        mentions: [{ name: "B", id: { open_id: "ou_b" } }],
      },
      chatId: "oc_x",
      fetchMembers: async () => ({
        lines: ["- A  ou_a"],
      }),
    });
    assert.ok(out.includes("ou_b"));
    assert.ok(!out.includes("ou_a"));
    assert.ok(out.includes("用户指令"));
  });

  test("augmentTask：显式询问群成员时才注入 fetchMembers", async () => {
    const out = await augmentTaskWithFeishuAtContext("把本群所有成员列出来", {
      message: {
        chat_type: "group",
        mentions: [],
      },
      chatId: "oc_x",
      fetchMembers: async () => ({
        lines: ["- A  ou_a"],
      }),
    });
    assert.ok(out.includes("ou_a"));
  });
});
