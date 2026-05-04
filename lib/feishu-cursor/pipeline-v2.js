"use strict";

const { selectWorkflow } = require("../brain/workflow/workflow-registry");
const { selectRunner } = require("./runner/runner-selector");

async function pipelineV2(ctx) {
  const { classification } = ctx;

  const runner = selectRunner(classification);

  const originalExecution = async () => {
    return runner.run(ctx);
  };

  const wf = selectWorkflow({ classification });

  if (wf) {
    const wfResult = await wf.run({
      ...ctx,
      next: originalExecution,
    });

    if (wfResult && wfResult.type === "override") {
      return wfResult.result;
    }

    if (wfResult && wfResult.result) {
      return wfResult.result;
    }
  }

  return originalExecution();
}

module.exports = {
  pipelineV2,
};
