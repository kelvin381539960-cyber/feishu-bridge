"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  parseWebhookImBody,
  parseWsImDispatchPayload,
  extractTextFromFetchedMessageData,
} = require("../lib/feishu-im-parse.js");

describe("feishu-im-parse", () => {
  test("parseWebhookImBody: 正常文本", () => {
    const body = {
      header: { event_type: "im.message.receive_v1" },
      event: {
        sender: { sender_type: "user" },
        message: {
          chat_id: "oc_1",
          message_type: "text",
          content: JSON.stringify({ text: "hello 世界" }),
        },
      },
    };
    const r = parseWebhookImBody(body);
    assert.strictEqual(r.skip, undefined);
    assert.strictEqual(r.text, "hello 世界");
    assert.strictEqual(r.chatId, "oc_1");
  });

  test("parseWebhookImBody: create_time 秒级 → messageCreateTimeMs", () => {
    const ts = 1730000000;
    const body = {
      header: { event_type: "im.message.receive_v1" },
      event: {
        sender: { sender_type: "user" },
        message: {
          chat_id: "oc_1",
          create_time: String(ts),
          message_type: "text",
          content: JSON.stringify({ text: "t" }),
        },
      },
    };
    const r = parseWebhookImBody(body);
    assert.strictEqual(r.messageCreateTimeMs, ts * 1000);
  });

  test("parseWebhookImBody: 非 im.message 跳过", () => {
    const r = parseWebhookImBody({
      header: { event_type: "im.chat.access_event.bot_p2p_chat_entered_v1" },
    });
    assert.strictEqual(r.skip, true);
    assert.strictEqual(r.reason, "event_type");
  });

  test("parseWebhookImBody: 机器人消息跳过", () => {
    const r = parseWebhookImBody({
      header: { event_type: "im.message.receive_v1" },
      event: {
        sender: { sender_type: "app" },
        message: {
          chat_id: "oc_1",
          message_type: "text",
          content: JSON.stringify({ text: "x" }),
        },
      },
    });
    assert.strictEqual(r.skip, true);
    assert.strictEqual(r.reason, "from_bot");
  });

  test("parseWsImDispatchPayload: 机器人消息跳过", () => {
    const r = parseWsImDispatchPayload({
      sender: { sender_type: "bot" },
      message: {
        chat_id: "oc_1",
        message_type: "text",
        content: JSON.stringify({ text: "x" }),
      },
    });
    assert.strictEqual(r.skip, true);
    assert.strictEqual(r.reason, "from_bot");
  });

  test("parseWsImDispatchPayload: 与 WS 结构一致", () => {
    const data = {
      sender: { sender_type: "user" },
      message: {
        chat_id: "oc_ws",
        message_type: "text",
        content: JSON.stringify({ text: "ws-line" }),
      },
    };
    const r = parseWsImDispatchPayload(data);
    assert.strictEqual(r.text, "ws-line");
    assert.strictEqual(r.chatId, "oc_ws");
  });

  test("parseWsImDispatchPayload: create_time", () => {
    const ts = 1730000001;
    const r = parseWsImDispatchPayload({
      sender: { sender_type: "user" },
      message: {
        chat_id: "oc_x",
        create_time: String(ts),
        message_type: "text",
        content: JSON.stringify({ text: "a" }),
      },
    });
    assert.strictEqual(r.messageCreateTimeMs, ts * 1000);
  });

  test("parseWsImDispatchPayload: 无 message 跳过", () => {
    assert.strictEqual(parseWsImDispatchPayload(null).skip, true);
    assert.strictEqual(parseWsImDispatchPayload({}).reason, "no_message");
  });

  test("parseWebhookImBody: 图片类型返回 media", () => {
    const r = parseWebhookImBody({
      header: { event_type: "im.message.receive_v1" },
      event: {
        sender: { sender_type: "user" },
        message: {
          chat_id: "oc_1",
          message_type: "image",
          content: "{}",
        },
      },
    });
    assert.strictEqual(r.skip, undefined);
    assert.strictEqual(r.media && r.media.type, "image");
  });

  test("extractTextFromFetchedMessageData: 多 item 拼接", () => {
    const t = extractTextFromFetchedMessageData({
      items: [
        { msg_type: "text", body: { content: JSON.stringify({ text: "line1" }) } },
        { msg_type: "text", body: { content: JSON.stringify({ text: "line2" }) } },
      ],
    });
    assert.strictEqual(t, "line1\n\nline2");
  });

  test("extractTextFromFetchedMessageData: 未知类型回退为 JSON 摘要", () => {
    const t = extractTextFromFetchedMessageData({
      items: [
        { msg_type: "foo_bar", body: { content: JSON.stringify({ nested: "会话记录摘要" }) } },
      ],
    });
    assert.ok(t.includes("foo_bar"));
    assert.ok(t.includes("会话记录摘要"));
  });

  test("interactive 邮件分享卡片: 可提取文本且 cardType=mail", () => {
    const cardContent = {
      title: "Re: HK - DEEL - ASMTP - Yifeng WU",
      card_link: {
        url: "lark://applink.larksuite.com/client/mail/forward/card?cardId=abc",
      },
      elements: [[
        { tag: "text", text: "Hi Yifeng, please check and advise." },
        { tag: "text", text: "发件人：" },
        { tag: "text", text: "Katy S. (Support) <immigration.experience@deel.com>" },
      ]],
    };
    const r = parseWsImDispatchPayload({
      sender: { sender_type: "user" },
      message: {
        chat_id: "oc_mail",
        message_type: "interactive",
        content: JSON.stringify(cardContent),
      },
    });
    assert.strictEqual(r.skip, undefined);
    assert.strictEqual(r.chatId, "oc_mail");
    assert.strictEqual(r.cardType, "mail");
    assert.ok(r.text.includes("Re: HK - DEEL"), r.text);
    assert.ok(r.text.includes("Hi Yifeng"), r.text);
  });

  test("interactive 普通卡片: cardType=share（有 title 无 header）", () => {
    const r = parseWsImDispatchPayload({
      sender: { sender_type: "user" },
      message: {
        chat_id: "oc_gen",
        message_type: "interactive",
        content: JSON.stringify({
          title: "通知标题",
          elements: [{ tag: "text", text: "通知正文" }],
        }),
      },
    });
    assert.strictEqual(r.cardType, "share");
    assert.ok(r.text.includes("通知标题"), r.text);
  });

  test("interactive 标准机器人卡片: 无 cardType", () => {
    const r = parseWsImDispatchPayload({
      sender: { sender_type: "user" },
      message: {
        chat_id: "oc_bot",
        message_type: "interactive",
        content: JSON.stringify({
          header: { title: { content: "Bot Card" } },
          elements: [{ tag: "div", text: { content: "body text" } }],
        }),
      },
    });
    assert.strictEqual(r.cardType, undefined);
    assert.ok(r.text.includes("Bot Card"), r.text);
  });
});
