"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_STORE = path.join(
  __dirname,
  "..",
  "..",
  "var",
  "state",
  "feishu-research-workflow.json"
);

const PHASE_IDLE = "";
const PHASE_CLARIFY_SENT = "clarify_sent";

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function researchWorkflowStateKey(chatId, sessionNamespace) {
  const c = trimStr(chatId);
  const ns = trimStr(sessionNamespace).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  if (!c) return "";
  return ns ? `${ns}:${c}` : c;
}

function getStorePath() {
  return String(process.env.FEISHU_RESEARCH_WORKFLOW_STATE_FILE || DEFAULT_STORE).trim();
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readStore() {
  const filePath = getStorePath();
  try {
    if (!fs.existsSync(filePath)) {
      return { version: 1, chats: {} };
    }
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return { version: 1, chats: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { version: 1, chats: {} };
    if (!parsed.chats || typeof parsed.chats !== "object") parsed.chats = {};
    return parsed;
  } catch (err) {
    console.error("[feishu-research-workflow] read failed:", err && err.message);
    return { version: 1, chats: {} };
  }
}

function writeStore(store) {
  const filePath = getStorePath();
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

function clarifyTtlMs() {
  const sec = parseInt(process.env.RESEARCH_CLARIFY_TTL_SEC || "1800", 10);
  const s = Number.isFinite(sec) && sec > 0 ? sec : 1800;
  return s * 1000;
}

function loadResearchWorkflowState(storeKey) {
  const k = trimStr(storeKey);
  if (!k) return null;
  const store = readStore();
  const row = store.chats[k];
  if (!row || typeof row !== "object") return null;
  if (row.phase === PHASE_CLARIFY_SENT && row.updatedAt) {
    const age = Date.now() - Number(row.updatedAt);
    if (Number.isFinite(age) && age > clarifyTtlMs()) {
      delete store.chats[k];
      writeStore(store);
      return null;
    }
  }
  return row;
}

function markResearchClarifySent(storeKey, payload) {
  const k = trimStr(storeKey);
  if (!k) return { ok: false, reason: "missing_key" };
  const i = payload || {};
  const store = readStore();
  store.chats[k] = {
    phase: PHASE_CLARIFY_SENT,
    workflowId: trimStr(i.workflowId) || "",
    originalUserTask: trimStr(i.originalUserTask),
    originalTask: trimStr(i.originalTask),
    updatedAt: Date.now(),
  };
  writeStore(store);
  return { ok: true };
}

function clearResearchWorkflowState(storeKey) {
  const k = trimStr(storeKey);
  if (!k) return { ok: false, reason: "missing_key" };
  const store = readStore();
  if (store.chats[k]) {
    delete store.chats[k];
    writeStore(store);
  }
  return { ok: true };
}

module.exports = {
  PHASE_IDLE,
  PHASE_CLARIFY_SENT,
  researchWorkflowStateKey,
  loadResearchWorkflowState,
  markResearchClarifySent,
  clearResearchWorkflowState,
  getStorePath,
};
