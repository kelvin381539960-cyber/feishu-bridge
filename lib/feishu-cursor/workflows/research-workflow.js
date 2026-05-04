"use strict";

const { WorkflowPlugin, workflowResult } = require("./workflow-interface");
const { runResearchWorkflowV2 } = require("../../openclaw-control-plane/research-workflow-runner");
const { runSpecializedSoloWithTrace } = require("../runtime/specialized-solo-runner");

/**
 * ResearchWorkflowPlugin owns research execute dispatch only.
 *
 * Lifecycle ownership remains in pipeline-v2 for P6:
 * - clarify-first state machine
 * - clarify continuation / end task
 * - fresh reset
 * - failed snapshot persistence
 *
 * This keeps P3 replay side effects stable while moving the executable
 * research runner choice behind a workflow plugin boundary.
 */
class ResearchWorkflowPlugin extends WorkflowPlugin {
  match(ctx) {
    return ctx && ctx.classification && ctx.classification.taskType === "research";
  }

  async run(ctx) {
    if (!ctx || typeof ctx.next !== "function") {
      return workflowResult({
        type: "error",
        result: null,
        error: new Error("ResearchWorkflowPlugin requires ctx.next"),
        meta: { workflow: "research" },
      });
    }

    const prompt = ctx.prompt || {};
    if (prompt.stage !== "execute") {
      return workflowResult({
        type: "passthrough",
        result: await ctx.next(),
        meta: {
          workflow: "research",
          owner: "pipeline_lifecycle",
          stage: prompt.stage || "unknown",
        },
      });
    }

    const executionPolicy = ctx.executionPolicy || {};
    const useV2 = !!(ctx.rwV2 || executionPolicy.multiAgentRequired);
    const forcedV2 = !!(executionPolicy.multiAgentRequired && !ctx.rwV2);

    if (useV2) {
      return workflowResult({
        type: "override",
        result: await runResearchWorkflowV2({
          runOpenclawGatewayPrompt: ctx.runOpenclawGatewayPrompt,
          envelope: ctx.envelope,
          runtimeConfig: ctx.runtimeConfig,
          dispatch: ctx.dispatch,
          classification: ctx.classification,
          messageId: ctx.messageId,
          logger: ctx.logger,
          executionPolicy: {
            ...executionPolicy,
            forcedRuntimeV2: forcedV2,
          },
        }),
        meta: {
          workflow: "research",
          stage: "execute",
          runner: "research_v2",
          forcedV2,
        },
      });
    }

    if (ctx.classification && ctx.classification.role === "specialized") {
      return workflowResult({
        type: "override",
        result: await runSpecializedSoloWithTrace(ctx.runOpenclawGatewayPrompt, {
          dispatch: ctx.dispatch,
          classification: ctx.classification,
          executionPolicy,
          promptStage: prompt.stage,
        }),
        meta: {
          workflow: "research",
          stage: "execute",
          runner: "specialized_solo",
        },
      });
    }

    return workflowResult({
      type: "override",
      result: await ctx.runOpenclawGatewayPrompt(ctx.task, ctx.dispatch && ctx.dispatch.opts),
      meta: {
        workflow: "research",
        stage: "execute",
        runner: "adhoc",
      },
    });
  }
}

const researchWorkflowPlugin = new ResearchWorkflowPlugin();

module.exports = {
  ResearchWorkflowPlugin,
  researchWorkflowPlugin,
};
