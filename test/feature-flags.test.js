"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert");

const {
  DEFINITIONS,
  createFeatureFlags,
  isProductionEnv,
  parseFlagValue,
  resolveFeatureFlags,
} = require("../lib/brain/runtime/feature-flags");

describe("feature flags", { concurrency: false }, () => {
  test("definitions include all P9 rollout controls", () => {
    assert.deepStrictEqual(Object.keys(DEFINITIONS).sort(), [
      "clarifyFooter",
      "memory",
      "newKernel",
      "observability",
      "outputPlugins",
      "workflowHint",
      "workflowPlugins",
    ]);
  });

  test("parseFlagValue accepts common true/false values and falls back safely", () => {
    assert.strictEqual(parseFlagValue("1", false), true);
    assert.strictEqual(parseFlagValue("on", false), true);
    assert.strictEqual(parseFlagValue("enabled", false), true);
    assert.strictEqual(parseFlagValue("0", true), false);
    assert.strictEqual(parseFlagValue("off", true), false);
    assert.strictEqual(parseFlagValue("disabled", true), false);
    assert.strictEqual(parseFlagValue("unknown", true), true);
    assert.strictEqual(parseFlagValue("unknown", false), false);
  });

  test("normal defaults preserve replay behavior outside production", () => {
    const flags = resolveFeatureFlags({ env: { NODE_ENV: "test" } });
    assert.strictEqual(flags.newKernel, true);
    assert.strictEqual(flags.memory, true);
    assert.strictEqual(flags.workflowPlugins, true);
    assert.strictEqual(flags.outputPlugins, true);
    assert.strictEqual(flags.observability, false);
    assert.strictEqual(flags.workflowHint, true);
    assert.strictEqual(flags.clarifyFooter, true);
  });

  test("production defaults are safe and require explicit gray rollout", () => {
    assert.strictEqual(isProductionEnv({ NODE_ENV: "production" }), true);
    const flags = resolveFeatureFlags({ env: { NODE_ENV: "production" } });
    assert.strictEqual(flags.newKernel, false);
    assert.strictEqual(flags.workflowHint, false);
    assert.strictEqual(flags.clarifyFooter, false);
    assert.strictEqual(flags.memory, true);
    assert.strictEqual(flags.workflowPlugins, true);
    assert.strictEqual(flags.outputPlugins, true);
    assert.strictEqual(flags.observability, false);
  });

  test("env, runtimeConfig and runtime overrides are applied in that order", () => {
    const flags = resolveFeatureFlags({
      env: { NODE_ENV: "production", FEISHU_BRAIN_NEW_KERNEL: "0", FEISHU_BRAIN_MEMORY: "0" },
      runtimeConfig: { featureFlags: { newKernel: true, memory: true, outputPlugins: false } },
      overrides: { memory: false, outputPlugins: true },
    });

    assert.strictEqual(flags.newKernel, true);
    assert.strictEqual(flags.memory, false);
    assert.strictEqual(flags.outputPlugins, true);
  });

  test("createFeatureFlags supports runtime override mutation", () => {
    const flags = createFeatureFlags({ env: { NODE_ENV: "production" } });
    assert.strictEqual(flags.isEnabled("newKernel"), false);
    assert.strictEqual(flags.setOverride("newKernel", true), true);
    assert.strictEqual(flags.isEnabled("newKernel"), true);
    assert.strictEqual(flags.clearOverride("newKernel"), true);
    assert.strictEqual(flags.isEnabled("newKernel"), false);
    assert.strictEqual(flags.setOverride("missing", true), false);
  });
});
