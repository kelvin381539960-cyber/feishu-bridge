"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_STORE = path.join(
  __dirname,
  "..",
  "..",
  "var",
  "state",
  "feishu-failed-research-snapshots.json"
);

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function getStorePath() {
  return String(process.env.FEISHU_FAILED_RESEARCH_SNAPSHOT_FILE || DEFAULT_STORE).trim();
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readStore() {
  const filePath = getStorePath();
  try {
    if (!fs.existsSync(filePath)) {
      return { version: 1, byKey: {} };
    }
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return { version: 1, byKey: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { version: 1, byKey: {} };
    if (!parsed.byKey || typeof parsed.byKey !== "object") parsed.byKey = {};
    return parsed;
  } catch (err) {
    console.error("[failed-research-snapshot] read failed:", err && err.message);
    return { version: 1, byKey: {} };
  }
}

function writeStore(store) {
  const filePath = getStorePath();
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

/**
 * @param {string} storeKey researchWorkflowStateKey
 * @param {object} snap
 */
function writeFailedResearchSnapshot(storeKey, snap) {
  const k = trimStr(storeKey);
  if (!k) return { ok: false, reason: "missing_key" };
  const i = snap || {};
  const store = readStore();
  store.byKey[k] = {
    requestId: trimStr(i.requestId),
    originalUserTask: trimStr(i.originalUserTask),
    workflow: trimStr(i.workflow) || "research",
    stage: trimStr(i.stage) || "execute",
    error: trimStr(i.error).slice(0, 8000),
    createdAt: trimStr(i.createdAt) || new Date().toISOString(),
    lastKnownArtifactRef: trimStr(i.lastKnownArtifactRef).slice(0, 2000),
  };
  writeStore(store);
  return { ok: true };
}

module.exports = {
  writeFailedResearchSnapshot,
  getStorePath,
};
