"use strict";

const { assembleMemoryContext } = require("../memory/memory-router");
const { makeTokenBudgetController } = require("./token-budget");

async function memoryStage(ctx) {
  const controller = makeTokenBudgetController(ctx.tokenBudget || {});
  const originalTask = ctx.task || (ctx.envelope && ctx.envelope.content && ctx.envelope.content.text) || "";
  const memoryQuery = ctx.memoryQuery || {
    task: originalTask,
    subject: ctx.memorySubject,
    workflow: ctx.workflowKey,
    project: ctx.projectKey,
    sessionId: ctx.sessionId || (ctx.envelope && ctx.envelope.channel && ctx.envelope.channel.chatId),
  };
  const memoryPack = await assembleMemoryContext({
    store: ctx.memoryStore,
    task: originalTask,
    query: memoryQuery,
    budget: controller.budget,
    topK: ctx.memoryTopK,
    subject: ctx.memorySubject,
    sessionId: memoryQuery.sessionId,
    limit: ctx.memoryQueryLimit || 100,
  });

  ctx.tokenBudget = controller.budget;
  ctx.memoryPack = memoryPack;
  ctx.memoryInjected = memoryPack.injected;

  if (memoryPack.injected) {
    ctx.task = {
      original: originalTask,
      memory: memoryPack,
    };
  }

  if (Array.isArray(ctx.telemetry)) {
    ctx.telemetry.push({ stage: "memory", injected: memoryPack.injected, tokenEstimate: memoryPack.tokenEstimate, budget: memoryPack.budget });
  }
}

async function memoryPersistStage(ctx) {
  if (!ctx.flags || ctx.flags.needsMemoryPersist === false) return;
  if (!ctx.memoryStore || typeof ctx.memoryStore.persistMemoryTurn !== "function") return;
  const persisted = await ctx.memoryStore.persistMemoryTurn({
    task: ctx.task && ctx.task.original ? ctx.task.original : ctx.task,
    reply: ctx.reply || ctx.result || "",
    context: {
      sessionId: ctx.sessionId || (ctx.envelope && ctx.envelope.channel && ctx.envelope.channel.chatId),
      workflow: ctx.workflowKey,
      project: ctx.projectKey,
    },
    confidence: ctx.memoryPersistConfidence,
    persist: ctx.memoryShouldPersist,
  });
  if (Array.isArray(ctx.telemetry)) ctx.telemetry.push({ stage: "memory:persist", persisted: Boolean(persisted), memoryInjected: ctx.memoryInjected === true });
}

module.exports = {
  memoryStage,
  memoryPersistStage,
};
