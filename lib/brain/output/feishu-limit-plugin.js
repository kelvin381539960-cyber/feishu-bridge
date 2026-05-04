"use strict";

const { OutputPlugin } = require("./output-plugin-interface");

function truthy(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function maxReplyChars(env) {
  const e = env || process.env;
  const raw = String(e.FEISHU_REPLY_MAX_CHARS || e.FEISHU_OUTPUT_MAX_CHARS || "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(200, Math.min(Math.floor(n), 2_000_000));
}

function findBreak(text, start, hardEnd) {
  const slice = text.slice(start, hardEnd);
  const candidates = ["\n\n", "\n", "。", "！", "？", ";", "；", ",", "，", " "];
  let best = -1;
  for (const mark of candidates) {
    const idx = slice.lastIndexOf(mark);
    if (idx > best && idx >= Math.floor(slice.length * 0.55)) best = idx + mark.length;
  }
  return best > 0 ? start + best : hardEnd;
}

function splitReplyBody(replyBody, maxChars) {
  const text = String(replyBody || "");
  if (!maxChars || text.length <= maxChars) return [text];
  const segments = [];
  let pos = 0;
  while (pos < text.length) {
    const hardEnd = Math.min(pos + maxChars, text.length);
    const end = hardEnd >= text.length ? hardEnd : findBreak(text, pos, hardEnd);
    const chunk = text.slice(pos, end).trim();
    if (chunk) segments.push(chunk);
    pos = end;
    while (pos < text.length && /\s/.test(text[pos])) pos += 1;
  }
  return segments.length ? segments : [text];
}

class FeishuLimitPlugin extends OutputPlugin {
  constructor() {
    super();
    this.name = "feishuLimitPlugin";
  }

  match(_ctx, _result) {
    return true;
  }

  async process(ctx, result) {
    const env = (ctx && ctx.env) || process.env;
    const replyBody = result && typeof result.replyBody === "string" ? result.replyBody : "";
    const maxChars = maxReplyChars(env);
    const segmentSendEnabled = truthy(env.FEISHU_OUTPUT_SEGMENT_SEND || env.FEISHU_REPLY_SEGMENT_SEND);

    if (!maxChars || replyBody.length <= maxChars) {
      return {
        replyBody,
        metadata: { limitApplied: false },
      };
    }

    const segments = splitReplyBody(replyBody, maxChars);
    const metadata = {
      limitApplied: true,
      maxChars,
      segmentCount: segments.length,
    };

    if (segmentSendEnabled && segments.length > 1) {
      metadata.replySegments = segments;
    }

    return {
      replyBody,
      metadata,
    };
  }
}

const feishuLimitPlugin = new FeishuLimitPlugin();

module.exports = {
  FeishuLimitPlugin,
  feishuLimitPlugin,
  splitReplyBody,
};
