"use strict";

/**
 * Session memory adapter (pluggable).
 *
 * Default behavior is no-op to keep the WS pipeline stable even when
 * a real memory provider is not configured in this workspace.
 */

const MEMORY_MODULE_ENV = "FEISHU_CURSOR_MEMORY_PROVIDER";
const { createMemoryFacade } = require("./feishu-cursor/memory/memory-facade");

let cachedFacade = undefined;

function resolveFacade() {
  if (cachedFacade !== undefined) return cachedFacade;
  cachedFacade = createMemoryFacade({
    providerPath: (process.env[MEMORY_MODULE_ENV] || "").trim(),
  });
  return cachedFacade;
}

async function assembleMemoryContext(input) {
  const task = input && typeof input.task === "string" ? input.task : "";
  const facade = resolveFacade();
  try {
    const out = await facade.assembleMemoryContext(input || {});
    if (!out || typeof out.task !== "string") {
      return { injected: false, task };
    }
    return {
      injected: !!out.injected,
      task: out.task,
      memory: out.memory || null,
      providerName: facade.providerName,
    };
  } catch (err) {
    console.error("[feishu-memory] assemble failed:", err && err.message);
    return { injected: false, task };
  }
}

async function persistMemoryTurn(input) {
  const facade = resolveFacade();
  try {
    const out = await facade.persistMemoryTurn(input || {});
    if (!out || typeof out !== "object") {
      return { ok: false, skipped: true, reason: "invalid_provider_output" };
    }
    return { providerName: facade.providerName, ...out };
  } catch (err) {
    console.error("[feishu-memory] persist failed:", err && err.message);
    return { ok: false, skipped: true, reason: "persist_failed" };
  }
}

function bumpConversationEpoch(input) {
  const facade = resolveFacade();
  if (facade && typeof facade.bumpConversationEpoch === "function") {
    return facade.bumpConversationEpoch(input || {});
  }
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const builtin = require("./feishu-cursor/memory/default-memory-provider");
  return builtin.bumpConversationEpoch(input || {});
}

function getLastTurnMetaForFresh(input) {
  const facade = resolveFacade();
  if (facade && typeof facade.getLastTurnMetaForFresh === "function") {
    return facade.getLastTurnMetaForFresh(input || {});
  }
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const builtin = require("./feishu-cursor/memory/default-memory-provider");
  return builtin.getLastTurnMetaForFresh(input || {});
}

module.exports = {
  assembleMemoryContext,
  persistMemoryTurn,
  bumpConversationEpoch,
  getLastTurnMetaForFresh,
};
