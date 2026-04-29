"use strict";

const builtinProvider = require("./default-memory-provider");

function loadExternalProvider(modPath) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const loaded = require(modPath);
    return loaded && typeof loaded === "object" ? loaded : null;
  } catch (err) {
    console.error("[feishu-memory] provider load failed:", modPath, err && err.message);
    return null;
  }
}

function createMemoryFacade(input) {
  const i = input || {};
  const modPath = String(i.providerPath || "").trim();
  const externalProvider = modPath ? loadExternalProvider(modPath) : null;
  const provider = externalProvider || builtinProvider;

  const bumpConversationEpoch =
    provider && typeof provider.bumpConversationEpoch === "function"
      ? provider.bumpConversationEpoch.bind(provider)
      : null;
  const getLastTurnMetaForFresh =
    provider && typeof provider.getLastTurnMetaForFresh === "function"
      ? provider.getLastTurnMetaForFresh.bind(provider)
      : null;

  return {
    providerName: externalProvider ? modPath : "builtin",
    async assembleMemoryContext(payload) {
      return provider.assembleMemoryContext(payload || {});
    },
    async persistMemoryTurn(payload) {
      return provider.persistMemoryTurn(payload || {});
    },
    bumpConversationEpoch,
    getLastTurnMetaForFresh,
  };
}

module.exports = {
  createMemoryFacade,
};
