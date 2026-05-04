"use strict";

const { ResearchWorkflow } = require("./research-workflow");

const workflows = Object.freeze([
  new ResearchWorkflow(),
]);

function selectWorkflow(ctx) {
  for (const workflow of workflows) {
    if (workflow.match(ctx)) return workflow;
  }
  return null;
}

module.exports = {
  workflows,
  selectWorkflow,
};
