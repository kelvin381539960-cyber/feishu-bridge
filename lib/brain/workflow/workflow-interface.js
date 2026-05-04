"use strict";

class Workflow {
  match(_ctx) {
    return false;
  }

  plan(_ctx) {
    return {};
  }

  async run(_ctx) {
    throw new Error("Workflow.run(ctx) must be implemented");
  }

  finalize(_ctx) {
    return undefined;
  }
}

module.exports = {
  Workflow,
};
