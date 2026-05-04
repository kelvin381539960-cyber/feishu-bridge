"use strict";

function workflowResult(input) {
  const i = input || {};
  return {
    type: i.type || "passthrough",
    result: Object.prototype.hasOwnProperty.call(i, "result") ? i.result : null,
    meta: i.meta && typeof i.meta === "object" ? i.meta : {},
    error: Object.prototype.hasOwnProperty.call(i, "error") ? i.error : null,
  };
}

class WorkflowPlugin {
  match(_ctx) {
    return false;
  }

  async run(ctx) {
    return workflowResult({
      type: "passthrough",
      result: await ctx.next(),
    });
  }
}

module.exports = {
  WorkflowPlugin,
  workflowResult,
};
