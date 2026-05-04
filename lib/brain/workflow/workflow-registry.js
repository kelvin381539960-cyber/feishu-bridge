"use strict";

const { ResearchWorkflow } = require("./research-workflow");

const workflows = [
  new ResearchWorkflow(),
];

function selectWorkflow(ctx) {
  for (const wf of workflows) {
    if (wf.match(ctx)) return wf;
  }
  return null;
}

module.exports = {
  workflows,
  selectWorkflow,
};
