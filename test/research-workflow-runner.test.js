"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");

const { runResearchWorkflowV2 } = require("../lib/openclaw-control-plane/research-workflow-runner");
const { buildFeishuTaskEnvelope } = require("../lib/feishu-channel/models/feishu-task-envelope");

function fakeValidResearchReport() {
  const filler = "p".repeat(1200);
  return [
    "# 主题测试",
    "> 调研日期 | 作者：OpenClaw Agent",
    "## 0. 用户意图与调研范围",
    "- 用户目标说明",
    "- 调研对象说明",
    "- 本报告重点问题",
    "## 1. 执行摘要",
    "- 要点一",
    "- 要点二",
    "- 要点三",
    "## 2. 背景与定义",
    "### 2.1 核心概念",
    "### 2.2 问题背景",
    "- 背景要点",
    "## 3. 核心机制 / 判断框架",
    "- 框架一",
    "- 框架二",
    "- 框架三",
    "## 4. 主流方案 / 实现对比",
    "| 方案 | 说明 |",
    "| --- | --- |",
    "| A | 说明A |",
    "| B | 说明B |",
    "## 5. 优劣势、风险与适用场景",
    "- 优势",
    "- 局限",
    "- 风险",
    "## 6. 现实案例 / 生产落地",
    "- 案例一",
    "- 案例二",
    "- 案例三",
    "## 7. 结论与建议",
    "### 7.1 结论",
    "### 7.2 对用户当前场景的建议",
    "### 7.3 建议优先级（高 / 中 / 低）",
    "- 建议条目",
    "## 参考资料",
    "- 来源一 https://example.com",
    filler,
  ].join("\n");
}

describe("research workflow runner", () => {
  test("runs crawler then analyst with distinct agent sessions", async () => {
    const calls = [];
    const run = async (task, opts) => {
      calls.push({
        n: calls.length + 1,
        routeAgent: opts && opts.routeHint && opts.routeHint.agentId,
        sessionKey: opts && opts.gatewayRequest && opts.gatewayRequest.sessionKey,
        idem: opts && opts.gatewayRequest && opts.gatewayRequest.idempotencyKey,
      });
      if (calls.length === 1) {
        return {
          code: 0,
          stdout: "## 检索摘要\n- 摘要\n## 资料条目列表\n### 示例\n- 标题：T  - 链接：https://example.com",
          stderr: "",
          structuredResult: null,
        };
      }
      return {
        code: 0,
        stdout: fakeValidResearchReport(),
        stderr: "",
        structuredResult: null,
      };
    };

    const envelope = buildFeishuTaskEnvelope({
      extracted: { chatId: "oc_rw2", messageId: "m_rw2", messageType: "text" },
      data: { message: { chat_id: "oc_rw2", message_id: "m_rw2" } },
    });

    const dispatch = {
      task: "【身份约束】\n\n调研任务正文",
      opts: {
        gatewayRequest: { channelRuntimeMode: "legacy-bridge" },
      },
    };

    const out = await runResearchWorkflowV2({
      runOpenclawGatewayPrompt: run,
      envelope,
      runtimeConfig: {
        gatewayHeavyAgentId: "cursor",
        gatewayLightAgentId: "main",
        researchCrawlerAgentId: "kimi-crawl",
        researchAnalystAgentId: "gemini-analyst",
        researchQualityRepair: false,
      },
      dispatch,
      classification: { qaContext: "用户回答" },
      messageId: "m_rw2",
      logger: { log: () => {} },
    });

    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].routeAgent, "kimi-crawl");
    assert.strictEqual(calls[1].routeAgent, "gemini-analyst");
    assert.match(calls[0].sessionKey, /^agent:kimi-crawl:/);
    assert.match(calls[1].sessionKey, /^agent:gemini-analyst:/);
    assert.notStrictEqual(calls[0].sessionKey, calls[1].sessionKey);
    assert.match(calls[0].idem, /:rw2:crawl:kimi-crawl$/);
    assert.match(calls[1].idem, /:rw2:analyst:gemini-analyst$/);
    assert.strictEqual(out.code, 0);
    assert.ok(out.stdout && out.stdout.includes("# 主题测试"));
    assert.ok(out.researchMeta && out.researchMeta.mode === "research_v2");
    assert.strictEqual(out.researchMeta.crawlerOk, true);
    assert.ok(out.runtimeRunTrace && out.runtimeRunTrace.source === "runtime");
    assert.ok(Array.isArray(out.runtimeRunTrace.handoffRecords));
    assert.strictEqual(out.runtimeRunTrace.handoffRecords.length, 1);
    assert.ok(String(out.runtimeRunTrace.decisionReason || "").length > 0);
    assert.strictEqual(out.runtimeRunTrace.multiAgentRequired, true);
  });
});
