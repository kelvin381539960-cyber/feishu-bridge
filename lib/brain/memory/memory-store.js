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

function createMemoryStore(options) {
  const opts = options || {};
  const filePath = opts.filePath || null;
  let records = Array.isArray(opts.records) ? opts.records.map(createMemoryRecord) : readJsonArray(filePath).map(createMemoryRecord);
  let conversationEpoch = Number.isFinite(opts.conversationEpoch) ? opts.conversationEpoch : 0;

  function flush() {
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
    const context = seed.context || {};
    const subject = context.project || context.workflow || context.sessionId || "conversation";
    const value = [
      seed.task ? `task: ${seed.task}` : "",
      seed.reply ? `reply: ${seed.reply}` : "",
      context.memoryInjected === true ? "memoryInjected: true" : "memoryInjected: false",
    ].filter(Boolean).join("\n");

    return upsert({
      scope: context.scope || "session",
      subject,
      key: seed.key || `turn_${Date.now()}_${records.length}`,
      value: value || "empty turn",
      confidence: seed.confidence == null ? 0.6 : seed.confidence,
      source: seed.source || "implicit",
      updatedAt: seed.updatedAt || new Date().toISOString(),
    });
  }

  async function queryMemory(query) {
    const q = query || {};
    return records.filter((record) => {
      if (q.scope && record.scope !== q.scope) return false;
      if (q.scopes && Array.isArray(q.scopes) && !q.scopes.includes(record.scope)) return false;
      if (q.subject && record.subject !== q.subject) return false;
      if (q.key && record.key !== q.key) return false;
      return true;
    });
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
    _dump: () => records.slice(),
  };
}

const defaultStore = createMemoryStore();

module.exports = {
  createMemoryStore,
  persistMemoryTurn: defaultStore.persistMemoryTurn,
  queryMemory: defaultStore.queryMemory,
  bumpConversationEpoch: defaultStore.bumpConversationEpoch,
};
