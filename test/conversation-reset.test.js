"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const {
  detectFollowupWeak,
  detectFreshHard,
  detectFreshWeak,
  evaluateFreshReset,
} = require("../lib/feishu-cursor/conversation-reset");
const { PHASE_CLARIFY_SENT } = require("../lib/feishu-cursor/research-workflow-state");

describe("conversation-reset PR1", () => {
  test("hard fresh triggers without evidence", () => {
    const r = evaluateFreshReset({
      userText: "新任务，给我一个新产品灰度发布方案",
      researchRow: null,
      PHASE_CLARIFY_SENT,
    });
    assert.strictEqual(r.shouldReset, true);
    assert.strictEqual(r.reason, "fresh_hard");
  });

  test("新产品灰度发布方案 alone does not weak-reset without evidence", () => {
    const r = evaluateFreshReset({
      userText: "新产品灰度发布方案",
      researchRow: null,
      lastTurnMeta: null,
    });
    assert.strictEqual(r.shouldReset, false);
  });

  test("followupWeak blocks reset even with evidence", () => {
    const r = evaluateFreshReset({
      userText: "继续优化上一版",
      researchRow: { phase: PHASE_CLARIFY_SENT },
      lastTurnMeta: { assistantReplyLen: 5000, workflowKey: "research" },
    });
    assert.strictEqual(r.shouldReset, false);
    assert.strictEqual(r.reason, "followup_weak_no_reset");
  });

  test("weakFresh with clarify_sent evidence resets", () => {
    const r = evaluateFreshReset({
      userText: "另外做一个",
      researchRow: { phase: PHASE_CLARIFY_SENT },
      PHASE_CLARIFY_SENT,
    });
    assert.strictEqual(r.shouldReset, true);
    assert.strictEqual(r.reason, "fresh_weak_with_evidence");
  });

  test("weakFresh without evidence does not reset", () => {
    assert.strictEqual(detectFreshWeak("另外做一个"), true);
    const r = evaluateFreshReset({
      userText: "另外做一个",
      researchRow: null,
      lastTurnMeta: null,
    });
    assert.strictEqual(r.shouldReset, false);
  });

  test("helpers", () => {
    assert.strictEqual(detectFollowupWeak("继续优化上一版"), true);
    assert.strictEqual(detectFreshHard("新任务 x"), true);
    assert.strictEqual(detectFreshWeak("这次换成 x"), true);
  });
});
