"use strict";

async function runBrainStages({ registry, stages, ctx }) {
  if (!Array.isArray(registry)) throw new Error("registry must be array");

  for (const name of registry) {
    if (ctx.flags && ctx.flags.shortCircuited) break;

    const fn = stages[name];
    if (typeof fn !== "function") continue;

    try {
      await fn(ctx);
    } catch (err) {
      if (ctx && Array.isArray(ctx.errors)) {
        ctx.errors.push(err);
      }
      throw err; // preserve legacy behavior
    }
  }
}

module.exports = {
  runBrainStages,
};
