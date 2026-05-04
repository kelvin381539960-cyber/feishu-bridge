"use strict";

const { WorkflowPlugin } = require("./workflow-interface");

class ResearchWorkflowPlugin extends WorkflowPlugin {
  match(ctx) {
    return ctx && ctx.classification && ctx.classification.taskType === "research";
  }
}

const researchWorkflowPlugin = new ResearchWorkflowPlugin();

module.exports = {
  ResearchWorkflowPlugin,
  researchWorkflowPlugin,
};
