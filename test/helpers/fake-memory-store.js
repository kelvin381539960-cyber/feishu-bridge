"use strict";

function createFakeMemoryStore(options) {
  const o = options || {};
  const calls = {
    assemble: [],
    persist: [],
    bumpEpoch: [],
    lastTurnMeta: [],
  };

  return {
    calls,
    assembleMemoryContext: async (payload) => {
      calls.assemble.push(payload || {});
      if (typeof o.assemble === "function") return o.assemble(payload || {});
      return {
        injected: false,
        task: payload && payload.task,
        memoryMode: payload && payload.memoryMode,
      };
    },
    persistMemoryTurn: async (payload) => {
      calls.persist.push(payload || {});
      if (typeof o.persist === "function") return o.persist(payload || {});
      return { ok: true, turnCount: calls.persist.length };
    },
    bumpConversationEpoch: (payload) => {
      calls.bumpEpoch.push(payload || {});
      return { ok: true };
    },
    getLastTurnMetaForFresh: (payload) => {
      calls.lastTurnMeta.push(payload || {});
      if (typeof o.getLastTurnMetaForFresh === "function") {
        return o.getLastTurnMetaForFresh(payload || {});
      }
      return null;
    },
  };
}

module.exports = {
  createFakeMemoryStore,
};
