"use strict";

const {
  createNoopStateStore,
} = require("./state-store");

function createInMemoryPipelineState(opts) {
  const o = opts || {};
  const dedupTtlMs = Math.max(10000, Number(o.dedupTtlMs) || 120000);
  const mergeDebounceMs = Math.max(400, Number(o.mergeDebounceMs) || 2000);
  const store = o.store || createNoopStateStore();
  const loaded = store.load() || {};

  const recentMessageIds = new Map(loaded.recentMessageIds || []);
  const recentOutboundReplies = new Map(loaded.recentOutboundReplies || []);
  const pendingMergeByChat = new Map(); // chatId -> { rawData, timer }

  function gcMapByTtl(map, now) {
    for (const [k, ts] of map) {
      if (now - ts > dedupTtlMs) map.delete(k);
    }
  }

  function persistSnapshot() {
    store.save({
      recentMessageIds: Array.from(recentMessageIds.entries()),
      recentOutboundReplies: Array.from(recentOutboundReplies.entries()),
    });
  }

  async function dedupConsume(messageId) {
    if (!messageId) return false;
    const now = Date.now();
    gcMapByTtl(recentMessageIds, now);
    if (recentMessageIds.has(messageId)) return true;
    recentMessageIds.set(messageId, now);
    persistSnapshot();
    return false;
  }

  async function rememberOutboundReply(chatId, text) {
    if (!chatId || !text) return;
    const key = `${chatId}:${String(text).trim().slice(0, 1200)}`;
    recentOutboundReplies.set(key, Date.now());
    persistSnapshot();
  }

  async function consumeRecentOutboundReply(chatId, text) {
    if (!chatId || !text) return false;
    const now = Date.now();
    gcMapByTtl(recentOutboundReplies, now);
    const key = `${chatId}:${String(text).trim().slice(0, 1200)}`;
    if (!recentOutboundReplies.has(key)) return false;
    recentOutboundReplies.delete(key);
    persistSnapshot();
    return true;
  }

  function scheduleMergeForwardDebounce(chatId, rawData, onFire) {
    if (!chatId || !rawData || typeof onFire !== "function") return;
    const prev = pendingMergeByChat.get(chatId);
    if (prev) clearTimeout(prev.timer);
    const timer = setTimeout(() => {
      pendingMergeByChat.delete(chatId);
      onFire({
        ...rawData,
        _feishuSkipDedupOnce: true,
        _feishuMergeForwardSolo: true,
      });
    }, mergeDebounceMs);
    pendingMergeByChat.set(chatId, { rawData, timer });
  }

  function takePendingMergeForwardForChat(chatId) {
    if (!chatId) return null;
    const ent = pendingMergeByChat.get(chatId);
    if (!ent) return null;
    clearTimeout(ent.timer);
    pendingMergeByChat.delete(chatId);
    return ent.rawData;
  }

  return {
    dedupConsume,
    rememberOutboundReply,
    consumeRecentOutboundReply,
    scheduleMergeForwardDebounce,
    takePendingMergeForwardForChat,
    mergeDebounceMs,
  };
}

module.exports = {
  createInMemoryPipelineState,
};
