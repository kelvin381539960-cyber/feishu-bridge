"use strict";

const { selectRunner } = require("../feishu-cursor/runner/runner-selector");
const { buildOpenclawDispatchRequest } = require("./session-dispatch");

function planExecutionBroker(input) {
  const i = input || {};
  const runner = selectRunner({
    prompt: i.prompt,
    classification: i.classification,
    runtimeConfig: i.runtimeConfig,
  });
  const dispatch = buildOpenclawDispatchRequest({
    envelope: i.envelope,
    prompt: i.prompt,
    runner,
    classification: i.classification,
    runtimeConfig: i.runtimeConfig,
  });
  return {
    runner,
    dispatch,
  };
}

module.exports = {
  planExecutionBroker,
};
