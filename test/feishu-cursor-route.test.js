"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  getCursorRoutingConfig,
  cursorShouldRun,
  cursorTaskText,
  isRelayLikeTask,
  isReportLikeTask,
  normalizeCursorTask,
  resolveCursorAgentProfile,
} = require("../lib/feishu-cursor-route.js");

const ROUTE_KEYS = [
  "FEISHU_CURSOR_TRIGGER_ENABLED",
  "FEISHU_CURSOR_MODE",
  "FEISHU_CURSOR_TRIGGER_PREFIX",
  "FEISHU_CURSOR_ALLOWED_CHAT_IDS",
  "FEISHU_CURSOR_ENFORCE_ALLOWED_CHAT_IDS",
  "CURSOR_FULL_TASK_PREFIXES",
  "FEISHU_CURSOR_DIRECT_PROFILE",
];

function snapshotEnv() {
  const s = {};
  for (const k of ROUTE_KEYS) s[k] = process.env[k];
  return s;
}

function restoreEnv(saved) {
  for (const k of ROUTE_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

describe("feishu-cursor-route", () => {
  test("direct + enabled：任意文本触发", () => {
    const saved = snapshotEnv();
    try {
      process.env.FEISHU_CURSOR_TRIGGER_ENABLED = "1";
      process.env.FEISHU_CURSOR_MODE = "direct";
      const r = getCursorRoutingConfig();
      assert.strictEqual(r.direct, true);
      assert.strictEqual(r.enabled, true);
      const ex = { text: "你好", chatId: "oc_x" };
      assert.strictEqual(cursorShouldRun(r, ex), true);
      assert.strictEqual(cursorTaskText(r, ex), "你好");
    } finally {
      restoreEnv(saved);
    }
  });

  test("prefix 模式：仅以前缀开头触发", () => {
    const saved = snapshotEnv();
    try {
      process.env.FEISHU_CURSOR_TRIGGER_ENABLED = "1";
      process.env.FEISHU_CURSOR_MODE = "prefix";
      process.env.FEISHU_CURSOR_TRIGGER_PREFIX = "/cursor";
      const r = getCursorRoutingConfig();
      assert.strictEqual(r.direct, false);
      assert.strictEqual(r.prefix, "/cursor");
      assert.strictEqual(
        cursorShouldRun(r, { text: "hi", chatId: "oc_1" }),
        false
      );
      assert.strictEqual(
        cursorShouldRun(r, { text: "/cursor do x", chatId: "oc_1" }),
        true
      );
      assert.strictEqual(cursorTaskText(r, { text: "/cursor do x" }), "do x");
    } finally {
      restoreEnv(saved);
    }
  });

  test("未启用 FEISHU_CURSOR_TRIGGER_ENABLED 不触发", () => {
    const saved = snapshotEnv();
    try {
      delete process.env.FEISHU_CURSOR_TRIGGER_ENABLED;
      const r = getCursorRoutingConfig();
      assert.strictEqual(r.enabled, false);
      assert.strictEqual(
        cursorShouldRun(r, { text: "a", chatId: "oc_1" }),
        false
      );
    } finally {
      restoreEnv(saved);
    }
  });

  test("默认不强制执行白名单：仅配 ALLOWED_CHAT_IDS 时名单外仍放行", () => {
    const saved = snapshotEnv();
    try {
      process.env.FEISHU_CURSOR_TRIGGER_ENABLED = "1";
      process.env.FEISHU_CURSOR_MODE = "direct";
      process.env.FEISHU_CURSOR_ALLOWED_CHAT_IDS = " oc_a , oc_b ";
      delete process.env.FEISHU_CURSOR_ENFORCE_ALLOWED_CHAT_IDS;
      const r = getCursorRoutingConfig();
      assert.strictEqual(
        cursorShouldRun(r, { text: "x", chatId: "oc_a" }),
        true
      );
      assert.strictEqual(
        cursorShouldRun(r, { text: "x", chatId: "oc_other" }),
        true
      );
    } finally {
      restoreEnv(saved);
    }
  });

  test("ENFORCE_ALLOWED_CHAT_IDS=1：仅允许列表内 chat_id", () => {
    const saved = snapshotEnv();
    try {
      process.env.FEISHU_CURSOR_TRIGGER_ENABLED = "1";
      process.env.FEISHU_CURSOR_MODE = "direct";
      process.env.FEISHU_CURSOR_ALLOWED_CHAT_IDS = " oc_a , oc_b ";
      process.env.FEISHU_CURSOR_ENFORCE_ALLOWED_CHAT_IDS = "1";
      const r = getCursorRoutingConfig();
      assert.strictEqual(
        cursorShouldRun(r, { text: "x", chatId: "oc_a" }),
        true
      );
      assert.strictEqual(
        cursorShouldRun(r, { text: "x", chatId: "oc_b" }),
        true
      );
      assert.strictEqual(
        cursorShouldRun(r, { text: "x", chatId: "oc_other" }),
        false
      );
    } finally {
      restoreEnv(saved);
    }
  });

  test("resolveCursorAgentProfile：direct 默认 full", () => {
    const saved = snapshotEnv();
    try {
      delete process.env.CURSOR_FULL_TASK_PREFIXES;
      delete process.env.FEISHU_CURSOR_DIRECT_PROFILE;
      const r = { direct: true };
      assert.deepStrictEqual(resolveCursorAgentProfile("你好", r), {
        profile: "full",
        task: "你好",
      });
    } finally {
      restoreEnv(saved);
    }
  });

  test("resolveCursorAgentProfile：FEISHU_CURSOR_DIRECT_PROFILE=fast 时 direct 可走旧档", () => {
    const saved = snapshotEnv();
    try {
      delete process.env.CURSOR_FULL_TASK_PREFIXES;
      process.env.FEISHU_CURSOR_DIRECT_PROFILE = "fast";
      const r = { direct: true };
      assert.deepStrictEqual(resolveCursorAgentProfile("你好", r), {
        profile: "fast",
        task: "你好",
      });
    } finally {
      restoreEnv(saved);
    }
  });

  test("resolveCursorAgentProfile：/code 前缀走 full 并去前缀", () => {
    const saved = snapshotEnv();
    try {
      delete process.env.CURSOR_FULL_TASK_PREFIXES;
      const r = { direct: true };
      assert.deepStrictEqual(resolveCursorAgentProfile("/code 修 bug", r), {
        profile: "full",
        task: "修 bug",
      });
    } finally {
      restoreEnv(saved);
    }
  });

  test("resolveCursorAgentProfile：direct 下 /figma 前缀走 full 并去前缀", () => {
    const saved = snapshotEnv();
    try {
      const r = { direct: true, prefix: "/figma" };
      assert.deepStrictEqual(
        resolveCursorAgentProfile("/figma 生成登录页", r),
        {
          profile: "full",
          task: "生成登录页",
        }
      );
    } finally {
      restoreEnv(saved);
    }
  });

  test("resolveCursorAgentProfile：非 direct 走 full", () => {
    const saved = snapshotEnv();
    try {
      const r = { direct: false };
      assert.deepStrictEqual(resolveCursorAgentProfile("画页面", r), {
        profile: "full",
        task: "画页面",
      });
    } finally {
      restoreEnv(saved);
    }
  });

  test("缺 text / chatId / skip 不触发", () => {
    const saved = snapshotEnv();
    try {
      process.env.FEISHU_CURSOR_TRIGGER_ENABLED = "1";
      process.env.FEISHU_CURSOR_MODE = "direct";
      const r = getCursorRoutingConfig();
      assert.strictEqual(cursorShouldRun(r, { skip: true }), false);
      assert.strictEqual(cursorShouldRun(r, { text: "", chatId: "x" }), false);
      assert.strictEqual(cursorShouldRun(r, { text: "a", chatId: "" }), false);
    } finally {
      restoreEnv(saved);
    }
  });

  test("报告类任务会附加 Markdown 指令", () => {
    const out = normalizeCursorTask("输出 redotpay 数据报告给我，在线文档的形式");
    assert.match(out, /Markdown/);
    assert.match(out, /完整/);
    assert.match(out, /不要创建 Word\/PDF/);
    assert.match(out, /概要/);
  });

  test("飞书写出类表述命中 isReportLikeTask（云文档导出前置条件）", () => {
    assert.strictEqual(isReportLikeTask("帮我创建一篇飞书文档，写项目背景"), true);
    assert.strictEqual(isReportLikeTask("导出到飞书，整理成表格"), true);
    assert.strictEqual(isReportLikeTask("随便聊聊今天天气"), false);
  });

  test("代问类任务会附加简洁转述指令", () => {
    assert.strictEqual(
      isRelayLikeTask("@小智 需要你通过 @Atome Card 小龙虾 来问他今天天气如何"),
      true
    );
    const out = normalizeCursorTask(
      "@小智 需要你通过 @Atome Card 小龙虾 来问他今天天气如何"
    );
    assert.match(out, /代问\/转述/);
    assert.match(out, /不要解释占位符映射/);
    assert.match(out, /不要附带无关的天气参考/);
    assert.match(out, /不要把对本机器人的称呼抄进最终文案/);
    assert.match(out, /不要擅自默认指向唯一 @ 对象/);
  });
});
