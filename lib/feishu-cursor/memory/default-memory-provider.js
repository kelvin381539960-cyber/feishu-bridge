"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

/** Prefer OpenClaw sessionId so memory aligns with gateway session; else chatId (legacy). */
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
  return store;
}

function getEpoch(store, conversationKey) {
  const ck = trimStr(conversationKey);
  if (!ck) return "0";
  normalizeStore(store);
  const v = store.activeEpochByConversationKey[ck];
  return trimStr(v) || "0";
}

/**
 * Bump conversation epoch (PR1). conversationKey is typically researchWorkflowStateKey (chat+ns).
 */
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
    if (!fs.existsSync(filePath)) {
      return normalizeStore({ version: 2, chats: {} });
    }
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return normalizeStore({ version: 2, chats: {} });
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return normalizeStore({ version: 2, chats: {} });
    if (!parsed.chats || typeof parsed.chats !== "object") parsed.chats = {};
    if (!parsed.version) parsed.version = 2;
    return normalizeStore(parsed);
  } catch (err) {
    console.error("[feishu-memory] default provider read failed:", err && err.message);
    return normalizeStore({ version: 2, chats: {} });
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

/** Lazy migrate legacy flat sessionId key into epoch composite (epoch 0). */
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

/**
 * Last assistant turn meta for fresh-task evidence (before bump).
 */
function getLastTurnMetaForFresh({ conversationKey, sessionId }) {
  const sid = trimStr(sessionId);
  const ck = trimStr(conversationKey);
  if (!sid || !ck) return null;
  const store = readStore();
  normalizeStore(store);
  const comp = resolveCompositeChatKey(store, sid, ck);
  maybeMigrateLegacyChat(store, sid, ck);
  let chat = store.chats[comp];
  if (!chat && store.chats[sid]) {
    chat = store.chats[sid];
  }
  if (!chat || !Array.isArray(chat.turns) || !chat.turns.length) return null;
  const last = chat.turns[chat.turns.length - 1];
  const replyBody = String(last.replyBody || "");
  return {
    workflowKey: String(last.workflowKey || ""),
    artifactRef: String(last.artifactRef || ""),
    assistantReplyLen: replyBody.length,
  };
}

function extractKeywords(text) {
  return Array.from(
    new Set(
      String(text || "")
        .toLowerCase()
        .split(/[^a-z0-9\u4e00-\u9fa5]+/)
        .map((x) => x.trim())
        .filter((x) => x.length >= 2)
        .slice(0, 12)
    )
  );
}

function buildTurnLine(turn) {
  return [
    turn.userTask ? `用户：${String(turn.userTask).trim()}` : "",
    turn.replyBody ? `助手：${String(turn.replyBody).trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSummary(turns) {
  const recent = turns.slice(-6);
  if (!recent.length) return "";
  return recent
    .map((turn, idx) => `第${idx + 1}条近期记录：${buildTurnLine(turn)}`)
    .join("\n");
}

function buildRetrievalSnippets(turns, task) {
  const keywords = extractKeywords(task);
  if (!keywords.length) return [];
  return turns
    .filter((turn) => {
      const hay = `${turn.userTask || ""}\n${turn.replyBody || ""}`.toLowerCase();
      return keywords.some((kw) => hay.includes(kw));
    })
    .slice(-3)
    .map((turn) => buildTurnLine(turn))
    .filter(Boolean);
}

async function assembleMemoryContext(input) {
  const i = input || {};
  const task = String(i.task || "");
  const chatId = String(i.chatId || "");
  const storeKey = resolveMemoryStoreKey(i);
  if (!storeKey || !task) return { injected: false, task, memory: null, memoryMode: "default" };

  const modeLower = String(i.memoryMode || "").trim().toLowerCase();
  if (modeLower === "ignore") {
    return { injected: false, task, memory: null, memoryMode: "ignore" };
  }

  const store = readStore();
  normalizeStore(store);
  const convKey = trimStr(i.conversationEpochKey);
  const compositeKey = convKey ? resolveCompositeChatKey(store, storeKey, convKey) : storeKey;
  if (convKey) {
    maybeMigrateLegacyChat(store, storeKey, convKey);
  }
  const chat = store.chats[compositeKey] || (!convKey ? store.chats[storeKey] : null);
  if (!chat || !Array.isArray(chat.turns) || !chat.turns.length) {
    return { injected: false, task, memory: null, memoryMode: modeLower || "default" };
  }

  if (modeLower === "meta_followup") {
    const last = chat.turns[chat.turns.length - 1];
    if (!last) {
      return { injected: false, task, memory: null, memoryMode: "meta_followup" };
    }
    const u = String(last.userTask || "").slice(0, 520);
    const a = String(last.replyBody || "").slice(0, 900);
    const wf = trimStr(last.workflowKey);
    const ar = trimStr(last.artifactRef);
    const lines = [
      "[上一轮上下文摘要 — 仅供本轮延续；禁止复述与当前任务无关的上文主题]",
      wf ? `上轮工作流：${wf}` : "",
      ar ? `上轮产物引用：${ar}` : "",
      u ? `上轮用户任务（节选）：${u}` : "",
      a ? `上轮助手回复（节选）：${a}` : "",
    ].filter(Boolean);
    const memoryBlock = lines.join("\n");
    if (!memoryBlock) {
      return { injected: false, task, memory: null, memoryMode: "meta_followup" };
    }
    return {
      injected: true,
      task: `${memoryBlock}\n\n[当前任务]\n${task}`,
      memory: {
        source: "builtin",
        metaFollowup: true,
        storePath: getStorePath(),
      },
      memoryMode: "meta_followup",
    };
  }

  const turns = chat.turns.slice(-MAX_TURNS);
  const summary = chat.summary || buildSummary(turns);
  const recentTurns = turns.slice(-4).map((turn) => buildTurnLine(turn)).filter(Boolean);
  const retrievalSnippets = buildRetrievalSnippets(turns, task);
  const memoryBlock = [
    summary ? "[会话摘要]\n" + summary : "",
    recentTurns.length ? "[最近对话]\n" + recentTurns.join("\n\n") : "",
    retrievalSnippets.length ? "[相关记忆片段]\n" + retrievalSnippets.join("\n\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!memoryBlock) return { injected: false, task, memory: null, memoryMode: "default" };
  return {
    injected: true,
    task: `${memoryBlock}\n\n[当前任务]\n${task}`,
    memory: {
      source: "builtin",
      summary,
      recentTurns,
      retrievalSnippets,
      storePath: getStorePath(),
    },
    memoryMode: "default",
  };
}

async function persistMemoryTurn(input) {
  const i = input || {};
  const chatId = String(i.chatId || "");
  const storeKey = resolveMemoryStoreKey(i);
  if (!storeKey) {
    return { ok: false, skipped: true, reason: "missing_memory_key", turnCount: 0 };
  }

  const store = readStore();
  normalizeStore(store);
  const convKey = trimStr(i.conversationEpochKey);
  const compositeKey = convKey ? resolveCompositeChatKey(store, storeKey, convKey) : storeKey;
  if (convKey) {
    maybeMigrateLegacyChat(store, storeKey, convKey);
  }
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
  return {
    ok: true,
    skipped: false,
    reason: "",
    turnCount: chat.turns.length,
    summary: chat.summary,
  };
}

module.exports = {
  assembleMemoryContext,
  persistMemoryTurn,
  getStorePath,
  composeMemoryKey,
  bumpConversationEpoch,
  getLastTurnMetaForFresh,
};
