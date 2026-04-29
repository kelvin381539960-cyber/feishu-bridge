"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { runAll, cases } = require("../scripts/runtime-smoke-tests");

test("runtime smoke: all 14 cases registered", () => {
  assert.strictEqual(cases.length, 14);
});

test("runtime smoke: all 14 cases pass", () => {
  const summary = runAll();
  if (summary.fail !== 0) {
    const fails = summary.results.filter((r) => r.status !== "PASS");
    const dump = JSON.stringify(fails, null, 2);
    assert.fail(`runtime smoke failed: ${dump}`);
  }
  assert.strictEqual(summary.pass, 14);
});
