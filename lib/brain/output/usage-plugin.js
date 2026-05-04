"use strict";

const { OutputPlugin } = require("./output-plugin-interface");
const { appendLlmUsageFooterToReply } = require("../../feishu-llm-usage-footer");

function usagePluginEnabled(env) {
  const e = env || process.env;
  const raw = String(e.FEISHU_OUTPUT_USAGE_PLUGIN || "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

class UsagePlugin extends OutputPlugin {
  match(ctx, result) {
    const env = (ctx && ctx.env) || process.env;
    return usagePluginEnabled(env) && !!result && typeof result.replyBody === "string";
  }

  process(ctx, result) {
    const env = (ctx && ctx.env) || process.env;
    const replyBody = String((result && result.replyBody) || "");
    const previousMetadata = result && result.metadata && typeof result.metadata === "object" ? result.metadata : {};
    if (!usagePluginEnabled(env)) {
      return { replyBody, metadata: previousMetadata };
    }
    const nextReplyBody = appendLlmUsageFooterToReply(replyBody, ctx && ctx.executionResult);
    return {
      replyBody: nextReplyBody,
      metadata: {
        ...previousMetadata,
        usageFooterApplied: nextReplyBody !== replyBody,
      },
    };
  }
}

const usagePlugin = new UsagePlugin();

module.exports = {
  UsagePlugin,
  usagePlugin,
  _test: {
    usagePluginEnabled,
  },
};
