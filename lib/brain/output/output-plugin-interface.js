"use strict";

class OutputPlugin {
  match(_ctx, _result) {
    return false;
  }

  process(_ctx, result) {
    return {
      replyBody: result && typeof result.replyBody === "string" ? result.replyBody : "",
      metadata: result && result.metadata && typeof result.metadata === "object" ? result.metadata : {},
    };
  }
}

module.exports = {
  OutputPlugin,
};
