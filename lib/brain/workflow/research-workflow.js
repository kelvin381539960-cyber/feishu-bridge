"use strict";

const { Workflow } = require("./workflow-interface");
const { runResearchWorkflowV2 } = require("../../feishu-cursor/../openclaw-control-plane/research-workflow-runner");

class ResearchWorkflow extends Workflow {
  match(ctx) {
    const c = ctx && ctx.classification;
    return c && (c.taskType === "research" || c.workflowKey === "research");
  }

  plan(ctx) {
    const { classification, prompt, executionPolicy, rwV2 } = ctx;
    const isExecute =
      classification && classification.taskType === "research" && prompt && prompt.stage === "execute";

    const useV2 = isExecute && (rwV2 || (executionPolicy && executionPolicy.multiAgentRequired));

    return {
      workflowKey: "research",
      stage: prompt && prompt.stage,
      useV2,
      forcedV2: isExecute && executionPolicy && executionPolicy.multiAgentRequired && !rwV2,
    };
  }

  async run(ctx) {
    const plan = ctx.plan || this.plan(ctx);
    const {
      dispatch,
      classification,
      executionPolicy,
      runCursorAdhocPrompt,
      runSpecializedSoloWithTrace,
      envelope,
      runtimeConfig,
      messageId,
      logger,
    } = ctx;

    if (plan.useV2) {
      return runResearchWorkflowV2({
        runOpenclawGatewayPrompt: runCursorAdhocPrompt,
        envelope,
        runtimeConfig,
        dispatch,
        classification,
        messageId,
        logger,
        executionPolicy: {
          ...executionPolicy,
          forcedRuntimeV2: plan.forcedV2,
        },
      });
    }

    if (classification && classification.role === "specialized") {
      return runSpecializedSoloWithTrace(runCursorAdhocPrompt, {
        dispatch,
        classification,
        executionPolicy,
        promptStage: ctx.prompt && ctx.prompt.stage,
      });
    }

    return runCursorAdhocPrompt(dispatch.task, dispatch.opts);
  }
}

module.exports = {
  ResearchWorkflow,
};
