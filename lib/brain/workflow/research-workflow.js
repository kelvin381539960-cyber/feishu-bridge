"use strict";

const { Workflow } = require("./workflow-interface");

class ResearchWorkflow extends Workflow {
  match(ctx) {
    return ctx && ctx.classification && ctx.classification.taskType === "research";
  }
}

module.exports = {
  ResearchWorkflow,
};
