"use strict";

const TRUE_VALUES = new Set(["1", "true", "on", "yes", "y", "enabled"]);
const FALSE_VALUES = new Set(["0", "false", "off", "no", "n", "disabled"]);

const DEFINITIONS = Object.freeze({
  newKernel: { env: "FEISHU_BRAIN_NEW_KERNEL", defaultValue: true },
  memory: { env: "FEISHU_BRAIN_MEMORY", defaultValue: true },
  workflowPlugins: { env: "FEISHU_BRAIN_WORKFLOW_PLUGINS", defaultValue: true },
  outputPlugins: { env: "FEISHU_BRAIN_OUTPUT_PLUGINS", defaultValue: true },
  observability: { env: "FEISHU_BRAIN_OBSERVABILITY", defaultValue: false },
});

function parseFlagValue(value, fallback) {
  if (value === undefined || value === null || value === "") return !!fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(raw)) return true;
  if (FALSE_VALUES.has(raw)) return false;
  return !!fallback;
}

function normalizeOverrides(overrides) {
  if (!overrides || typeof overrides !== "object") return {};
  return { ...overrides };
}

function runtimeOverride(runtimeConfig, key) {
  const cfg = runtimeConfig && typeof runtimeConfig === "object" ? runtimeConfig : {};
  const flags = cfg.featureFlags && typeof cfg.featureFlags === "object" ? cfg.featureFlags : {};
  if (Object.prototype.hasOwnProperty.call(flags, key)) return flags[key];
  const legacyKey = `featureFlag_${key}`;
  if (Object.prototype.hasOwnProperty.call(cfg, legacyKey)) return cfg[legacyKey];
  return undefined;
}

function resolveFeatureFlags(options) {
  const o = options || {};
  const env = o.env || process.env;
  const runtimeConfig = o.runtimeConfig || {};
  const overrides = normalizeOverrides(o.overrides);
  const result = {};

  for (const [key, def] of Object.entries(DEFINITIONS)) {
    let value = def.defaultValue;
    value = parseFlagValue(env && env[def.env], value);
    value = parseFlagValue(runtimeOverride(runtimeConfig, key), value);
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      value = parseFlagValue(overrides[key], value);
    }
    result[key] = value;
  }

  return Object.freeze(result);
}

function createFeatureFlags(options) {
  let runtimeOverrides = normalizeOverrides(options && options.overrides);
  const base = {
    env: (options && options.env) || process.env,
    runtimeConfig: (options && options.runtimeConfig) || {},
  };

  return {
    isEnabled(key) {
      return !!resolveFeatureFlags({ ...base, overrides: runtimeOverrides })[key];
    },
    snapshot() {
      return resolveFeatureFlags({ ...base, overrides: runtimeOverrides });
    },
    setOverride(key, value) {
      if (!Object.prototype.hasOwnProperty.call(DEFINITIONS, key)) return false;
      runtimeOverrides = { ...runtimeOverrides, [key]: value };
      return true;
    },
    clearOverride(key) {
      if (!Object.prototype.hasOwnProperty.call(runtimeOverrides, key)) return false;
      const next = { ...runtimeOverrides };
      delete next[key];
      runtimeOverrides = next;
      return true;
    },
  };
}

module.exports = {
  DEFINITIONS,
  createFeatureFlags,
  parseFlagValue,
  resolveFeatureFlags,
};
