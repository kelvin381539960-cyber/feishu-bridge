"use strict";

function createTaskQueue(input) {
  const i = input || {};
  const mode = String(i.mode || "inline").trim().toLowerCase() === "serial"
    ? "serial"
    : "inline";
  let tail = Promise.resolve();
  let activeCount = 0;
  let queuedCount = 0;

  async function runInline(taskFn) {
    const startedAt = Date.now();
    const result = await taskFn();
    return {
      result,
      metadata: {
        mode,
        queueWaitMs: 0,
        queueDepth: activeCount,
        startedAt,
        finishedAt: Date.now(),
      },
    };
  }

  async function enqueue(taskFn) {
    if (typeof taskFn !== "function") throw new TypeError("taskFn must be a function");
    if (mode === "inline") return runInline(taskFn);

    const enqueuedAt = Date.now();
    queuedCount += 1;
    const run = async () => {
      queuedCount -= 1;
      activeCount += 1;
      const startedAt = Date.now();
      try {
        const result = await taskFn();
        return {
          result,
          metadata: {
            mode,
            queueWaitMs: startedAt - enqueuedAt,
            queueDepth: queuedCount,
            startedAt,
            finishedAt: Date.now(),
          },
        };
      } finally {
        activeCount -= 1;
      }
    };
    const current = tail.then(run, run);
    tail = current.then(
      () => undefined,
      () => undefined
    );
    return current;
  }

  return {
    mode,
    enqueue,
  };
}

module.exports = {
  createTaskQueue,
};
