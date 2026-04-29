"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const contracts = require("../lib/feishu-cursor/contracts");
const baseContract = require("../lib/feishu-cursor/contracts/base.contract");
const prdContract = require("../lib/feishu-cursor/contracts/prd.contract");
const researchContract = require("../lib/feishu-cursor/contracts/research.contract");
const codeContract = require("../lib/feishu-cursor/contracts/code.contract");
const solutionContract = require("../lib/feishu-cursor/contracts/solution.contract");
const generalContract = require("../lib/feishu-cursor/contracts/general.contract");

test("contracts/index exposes exactly the 5 final workflows + base", () => {
  assert.deepStrictEqual(
    [...contracts.FINAL_WORKFLOWS],
    ["prd", "research", "code", "solution", "general"],
  );
  assert.deepStrictEqual(
    Object.keys(contracts.CONTRACTS).sort(),
    ["base", "code", "general", "prd", "research", "solution"],
  );
});

test("contracts/index exposes no debug/qa/legacy alias", () => {
  for (const k of Object.keys(contracts)) {
    if (typeof k !== "string") continue;
    assert.ok(
      !/debug|qa|legacy|deprecated/i.test(k),
      `unexpected legacy key in contracts/index: ${k}`,
    );
  }
});

test("getContract returns specialized contract by taskType", () => {
  assert.strictEqual(contracts.getContract("prd"), prdContract);
  assert.strictEqual(contracts.getContract("research"), researchContract);
  assert.strictEqual(contracts.getContract("code"), codeContract);
  assert.strictEqual(contracts.getContract("solution"), solutionContract);
  assert.strictEqual(contracts.getContract("general"), generalContract);
});

test("getContract falls back to general for unknown taskType", () => {
  assert.strictEqual(contracts.getContract("debug"), generalContract);
  assert.strictEqual(contracts.getContract("qa"), generalContract);
  assert.strictEqual(contracts.getContract(""), generalContract);
  assert.strictEqual(contracts.getContract(null), generalContract);
});

test("requireContract throws on unsupported workflow", () => {
  assert.throws(() => contracts.requireContract("debug"), /Unsupported/);
  assert.throws(() => contracts.requireContract("qa"), /Unsupported/);
  assert.throws(() => contracts.requireContract(""), /Unsupported/);
});

test("requireContract returns each specialized contract by name", () => {
  for (const k of contracts.FINAL_WORKFLOWS) {
    assert.strictEqual(contracts.requireContract(k), contracts[k]);
  }
});

test("base contract carries the shared field skeleton (immutable)", () => {
  for (const f of [
    "taskType",
    "requiredInputs",
    "optionalInputs",
    "clarificationPolicy",
    "contextRequirements",
    "outputRequirements",
    "gateRequired",
    "stateRequired",
    "forbiddenActions",
    "handoffTarget",
  ]) {
    assert.ok(f in baseContract, `base contract missing field: ${f}`);
  }
  assert.ok(Object.isFrozen(baseContract));
});

test("code contract restricts mode to inspect/execute", () => {
  assert.deepStrictEqual([...codeContract.allowedModes], ["inspect", "execute"]);
  assert.strictEqual(codeContract.taskType, "code");
  assert.strictEqual(codeContract.gateRequired, true);
});

test("solution contract restricts mode to the 5 final modes", () => {
  assert.deepStrictEqual(
    [...solutionContract.allowedModes].sort(),
    ["feasibility", "growth", "plan", "release", "roadmap"],
  );
  assert.deepStrictEqual([...solutionContract.allowedTaskSizes], ["S", "M", "L", "XL"]);
  assert.ok(solutionContract.outputRequirements.modeRequiredFields.feasibility);
  assert.ok(solutionContract.outputRequirements.modeRequiredFields.roadmap);
  assert.ok(solutionContract.outputRequirements.modeRequiredFields.plan);
  assert.ok(solutionContract.outputRequirements.modeRequiredFields.release);
  assert.ok(solutionContract.outputRequirements.modeRequiredFields.growth);
});

test("general contract is fallback only and requires fallbackReason", () => {
  assert.strictEqual(generalContract.role, "fallback");
  assert.ok(generalContract.requiredInputs.includes("fallbackReason"));
  assert.ok(generalContract.requiredInputs.includes("role"));
});

test("research contract is specialized (not fallback)", () => {
  assert.strictEqual(researchContract.taskType, "research");
  assert.strictEqual(researchContract.gateRequired, true);
  assert.strictEqual(researchContract.stateRequired, true);
  assert.notStrictEqual(researchContract.handoffTarget, "");
});

test("prd contract preserves existing PRD workflow handoff", () => {
  assert.strictEqual(prdContract.taskType, "prd");
  assert.strictEqual(prdContract.gateRequired, true);
  assert.strictEqual(prdContract.stateRequired, true);
  assert.strictEqual(prdContract.handoffTarget, "prdWorkflow");
});

test("no contract carries debug-related forbidden packs as a contract field", () => {
  for (const c of [prdContract, researchContract, codeContract, solutionContract, generalContract]) {
    const all = [
      ...(c.contextRequirements?.requiredPacks || []),
      ...(c.contextRequirements?.optionalPacks || []),
      ...(c.contextRequirements?.forbiddenPacks || []),
    ];
    for (const p of all) {
      assert.ok(!/^debug/i.test(p), `legacy debug pack referenced: ${p}`);
    }
  }
});
