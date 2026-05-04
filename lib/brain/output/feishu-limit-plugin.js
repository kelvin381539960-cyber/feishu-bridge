"use strict";

const { OutputPlugin } = require("./output-plugin-interface");

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function resolveMode(env) {
  const raw = trimStr((env || process.env).FEISHU_OUTPUT_LIMIT_MODE).toLowerCase();
  if (raw === "segment" || raw === "split") return "segment";
  if (raw === "truncate" || raw === "clip") return "truncate";
  return "off";
}

function resolveMaxChars(env) {
  const e = env || process.env;
  const n = Number(String(e.FEISHU_OUTPUT_MAX_CHARS || e.FEISHU_REPLY_MAX_CHARS || "").trim());
  if (!Number.isFinite(n) || n < 500) return 0;
  return Math.min(Math.floor(n), 200000);
}

function findSemanticCut(text, max) {
  const candidates = ["\n\n", "\n", "。", "！", "？", ". ", "! ", "? ", "；", "; ", "，", ", ", " "];
  let cut = -1;
  for (const sep of candidates) {
    const idx = text.lastIndexOf(sep, max);
    if (idx >= 0) cut = Math.max(cut, idx + sep.length);
  }
  if (cut < Math.floor(max * 0.5)) return max;
  return cut;
}

function splitLongBlock(block, max) {
  const chunks = [];
  let rest = String(block || "");
  while (rest.length > max) {
    const cut = findSemanticCut(rest, max);
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function splitSemanticChunks(text, max) {
  const full = String(text || "");
  if (!max || full.length <= max) return [full];

  const chunks = [];
  let current = "";
  const parts = full.split(/(\n{2,})/);
  for (const part of parts) {
    if (!part) continue;
    if (part.length > max) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...splitLongBlock(part, max));
      continue;
    }
    if (current && (current + part).length > max) {
      chunks.push(current);
      current = part;
    } else {
      current += part;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [full];
}

function withSegmentHeaders(chunks, max) {
  if (!Array.isArray(chunks) || chunks.length <= 1) return chunks || [];
  const payloadMax = Math.max(1, max - 32);
  const normalized = chunks.flatMap((chunk) => String(chunk || "").length > payloadMax ? splitLongBlock(chunk, payloadMax) : [chunk]);
  const total = normalized.length;
  return normalized.map((chunk, index) => `（${index + 1}/${total}）\n${chunk}`);
}

class FeishuLimitPlugin extends OutputPlugin {
  match(ctx, result) {
    const env = (ctx && ctx.env) || process.env;
    return !!result && typeof result.replyBody === "string" && resolveMode(env) !== "off" && resolveMaxChars(env) > 0;
  }

  process(ctx, result) {
    const env = (ctx && ctx.env) || process.env;
    const mode = resolveMode(env);
    const max = resolveMaxChars(env);
    const replyBody = String((result && result.replyBody) || "");
    const previousMetadata = result && result.metadata && typeof result.metadata === "object" ? result.metadata : {};

    if (!max || replyBody.length <= max) {
      return { replyBody, metadata: previousMetadata };
    }

    if (mode === "truncate") {
      const suffix = "\n…（内容过长，已截断）";
      const nextReplyBody = `${replyBody.slice(0, Math.max(0, max - suffix.length))}${suffix}`;
      return {
        replyBody: nextReplyBody,
        metadata: {
          ...previousMetadata,
          feishuLimitApplied: true,
          feishuLimitMode: "truncate",
        },
      };
    }

    const chunks = withSegmentHeaders(splitSemanticChunks(replyBody, Math.max(1, max - 32)), max);
    return {
      replyBody,
      metadata: {
        ...previousMetadata,
        feishuLimitApplied: chunks.length > 1,
        feishuLimitMode: "segment",
        replySegments: chunks,
      },
    };
  }
}

const feishuLimitPlugin = new FeishuLimitPlugin();

module.exports = {
  FeishuLimitPlugin,
  feishuLimitPlugin,
  _test: {
    resolveMode,
    resolveMaxChars,
    splitSemanticChunks,
    withSegmentHeaders,
  },
};
