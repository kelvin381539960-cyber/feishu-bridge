"use strict";

const { docExportPlugin } = require("./doc-export-plugin");
const { usagePlugin } = require("./usage-plugin");
const { feishuLimitPlugin } = require("./feishu-limit-plugin");

const outputPlugins = [
  docExportPlugin,
  usagePlugin,
  feishuLimitPlugin,
];

async function runOutputPlugins(ctx, result, plugins) {
  const list = Array.isArray(plugins) ? plugins : outputPlugins;
  const base = result || {};
  let state = {
    ...base,
    replyBody: typeof base.replyBody === "string" ? base.replyBody : "",
    metadata: { ...(base.metadata || {}) },
    pluginMetadata: { ...(base.pluginMetadata || {}) },
  };

  for (const plugin of list) {
    if (!plugin) continue;
    const matched = typeof plugin.match === "function" ? await plugin.match(ctx, state) : true;
    if (!matched) continue;

    const processed = typeof plugin.process === "function" ? await plugin.process(ctx, state) : null;
    if (!processed) continue;

    if (typeof processed.replyBody === "string") {
      state.replyBody = processed.replyBody;
    }

    const metadata = processed.metadata && typeof processed.metadata === "object" ? processed.metadata : {};
    const name = plugin.name || plugin.id || (plugin.constructor && plugin.constructor.name) || "outputPlugin";
    state = {
      ...state,
      metadata: { ...state.metadata, ...metadata },
      pluginMetadata: { ...state.pluginMetadata, [name]: metadata },
    };
  }

  return state;
}

module.exports = {
  outputPlugins,
  runOutputPlugins,
};
