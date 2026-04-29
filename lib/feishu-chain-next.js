"use strict";

/**
 * Post-cursor chain adapter (pluggable).
 *
 * Default behavior is no-op. A custom handler can be provided through
 * FEISHU_CURSOR_CHAIN_NEXT_PROVIDER to keep the main pipeline decoupled.
 */

const CHAIN_MODULE_ENV = "FEISHU_CURSOR_CHAIN_NEXT_PROVIDER";

let cachedProvider = undefined;

function resolveProvider() {
  if (cachedProvider !== undefined) return cachedProvider;
  const modPath = (process.env[CHAIN_MODULE_ENV] || "").trim();
  if (!modPath) {
    cachedProvider = null;
    return cachedProvider;
  }
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const loaded = require(modPath);
    if (!loaded || typeof loaded !== "object") {
      console.warn("[feishu-chain] invalid provider module:", modPath);
      cachedProvider = null;
      return cachedProvider;
    }
    cachedProvider = loaded;
    return cachedProvider;
  } catch (err) {
    console.error("[feishu-chain] provider load failed:", modPath, err && err.message);
    cachedProvider = null;
    return cachedProvider;
  }
}

async function maybeChainAfterCursor(input) {
  const provider = resolveProvider();
  if (!provider || typeof provider.maybeChainAfterCursor !== "function") {
    return { chained: false, skipped: true, reason: "no_provider" };
  }
  try {
    const out = await provider.maybeChainAfterCursor(input || {});
    if (!out || typeof out !== "object") return { chained: false, skipped: true };
    return out;
  } catch (err) {
    console.error("[feishu-chain] maybeChainAfterCursor failed:", err && err.message);
    return { chained: false, skipped: true, reason: "chain_failed" };
  }
}

module.exports = {
  maybeChainAfterCursor,
};
