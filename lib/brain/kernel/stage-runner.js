"use strict";

async function runBrainStages({ registry, stages, ctx }) {
  for (const name of registry) {
    const fn = stages[name];
    if (typeof fn === "function") {
      await fn(ctx);
    }
  }
}

module.exports = {
  runBrainStages,
};
