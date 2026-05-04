"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createMemoryRecord } = require("../../brain/memory/memory-record");
const { routeMemory } = require("../../brain/memory/memory-router");
const { estimateTokens } = require("../../brain/memory/memory-router");

const DEFAULT_STORE = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "var",
  "state",
  "feishu-cursor-memory.json"
);
const MAX_TURNS = 24;
const EPOCH_MARKER = "|feishuEpoch=";

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function resolveMemoryStoreKey(input) {
  const i = input || {};
  const sid = trimStr(i.sessionId || i.memoryKey);
  if (sid) return sid;
  return trimStr(i.chatId);
}

function composeMemoryKey(baseSessionId, epoch) {
  const b = trimStr(baseSessionId);
  const e = trimStr(epoch) || "0";
  if (!b) return "";
  return `${b}${EPOCH_MARKER}${e}`;
}

function getStorePath() {
  return String(process.env.FEISHU_CURSOR_MEMORY_STORE || DEFAULT_STORE).trim();
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizeStore(store) {
  if (!store.activeEpochByConversationKey || typeof store.activeEpochByConversationKey !== "object") {
    store.activeEpochByConversationKey = {};
  }
  if (!store.chats || typeof store.chats !== "object") store.chats = {};
  if (!store.version) store.version = 3;
  return store;
}

function getEpoch(store, conversationKey) {
  const ck = trimStr(conversationKey);
  if (!ck) return "0";
  normalizeStore(store);
  const v = store.activeEpochByConversationKey[ck];
  return trimStr(v) || "0";
}

function bumpConversationEpoch({ conversationKey, newEpoch }) {
  const ck = trimStr(conversationKey);
  const ne = trimStr(newEpoch) || crypto.randomUUID();
  if (!ck) return { ok: false, reason: "missing_conversation_key", epoch: "" };
  const store = readStore();
  normalizeStore(store);
  store.activeEpochByConversationKey[ck] = ne;
  writeStore(store);
  return { ok: true, epoch: ne };
}

function readStore() {
  const filePath = getStorePath();
  try {
    if (!fs.existsSync(filePath)) return normalizeStore({ version: 3, chats: {} });
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return normalizeStore({ version: 3, chats: {} });
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return normalizeStore({ version: 3, chats: {} });
    return normalizeStore(parsed);
  } catch (err) {
    console.error("[feishu-memory] default provider read failed:", err && err.message);
    return normalizeStore({ version: 3, chats: {} });
  }
}

function writeStore(store) {
  const filePath = getStorePath();
  ensureParentDir(filePath);
  normalizeStore(store);
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

function resolveCompositeChatKey(store, baseSessionId, conversationKey) {
  const base = trimStr(baseSessionId);
  if (!base) return "";
  const ck = trimStr(conversationKey);
  if (!ck) return base;
  const epoch = getEpoch(store, ck);
  return composeMemoryKey(base, epoch);
}

function maybeMigrateLegacyChat(store, baseSessionId, conversationKey) {
  const ck = trimStr(conversationKey);
  const base = trimStr(baseSessionId);
  if (!ck || !base) return;
  const epoch = getEpoch(store, ck);
  const comp = composeMemoryKey(base, epoch);
  if (store.chats[comp] || !store.chats[base]) return;
  if (base.includes(EPOCH_MARKER)) return;
  store.chats[comp] = store.chats[base];
  delete store.chats[base];
  writeStore(store);
}

function getLastTurnMetaForFresh({ conversationKey, sessionId }) {
  const sid = trimStr(sessionId);
  const ck = trimStr(conversationKey);
  if (!sid || !ck) return null;
  const store = readStore();
  normalizeStore(store);
  const comp = resolveCompositeChatKey(store, sid, ck);
  maybeMigrateLegacyChat(store, sid, ck);
  let chat = store.chats[comp];
  if (!chat && store.chats[sid]) chat = store.chats[sid];
  if (!chat || !Array.isArray(chat.turns) || !chat.turns.length) return null;
  const last = chat.turns[chat.turns.length - 1];
  const replyBody = String(last.replyBody || "");
  return {
    workflowKey: String(last.workflowKey || ""),
    artifactRef: String(last.artifactRef || ""),
    assistantReplyLen: replyBody.length,
  };
}

function buildTurnValue(turn, mode) {
  const parts = [];
  if (turn.workflowKey) parts.push(`workflow=${String(turn.workflowKey)}`);
  if (turn.artifactRef) parts.push(`artifact=${String(turn.artifactRef)}`);
  if (turn.userTask) parts.push(`userTask=${String(turn.userTask)}`);
  if (turn.replyBody) parts.push(`reply=${String(turn.replyBody)}`);
  if (mode === "meta_followup") parts.push("mode=meta_followup");
  return parts.join("\n");
}

function turnsToMemoryRecords({ turns, sessionId, epoch, mode }) {
  const safeTurns = Array.isArray(turns) ? turns.slice(-MAX_TURNS) : [];
  return safeTurns.map((turn, index) => createMemoryRecord({
    scope: mode === "meta_followup" ? "session" : "workflow",
    subject: trimStr(turn.workflowKey) || "conversation",
    key: mode === "meta_followup" ? `last_turn_${index}` : `turn_${index}`,
    value: buildTurnValue(turn, mode),
    confidence: mode === "meta_followup" ? 0.75 : 0.6,
    source: "implicit",
    sessionId,
    epoch,
    updatedAt: turn.ts ? new Date(Number(turn.ts)).toISOString() : new Date(0).toISOString(),
  })).filter((record) => record.value.trim());
}

async function assembleMemoryContext(input) {
  const i = input || {};
  const task = String(i.task || "");
  const storeKey = resolveMemoryStoreKey(i);
  const modeLower = String(i.memoryMode || "").trim().toLowerCase() || "default";
  if (!storeKey || !task) return { injected: false, task, memory: null, memoryPack: null, memoryMode: modeLower };
  if (modeLower === "ignore") return { injected: false, task, memory: null, memoryPack: null, memoryMode: "ignore" };

  const store = readStore();
  normalizeStore(store);
  const convKey = trimStr(i.conversationEpochKey);
  const epoch = convKey ? getEpoch(store, convKey) : "0";
  const compositeKey = convKey ? resolveCompositeChatKey(store, storeKey, convKey) : storeKey;
  if (convKey) maybeMigrateLegacyChat(store, storeKey, convKey);
  const chat = store.chats[compositeKey] || (!convKey ? store.chats[storeKey] : null);
  if (!chat || !Array.isArray(chat.turns) || !chat.turns.length) {
    return { injected: false, task, memory: null, memoryPack: null, memoryMode: modeLower };
  }

  const records = turnsToMemoryRecords({
    turns: modeLower === "meta_followup" ? chat.turns.slice(-1) : chat.turns,
    sessionId: storeKey,
    epoch,
    mode: modeLower,
  });
  const memoryBudget = Number(i.memoryBudget || (i.tokenBudget && i.tokenBudget.memoryBudget) || process.env.FEISHU_CURSOR_MEMORY_BUDGET || 1500);
  const memoryPack = routeMemory({
    records,
    query: { task, sessionId: storeKey, epoch, mode: modeLower },
    budget: { memoryBudget },
    topK: Number(i.memoryTopK || process.env.FEISHU_CURSOR_MEMORY_TOP_K || 8),
    negativeTopK: Number(i.negativeTopK || process.env.FEISHU_CURSOR_NEGATIVE_MEMORY_TOP_K || 3),
    routing: {
      provider: "default-memory-provider",
      mode: modeLower,
      sessionId: storeKey,
      epoch,
      storePath: getStorePath(),
    },
  });

  return {
    injected: memoryPack.injected,
    task,
    memory: memoryPack.injected ? { source: "builtin", mode: modeLower, storePath: getStorePath() } : null,
    memoryPack: memoryPack.injected ? memoryPack : null,
    memoryMode: modeLower,
  };
}

function buildSummary(turns) {
  const recent = Array.isArray(turns) ? turns.slice(-6) : [];
  return recent.map((turn, idx) => {
    const u = trimStr(turn.userTask);
    const a = trimStr(turn.replyBody);
    return `第${idx + 1}条近期记录：${[u ? `用户：${u}` : "", a ? `助手：${a}` : ""].filter(Boolean).join("\n")}`;
  }).join("\n");
}

async function persistMemoryTurn(input) {
  const i = input || {};
  const storeKey = resolveMemoryStoreKey(i);
  if (!storeKey) return { ok: false, skipped: true, reason: "missing_memory_key", turnCount: 0 };

  const store = readStore();
  normalizeStore(store);
  const convKey = trimStr(i.conversationEpochKey);
  const compositeKey = convKey ? resolveCompositeChatKey(store, storeKey, convKey) : storeKey;
  if (convKey) maybeMigrateLegacyChat(store, storeKey, convKey);
  const chat = store.chats[compositeKey] || { turns: [], summary: "", updatedAt: 0 };
  chat.turns.push({
    ts: Date.now(),
    userTask: String(i.userTask || ""),
    replyBody: String(i.replyBody || ""),
    workflowKey: trimStr(i.workflowKey),
    artifactRef: trimStr(i.artifactRef),
  });
  chat.turns = chat.turns.slice(-MAX_TURNS);
  chat.summary = buildSummary(chat.turns);
  chat.updatedAt = Date.now();
  store.chats[compositeKey] = chat;
  writeStore(store);
  return { ok: true, skipped: false, reason: "", turnCount: chat.turns.length, summary: chat.summary };
}

module.exports = {
  assembleMemoryContext,
  persistMemoryTurn,
  getStorePath,
  composeMemoryKey,
  bumpConversationEpoch,
  getLastTurnMetaForFresh,
};
