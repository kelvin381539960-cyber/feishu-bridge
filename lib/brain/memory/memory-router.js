"use strict";

const { validateMemoryRecord } = require("./memory-record");
const { createMemoryPack } = require("./memory-pack");
const { makeTokenBudgetController } = require("../kernel/token-budget");

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

  const confidence = record.confidence * 2;
  const scopeBoost = q.scope && q.scope === record.scope ? 1 : 0;
  const subjectBoost = q.subject && q.subject === record.subject ? 1 : 0;
  const lexical = queryTerms.size ? overlap / Math.max(1, queryTerms.size) : 0.25;
  return confidence + scopeBoost + subjectBoost + lexical;
}

function scoreRecord(record, query) {
  return {
    record,
    score: relevanceScore(record, query),
    tokenEstimate: estimateTokens([record.scope, record.subject, record.key, record.value].join(" ")),
  };
}

function stableSortScored(items) {
  return items.slice().sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
}

function routeMemory(input) {
  const seed = input || {};
  const records = Array.isArray(seed.records) ? seed.records.filter(Boolean) : [];
  const query = seed.query || seed.task || {};
  const topK = Math.max(1, Number(seed.topK || 8));
  const controller = seed.controller || makeTokenBudgetController(seed.budget || { memoryBudget: seed.memoryBudget });

  const negativeItems = stableSortScored(records.filter((record) => {
    validateMemoryRecord(record);
    return record.scope === "negative";
  }).map((record) => scoreRecord(record, query)));

  const positiveItems = stableSortScored(records.filter((record) => {
    validateMemoryRecord(record);
    return record.scope !== "negative";
  }).map((record) => scoreRecord(record, query)));

  // Negative memory is a hard-priority bucket. It is evaluated before topK and before positives.
  // It can still be omitted only when the memoryBudget cannot fit the record at all.
  const negativeTrimmed = controller.trimMemoryItems(negativeItems, { maxItems: Math.max(1, Number(seed.negativeTopK || negativeItems.length || 1)) });
  const remainingBudget = Math.max(0, controller.budget.memoryBudget - negativeTrimmed.tokenEstimate);
  const positiveTopK = Math.max(0, topK - negativeTrimmed.selected.length);
  const positiveTrimmed = controller.trimItems(positiveItems, remainingBudget, { maxItems: positiveTopK });

  const selectedItems = [...negativeTrimmed.selected, ...positiveTrimmed.selected];
  const recordsSelected = selectedItems.map((item) => item.record);
  const tokenEstimate = negativeTrimmed.tokenEstimate + positiveTrimmed.tokenEstimate;
  const omitted = [...negativeTrimmed.omitted, ...positiveTrimmed.omitted];

  return createMemoryPack({
    records: recordsSelected,
    partitions: {
      negative: negativeTrimmed.selected.map((item) => item.record),
      positive: positiveTrimmed.selected.map((item) => item.record),
    },
    tokenEstimate,
    omitted,
    budget: controller.accountMemoryPack({ tokenEstimate }),
  });
}

async function assembleMemoryContext({ store, task, query, budget, topK, scope, subject, sessionId, epoch, limit }) {
  const q = query || task || {};
  const queryArgs = {
    scope,
    subject: subject || q.subject,
    sessionId: sessionId || q.sessionId,
    epoch: epoch == null ? q.epoch : epoch,
    limit: limit || q.limit || 100,
  };
  const records = store && typeof store.queryMemory === "function" ? await store.queryMemory(queryArgs) : [];
  return routeMemory({ records, query: q, budget, topK });
}

module.exports = {
  estimateTokens,
  relevanceScore,
  routeMemory,
  assembleMemoryContext,
};
