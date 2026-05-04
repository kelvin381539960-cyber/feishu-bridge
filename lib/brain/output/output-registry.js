"use strict";

const { docExportPlugin } = require("./doc-export-plugin");
const { usagePlugin } = require("./usage-plugin");
const { feishuLimitPlugin } = require("./feishu-limit-plugin");

const outputPlugins = [
  docExportPlugin,
  usagePlugin,
  feishuLimitPlugin,
];

async function runOutputPlugins(ctx, initialResult, plugins) {
  const list = Array.isArray(plugins) ? plugins : outputPlugins;
  const logger = (ctx && ctx.logger) || console;
  let current = {
    replyBody: initialResult && typeof initialResult.replyBody === "string" ? initialResult.replyBody : "",
    metadata: initialResult && initialResult.metadata && typeof initialResult.metadata === "object" ? { ...initialResult.metadata } : {},
  };

  for (const plugin of list) {
    if (!plugin || typeof plugin.match !== "function" || typeof plugin.process !== "function") continue;
    let matched = false;
    try {
      matched = !!plugin.match(ctx || {}, current);
    } catch (e) {
      logger.error("[output-plugin] match error", plugin.constructor && plugin.constructor.name, e && e.message);
      continue;
    }
    if (!matched) continue;

    try {
      const next = await plugin.process(ctx || {}, current);
      if (!next || typeof next !== "object") continue;
      current = {
        replyBody: typeof next.replyBody === "string" ? next.replyBody : current.replyBody,
        metadata: next.metadata && typeof next.metadata === "object" ? { ...current.metadata, ...next.metadata } : current.metadata,
      };
    } catch (e) {
      logger.error("[output-plugin] process error", plugin.constructor && plugin.constructor.name, e && e.message);
    }
  }

  return current;
}

module.exports = {
  outputPlugins,
  runOutputPlugins,
};
