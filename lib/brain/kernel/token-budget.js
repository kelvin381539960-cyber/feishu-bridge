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

function enforceMemoryBudget(pack, budget) {
  const safeBudget = createTokenBudget(budget);
  if (!pack || typeof pack !== "object") throw new Error("memory pack required");
  if (pack.tokenEstimate > safeBudget.memoryBudget) throw new Error("memory pack exceeds memoryBudget");
  return pack;
}

module.exports = {
  DEFAULT_TOKEN_BUDGET,
  createTokenBudget,
  validateTokenBudget,
  enforceMemoryBudget,
};
