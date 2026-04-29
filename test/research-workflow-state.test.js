"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  researchWorkflowStateKey,
  markResearchClarifySent,
  loadResearchWorkflowState,
  clearResearchWorkflowState,
  PHASE_CLARIFY_SENT,
} = require("../lib/feishu-cursor/research-workflow-state");

describe("research workflow state", () => {
  test("key isolates namespace", () => {
    assert.strictEqual(researchWorkflowStateKey("oc_1", ""), "oc_1");
    assert.strictEqual(researchWorkflowStateKey("oc_1", "ns_a"), "ns_a:oc_1");
  });

  test("clarify_sent TTL drops stale row", () => {
    const tmp = path.join(os.tmpdir(), `rw-ttl-${Date.now()}.json`);
    process.env.FEISHU_RESEARCH_WORKFLOW_STATE_FILE = tmp;
    process.env.RESEARCH_CLARIFY_TTL_SEC = "5";
    try {
      const k = "oc_ttl";
      const store = {
        version: 1,
        chats: {
          [k]: {
            phase: PHASE_CLARIFY_SENT,
            originalUserTask: "u",
            originalTask: "t",
            updatedAt: Date.now() - 10_000,
          },
        },
      };
      fs.writeFileSync(tmp, JSON.stringify(store), "utf8");
      const expired = loadResearchWorkflowState(k);
      assert.strictEqual(expired, null);
    } finally {
      delete process.env.RESEARCH_CLARIFY_TTL_SEC;
      delete process.env.FEISHU_RESEARCH_WORKFLOW_STATE_FILE;
      try {
        fs.unlinkSync(tmp);
      } catch (_) {
        /* ignore */
      }
    }
  });

  test("mark load clear roundtrip", () => {
    const tmp = path.join(os.tmpdir(), `rw-state-${Date.now()}.json`);
    process.env.FEISHU_RESEARCH_WORKFLOW_STATE_FILE = tmp;
    try {
      const k = "oc_t";
      markResearchClarifySent(k, {
        originalUserTask: "u",
        originalTask: "t",
      });
      const row = loadResearchWorkflowState(k);
      assert.strictEqual(row.phase, PHASE_CLARIFY_SENT);
      assert.strictEqual(row.originalUserTask, "u");
      assert.strictEqual(row.originalTask, "t");
      clearResearchWorkflowState(k);
      assert.strictEqual(loadResearchWorkflowState(k), null);
    } finally {
      delete process.env.FEISHU_RESEARCH_WORKFLOW_STATE_FILE;
      try {
        fs.unlinkSync(tmp);
      } catch (_) {
        /* ignore */
      }
    }
  });
});
