"use strict";

const DEFAULT_TOKEN_BUDGET = Object.freeze({
  totalLimit: 128000,
  reservedForOutput: 8000,
  reservedForTools: 12000,
  memoryBudget: 1500,
  artifactBudget: 3000,
  conversationBudget: 1200,
  safetyMargin: 0.2,
});

function createTokenBudget(input) {
  const seed = { ...DEFAULT_TOKEN_BUDGET, ...(input || {}) };
  const budget = {
    totalLimit: Number(seed.totalLimit),
    reservedForOutput: Number(seed.reservedForOutput),
    reservedForTools: Number(seed.reservedForTools),
    memoryBudget: Number(seed.memoryBudget),
    artifactBudget: Number(seed.artifactBudget),
    conversationBudget: Number(seed.conversationBudget),
    safetyMargin: Number(seed.safetyMargin),
  };
  validateTokenBudget(budget);
  return budget;
}

function validateTokenBudget(budget) {
  for (const key of ["totalLimit", "reservedForOutput", "reservedForTools", "memoryBudget", "artifactBudget", "conversationBudget", "safetyMargin"]) {
    if (!Number.isFinite(budget[key])) throw new Error(`${key} must be finite number`);
  }
  if (budget.totalLimit <= 0) throw new Error("totalLimit must be positive");
  if (budget.safetyMargin < 0 || budget.safetyMargin >= 1) throw new Error("safetyMargin must be >= 0 and < 1");
  const allocated = budget.reservedForOutput + budget.reservedForTools + budget.memoryBudget + budget.artifactBudget + budget.conversationBudget;
  const hardLimit = budget.totalLimit * (1 - budget.safetyMargin);
  if (allocated >= hardLimit) throw new Error("allocated budget must stay below total limit after safety margin");
  return true;
}

function makeTokenBudgetController(input) {
  const budget = createTokenBudget(input);

  function trimItems(items, limit, options) {
    const opts = options || {};
    const selected = [];
    const omitted = [];
    let used = 0;
    for (const item of Array.isArray(items) ? items : []) {
      const cost = Math.max(0, Number(item.tokenEstimate || 0));
      const id = item.record && item.record.id ? item.record.id : item.id;
      if (opts.maxItems && selected.length >= opts.maxItems) {
        omitted.push({ id, reason: "top_k", tokenEstimate: cost });
        continue;
      }
      if (used + cost > limit) {
        omitted.push({ id, reason: "budget", tokenEstimate: cost });
        continue;
      }
      selected.push(item);
      used += cost;
    }
    return { selected, omitted, tokenEstimate: used, budgetLimit: limit };
  }

  function trimMemoryItems(items, options) {
    return trimItems(items, budget.memoryBudget, options);
  }

  function accountMemoryPack(pack) {
    const tokenEstimate = Number(pack && pack.tokenEstimate ? pack.tokenEstimate : 0);
    return {
      ok: tokenEstimate <= budget.memoryBudget,
      tokenEstimate,
      budgetLimit: budget.memoryBudget,
      remaining: Math.max(0, budget.memoryBudget - tokenEstimate),
    };
  }

  return {
    budget,
    trimItems,
    trimMemoryItems,
    accountMemoryPack,
  };
}

function enforceMemoryBudget(pack, budgetInput) {
  const controller = makeTokenBudgetController(budgetInput);
  const accounting = controller.accountMemoryPack(pack);
  return {
    ...pack,
    budget: accounting,
    omitted: accounting.ok ? pack.omitted : [
      ...(Array.isArray(pack.omitted) ? pack.omitted : []),
      { reason: "budget_overflow", tokenEstimate: accounting.tokenEstimate, budgetLimit: accounting.budgetLimit },
    ],
  };
}

module.exports = {
  DEFAULT_TOKEN_BUDGET,
  createTokenBudget,
  validateTokenBudget,
  makeTokenBudgetController,
  enforceMemoryBudget,
};
