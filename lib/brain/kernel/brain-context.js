"use strict";

function createBrainContext(input) {
  const seed = input || {};
  return {
    envelope: seed.envelope,
    flags: seed.flags || {},
    telemetry: seed.telemetry || null,
    errors: seed.errors || [],

    // Compatibility fields: keep current pipeline variables accessible without reshaping.
    data: seed.data || seed.envelope,
    state: seed.state || {},
  };
}

module.exports = {
  createBrainContext,
};
