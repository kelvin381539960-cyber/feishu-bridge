"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createMemoryRecord } = require("./memory-record");

function readJsonArray(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed.records) ? parsed.records : Array.isArray(parsed) ? parsed : [];
}

function writeJsonArray(filePath, records) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ records }, null, 2)}\n`, "utf8");
}

function isWorthPersisting(turn, opts) {
  const seed = turn || {};
  if (seed.persist === false) return false;
  if (seed.record) return true;
  if (seed.source === "explicit") return true;
  const text = [seed.task, seed.reply, seed.value].filter(Boolean).join(" ").trim();
  if (!text) return false;
  if (text.length < (opts.minPersistChars || 24)) return false;
  const confidence = seed.confidence == null ? 0.6 : Number(seed.confidence);
  if (!Number.isFinite(confidence) || confidence < opts.persistConfidenceThreshold) return false;
  return true;
}

function createMemoryStore(options) {
  const opts = {
    maxRecords: 500,
    ttlMs: 1000 * 60 * 60 * 24 * 90,
    persistConfidenceThreshold: 0.55,
    minPersistChars: 24,
    ...options,
  };
  const filePath = opts.filePath || null;
  let records = Array.isArray(opts.records) ? opts.records.map(createMemoryRecord) : readJsonArray(filePath).map(createMemoryRecord);
  let conversationEpoch = Number.isFinite(opts.conversationEpoch) ? opts.conversationEpoch : 0;

  function nowMs() {
    return Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  }

  function compact() {
    const cutoff = nowMs() - opts.ttlMs;
    records = records.filter((record) => {
      if (record.scope === "negative") return true;
      const updated = Date.parse(record.updatedAt);
      return !Number.isFinite(updated) || updated >= cutoff;
    });
    if (records.length > opts.maxRecords) {
      const negatives = records.filter((record) => record.scope === "negative");
      const rest = records.filter((record) => record.scope !== "negative")
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.confidence - a.confidence);
      records = [...negatives, ...rest].slice(0, opts.maxRecords);
    }
  }

  function flush() {
    compact();
    writeJsonArray(filePath, records);
  }

  function upsert(recordInput) {
    const record = createMemoryRecord(recordInput);
    const index = records.findIndex((item) => item.id === record.id || (
      item.scope === record.scope && item.subject === record.subject && item.key === record.key
    ));
    if (index >= 0) records[index] = { ...records[index], ...record, updatedAt: record.updatedAt || new Date().toISOString() };
    else records.push(record);
    flush();
    return record;
  }

  async function persistMemoryTurn(turn) {
    const seed = turn || {};
    if (!isWorthPersisting(seed, opts)) return null;
    if (seed.record) return upsert(seed.record);

    const context = seed.context || {};
    const subject = context.project || context.workflow || context.sessionId || "conversation";
    const value = seed.value || [
      seed.task ? `task: ${seed.task}` : "",
      seed.reply ? `reply: ${seed.reply}` : "",
    ].filter(Boolean).join("\n");

    return upsert({
      scope: context.scope || seed.scope || "session",
      subject,
      key: seed.key || `turn_${conversationEpoch}_${records.length}`,
      value: value || "empty turn",
      confidence: seed.confidence == null ? 0.6 : seed.confidence,
      source: seed.source || "implicit",
      updatedAt: seed.updatedAt || new Date(nowMs()).toISOString(),
    });
  }

  async function queryMemory(query) {
    compact();
    const q = query || {};
    let result = records.filter((record) => {
      if (q.scope && record.scope !== q.scope) return false;
      if (q.scopes && Array.isArray(q.scopes) && !q.scopes.includes(record.scope)) return false;
      if (q.subject && record.subject !== q.subject) return false;
      if (q.key && record.key !== q.key) return false;
      if (q.since && Date.parse(record.updatedAt) < Date.parse(q.since)) return false;
      return true;
    });
    result = result.sort((a, b) => {
      if (a.scope === "negative" && b.scope !== "negative") return -1;
      if (a.scope !== "negative" && b.scope === "negative") return 1;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id);
    });
    if (q.limit && Number(q.limit) > 0) result = result.slice(0, Number(q.limit));
    return result;
  }

  async function bumpConversationEpoch() {
    conversationEpoch += 1;
    return conversationEpoch;
  }

  function getConversationEpoch() {
    return conversationEpoch;
  }

  return {
    persistMemoryTurn,
    queryMemory,
    bumpConversationEpoch,
    getConversationEpoch,
    upsert,
    compact,
    _dump: () => records.slice(),
  };
}

const defaultStore = createMemoryStore();

module.exports = {
  createMemoryStore,
  persistMemoryTurn: defaultStore.persistMemoryTurn,
  queryMemory: defaultStore.queryMemory,
  bumpConversationEpoch: defaultStore.bumpConversationEpoch,
  isWorthPersisting,
};
