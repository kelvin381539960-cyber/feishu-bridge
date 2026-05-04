"use strict";

class OutputPlugin {
  match(_ctx, _result) {
    return false;
  }

  async process(_ctx, result) {
    const r = result || {};
    return {
      replyBody: typeof r.replyBody === "string" ? r.replyBody : "",
      metadata: {},
    };
  }
}

module.exports = {
  OutputPlugin,
};
