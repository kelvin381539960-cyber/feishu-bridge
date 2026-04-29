"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  getCursorRoutingConfig,
  normalizeCursorTask,
  resolveCursorAgentProfile,
} = require("../lib/feishu-cursor-route.js");
const { augmentTaskWithQuotedParent } = require("../lib/feishu-quoted-parent-context.js");

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

/** 与 pipeline-v2 / prompt-policy 一致：URL 或父消息注入 → full */
function applyPipelineProfileBump(task, parentContextInjected, resolved) {
  if (/(feishu|larksuite)\./i.test(String(task)) || parentContextInjected) {
    resolved.profile = "full";
  }
  return resolved;
}

describe("feishu 引用消息上下文（quoted parent）", () => {
  test("用例①：有 parent_id 且拉取到文本时，task 须带 [引用消息内容]…[用户指令]，且 profile 升为 full", async () => {
    const saved = snapshotEnv();
    try {
      process.env.FEISHU_CURSOR_TRIGGER_ENABLED = "1";
      process.env.FEISHU_CURSOR_MODE = "direct";
      const routing = getCursorRoutingConfig();

      let userTask = "把上面整理进问题表";
      const mockFetch = async () => ({
        items: [
          {
            msg_type: "text",
            body: { content: JSON.stringify({ text: "生产环境 KYC 超时未回调" }) },
          },
        ],
      });

      const { task: augmented, injected } = await augmentTaskWithQuotedParent(
        userTask,
        "om_parent_123",
        mockFetch
      );

      assert.strictEqual(injected, true);
      assert.ok(augmented.startsWith("[引用消息内容]\n"));
      assert.ok(augmented.includes("生产环境 KYC 超时未回调"));
      assert.ok(augmented.endsWith("\n[用户指令]\n把上面整理进问题表"));

      const normalized = normalizeCursorTask(augmented);
      const resolved = resolveCursorAgentProfile(normalized, routing);
      assert.strictEqual(resolved.profile, "full", "baseline：direct 默认 full");
      applyPipelineProfileBump(augmented, injected, resolved);
      assert.strictEqual(resolved.profile, "full", "父消息注入后仍为 full");
    } finally {
      restoreEnv(saved);
    }
  });

  test("用例②：无 parent_id 或拉取结果无正文时，task 不变、injected 为 false，且无理由仅因此升 full", async () => {
    const saved = snapshotEnv();
    try {
      process.env.FEISHU_CURSOR_TRIGGER_ENABLED = "1";
      process.env.FEISHU_CURSOR_MODE = "direct";
      const routing = getCursorRoutingConfig();

      const userTask = "仅这一条指令";

      const { task: a1, injected: i1 } = await augmentTaskWithQuotedParent(
        userTask,
        null,
        async () => ({ items: [] })
      );
      assert.strictEqual(a1, userTask);
      assert.strictEqual(i1, false);

      const resolved1 = resolveCursorAgentProfile(normalizeCursorTask(a1), routing);
      applyPipelineProfileBump(a1, i1, resolved1);
      assert.strictEqual(resolved1.profile, "full");

      const { task: a2, injected: i2 } = await augmentTaskWithQuotedParent(
        userTask,
        "om_x",
        async () => ({
          items: [{ msg_type: "text", body: { content: JSON.stringify({ text: "" }) } }],
        })
      );
      assert.strictEqual(a2, userTask);
      assert.strictEqual(i2, false);

      const resolved2 = resolveCursorAgentProfile(normalizeCursorTask(a2), routing);
      applyPipelineProfileBump(a2, i2, resolved2);
      assert.strictEqual(resolved2.profile, "full");
    } finally {
      restoreEnv(saved);
    }
  });

  test("用例③：父消息为多条 items（会话记录式合并）时须拼成一段上下文", async () => {
    const userTask = "记入问题表";
    const mockFetch = async () => ({
      items: [
        {
          msg_type: "text",
          body: { content: JSON.stringify({ text: "A 用户: 支付失败" }) },
        },
        {
          msg_type: "text",
          body: { content: JSON.stringify({ text: "B 系统: 已收到工单" }) },
        },
      ],
    });
    const { task: augmented, injected } = await augmentTaskWithQuotedParent(
      userTask,
      "om_thread_pack",
      mockFetch
    );
    assert.strictEqual(injected, true);
    assert.ok(augmented.includes("支付失败"));
    assert.ok(augmented.includes("已收到工单"));
    assert.ok(augmented.includes("\n[用户指令]\n记入问题表"));
  });
});
