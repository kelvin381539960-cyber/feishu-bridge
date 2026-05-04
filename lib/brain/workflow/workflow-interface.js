"use strict";

class Workflow {
  match(_ctx) {
    return false;
  }

  async run(ctx) {
    return {
      type: "passthrough",
      result: await ctx.next(),
    };
  }
}

module.exports = {
  Workflow,
};
