"use strict";

function createFakeDocExporter(options) {
  const o = options || {};
  const calls = [];

  async function hook(payload) {
    calls.push(payload || {});
    if (typeof o.onExport === "function") return o.onExport(payload || {}, calls.length);
    if (o.throwOnExport) throw new Error(o.throwOnExport === true ? "fake export failed" : String(o.throwOnExport));
    return {
      replyBody:
        typeof o.replyBody === "string"
          ? o.replyBody
          : payload && typeof payload.replyBody === "string"
            ? payload.replyBody
            : "",
      memoryReplyBody: o.memoryReplyBody,
    };
  }

  return {
    calls,
    hook,
  };
}

module.exports = {
  createFakeDocExporter,
};
