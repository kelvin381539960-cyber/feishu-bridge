"use strict";

/**
 * QA：防止「单测全绿但线上写错目录」类回归；调研任务 prompt 片段。
 */
const { test, describe } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ENV_EXAMPLE = path.join(ROOT, "deploy", "feishu-ws-cursor-bot.env.example");

const REPO_RESOLVER_LINE =
  'REPO="${FEISHU_BRIDGE_REPO:-${FEISHU_BRIDGE_ROOT:-/opt/feishu-bridge}}"';

describe("feishu-bridge repo contract (QA)", () => {
  test("bash：未设 FEISHU_BRIDGE_REPO 时使用 FEISHU_BRIDGE_ROOT", () => {
    const out = execFileSync(
      "env",
      [
        "-i",
        "PATH=/usr/bin:/bin",
        "FEISHU_BRIDGE_ROOT=/opt/contract-qa-root",
        "bash",
        "-lc",
        `${REPO_RESOLVER_LINE}; printf %s "$REPO"`,
      ],
      { encoding: "utf8" }
    );
    assert.strictEqual(out, "/opt/contract-qa-root");
  });

  test("bash：显式 FEISHU_BRIDGE_REPO 优先于 ROOT", () => {
    const out = execFileSync(
      "env",
      [
        "-i",
        "PATH=/usr/bin:/bin",
        "FEISHU_BRIDGE_ROOT=/opt/wrong",
        "FEISHU_BRIDGE_REPO=/opt/explicit-repo",
        "bash",
        "-lc",
        `${REPO_RESOLVER_LINE}; printf %s "$REPO"`,
      ],
      { encoding: "utf8" }
    );
    assert.strictEqual(out, "/opt/explicit-repo");
  });

  test("deploy/feishu-ws-cursor-bot.env.example 同时声明 ROOT 与 REPO", () => {
    assert.ok(fs.existsSync(ENV_EXAMPLE));
    const t = fs.readFileSync(ENV_EXAMPLE, "utf8");
    assert.match(t, /^\s*FEISHU_BRIDGE_ROOT=/m);
    assert.match(t, /^\s*FEISHU_BRIDGE_REPO=/m);
  });

  test("调研分类命中且 prompt 要求落盘 docs/research", () => {
    const { classifyTask } = require("../lib/feishu-cursor/policies/task-classifier.js");
    const { buildPromptText } = require("../lib/feishu-cursor/policies/prompt-policy.js");
    const { isResearchLikeTask } = require("../lib/feishu-cursor-route.js");
    const task = "帮我调研目前 web3 poa 是怎么做的";
    assert.strictEqual(isResearchLikeTask(task), true);
    const c = classifyTask({
      task,
      messageType: "text",
      isRelayLikeTask: () => false,
      isReportLikeTask: () => false,
      isResearchLikeTask,
    });
    assert.strictEqual(c.taskType, "research");
    const prompt = buildPromptText(task, {
      ...c,
      qaContext: "目标：产品决策；范围：全球公链 PoA",
    });
    assert.match(prompt, /docs\/research/i);
    assert.match(prompt, /\.md/);
    assert.match(prompt, /完整|全文/);
    assert.match(prompt, /禁止|不得/);
  });
});
