"use strict";

const { Workflow } = require("./workflow-interface");

class ResearchWorkflow extends Workflow {
  match(ctx) {
    return ctx.classification?.taskType === "research";
  }

  async run(ctx) {
    const result = await ctx.next();

    return {
      type: "passthrough",
      result,
    };
  }
}

module.exports = {
  ResearchWorkflow,
};
