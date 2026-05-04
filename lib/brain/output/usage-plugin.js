"use strict";

const { OutputPlugin } = require("./output-plugin-interface");
const { appendLlmUsageFooterToReply } = require("../../feishu-llm-usage-footer");

class UsagePlugin extends OutputPlugin {
  constructor() {
    super();
    this.name = "usagePlugin";
  }

  match(_ctx, _result) {
    return true;
  }

  async process(ctx, result) {
    const r = result || {};
    return {
      replyBody: appendLlmUsageFooterToReply(
        typeof r.replyBody === "string" ? r.replyBody : "",
        r.executionResult || (ctx && ctx.executionResult) || {}
      ),
      metadata: {},
    };
  }
}

const usagePlugin = new UsagePlugin();

module.exports = {
  UsagePlugin,
  usagePlugin,
};
