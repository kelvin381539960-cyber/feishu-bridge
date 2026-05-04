"use strict";

const {
  WORKFLOW_PLUGINS,
  selectWorkflowPlugin,
} = require("./workflow-registry");

function selectWorkflow(ctx) {
  return selectWorkflowPlugin(ctx);
}

module.exports = {
  WORKFLOW_PLUGINS,
  selectWorkflow,
  selectWorkflowPlugin,
};
