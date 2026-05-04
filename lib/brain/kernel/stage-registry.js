"use strict";

// P5: memory stages are opt-in by implementation presence; missing stages are skipped by stage-runner.
const BRAIN_STAGE_REGISTRY = [
  "memory",
  "legacy-wrapper",
  "memory:persist",
];

module.exports = {
  BRAIN_STAGE_REGISTRY,
};
