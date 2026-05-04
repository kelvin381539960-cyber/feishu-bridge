"use strict";

function createFakeOpenclawExecutor(options) {
  const o = options || {};
  const calls = [];
  const responses = Array.isArray(o.responses) ? o.responses.slice() : [];

  async function run(task, opts) {
    calls.push({ task, opts });
    if (responses.length) {
      const next = responses.shift();
      if (typeof next === "function") return next(task, opts, calls.length);
      return next;
    }
    if (typeof o.onRun === "function") return o.onRun(task, opts, calls.length);
    return { code: 0, stdout: o.stdout || "OK", stderr: "", error: null };
  }

  return {
    calls,
    run,
  };
}

module.exports = {
  createFakeOpenclawExecutor,
};
