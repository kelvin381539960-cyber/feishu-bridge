"use strict";

class Workflow {
  match(_ctx) {
    return false;
  }

  async run(_ctx) {
    return {
      type: "passthrough",
      result: null,
    };
  }
}

module.exports = {
  Workflow,
};
