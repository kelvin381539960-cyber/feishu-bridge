"use strict";

const { validateMemoryRecord } = require("./memory-record");

function estimateTokens(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value || "");
  return Math.max(0, Math.ceil(text.length / 4));
}

function tokenize(value) {
  return String(value || "").toLowerCase().split(/[^a-z0-9_\u4e00-\u9fff]+/).filter(Boolean);
}

function relevanceScore(record, query) {
  validateMemoryRecord(record);
  const q = query || {};
  const queryText = [q.task, q.text, q.workflow, q.project, q.subject].filter(Boolean).join(" ");
  const queryTerms = new Set(tokenize(queryText));
  const haystack = tokenize([record.subject, record.key, record.value].join(" "));
  let overlap = 0;
  for (const term of haystack) if (queryTerms.has(term)) overlap += 1;

  const base = record.scope === "negative" ? 5 : 0;
  const confidence = record.confidence * 2;
  const scopeBoost = q.scope && q.scope === record.scope ? 1 : 0;
  const subjectBoost = q.subject && q.subject === record.subject ? 1 : 0;
  const lexical = queryTerms.size ? overlap / Math.max(1, queryTerms.size) : 0.25;
  return base + confidence + scopeBoost + subjectBoost + lexical;
}

function buildSummary(records) {
  if (!records.length) return "";
  return records.map((record) => `- [${record.scope}] ${record.subject}.${record.key}: ${record.value}`).join("\n");
}

function routeMemory(input) {
  const seed = input || {};
  const records = Array.isArray(seed.records) ? seed.records.filter(Boolean) : [];
  const memoryBudget = Math.max(0, Number(seed.memoryBudget || (seed.budget && seed.budget.memoryBudget) || 0));
  const topK = Math.max(1, Number(seed.topK || 8));
  const scored = records.map((record) => {
    validateMemoryRecord(record);
    return {
      record,
      score: relevanceScore(record, seed.query || seed.task || {}),
      tokenEstimate: estimateTokens([record.scope, record.subject, record.key, record.value].join(" ")),
    };
  }).sort((a, b) => b.score - a.score || b.record.updatedAt.localeCompare(a.record.updatedAt));

  const selected = [];
  const omitted = [];
  let tokenEstimate = 0;

  for (const item of scored) {
    if (selected.length >= topK) {
      omitted.push({ id: item.record.id, reason: "top_k", tokenEstimate: item.tokenEstimate });
      continue;
    }
    if (memoryBudget > 0 && tokenEstimate + item.tokenEstimate > memoryBudget) {
      omitted.push({ id: item.record.id, reason: "budget", tokenEstimate: item.tokenEstimate });
      continue;
    }
    selected.push(item.record);
    tokenEstimate += item.tokenEstimate;
  }

  const summary = buildSummary(selected);
  return {
    injected: selected.length > 0,
    records: selected,
    summary,
    tokenEstimate,
    omitted,
  };
}

async function assembleMemoryContext({ store, task, query, budget, topK }) {
  const records = store && typeof store.queryMemory === "function" ? await store.queryMemory({}) : [];
  return routeMemory({ records, query: query || task || {}, budget, topK });
}

module.exports = {
  estimateTokens,
  relevanceScore,
  routeMemory,
  assembleMemoryContext,
};
