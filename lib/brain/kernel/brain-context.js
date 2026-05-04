"use strict";

const DEFAULT_FLAGS = Object.freeze({
  shortCircuited: false,
  needsAck: true,
  needsMemoryPersist: true,
  needsDocExport: false,
  skipDocExport: false,
});

function createBrainContext(input) {
  const seed = input || {};
  return {
    envelope: seed.envelope,
    flags: {
      ...DEFAULT_FLAGS,
      ...(seed.flags || {}),
    },
    telemetry: Array.isArray(seed.telemetry) ? seed.telemetry : [],
    errors: Array.isArray(seed.errors) ? seed.errors : [],
  };
}

module.exports = {
  DEFAULT_FLAGS,
  createBrainContext,
};
