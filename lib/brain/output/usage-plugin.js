"use strict";

const { OutputPlugin } = require("./output-plugin-interface");
const { appendLlmUsageFooterToReply } = require("../../feishu-llm-usage-footer");

class UsagePlugin extends OutputPlugin {
  match(_ctx, result) {
    return !!result && typeof result.replyBody === "string";
  }

  process(ctx, result) {
    const replyBody = String((result && result.replyBody) || "");
    const previousMetadata = result && result.metadata && typeof result.metadata === "object" ? result.metadata : {};
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
};
