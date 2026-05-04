"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert");
const {
  createTokenBudget,
  makeTokenBudgetController,
  enforceMemoryBudget,
} = require("../lib/brain/kernel/token-budget");

describe("memory budget controller", () => {
  test("trimItems trims without throwing", () => {
    const controller = makeTokenBudgetController(createTokenBudget({ memoryBudget: 10 }));
    const result = controller.trimItems([
      { id: "a", tokenEstimate: 4 },
      { id: "b", tokenEstimate: 9 },
      { id: "c", tokenEstimate: 4 },
    ], 10);
    assert.deepStrictEqual(result.selected.map((x) => x.id), ["a", "c"]);
    assert.ok(result.omitted.some((x) => x.id === "b" && x.reason === "budget"));
    assert.strictEqual(result.tokenEstimate, 8);
  });

  test("trimMemoryItems uses memoryBudget", () => {
    const controller = makeTokenBudgetController({ memoryBudget: 5 });
    const result = controller.trimMemoryItems([
      { id: "a", tokenEstimate: 3 },
      { id: "b", tokenEstimate: 3 },
    ]);
    assert.deepStrictEqual(result.selected.map((x) => x.id), ["a"]);
    assert.strictEqual(result.budgetLimit, 5);
  });

  test("accountMemoryPack reports remaining budget", () => {
    const controller = makeTokenBudgetController({ memoryBudget: 12 });
    const account = controller.accountMemoryPack({ tokenEstimate: 7 });
    assert.strictEqual(account.ok, true);
    assert.strictEqual(account.remaining, 5);
  });

  test("enforceMemoryBudget marks overflow without throwing", () => {
    const pack = enforceMemoryBudget({ tokenEstimate: 99, omitted: [] }, { memoryBudget: 10 });
    assert.ok(pack.omitted.some((x) => x.reason === "budget_overflow"));
    assert.strictEqual(pack.budget.ok, false);
  });
});
