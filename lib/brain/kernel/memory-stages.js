"use strict";

const { assembleMemoryContext } = require("../memory/memory-router");
const { createTokenBudget } = require("./token-budget");

async function memoryStage(ctx) {
  const budget = createTokenBudget(ctx.tokenBudget || {});
  const memoryPack = await assembleMemoryContext({
    store: ctx.memoryStore,
    task: ctx.task || (ctx.envelope && ctx.envelope.content && ctx.envelope.content.text) || "",
    query: ctx.memoryQuery || {
      task: ctx.task || (ctx.envelope && ctx.envelope.content && ctx.envelope.content.text) || "",
      subject: ctx.memorySubject,
      workflow: ctx.workflowKey,
      project: ctx.projectKey,
    },
    budget,
    topK: ctx.memoryTopK,
  });

  ctx.tokenBudget = budget;
  ctx.memoryPack = memoryPack;
  ctx.memoryInjected = memoryPack.injected;

  if (memoryPack.injected) {
    ctx.task = {
      original: ctx.task || (ctx.envelope && ctx.envelope.content && ctx.envelope.content.text) || "",
      memory: memoryPack,
    };
  }

  if (Array.isArray(ctx.telemetry)) {
    ctx.telemetry.push({ stage: "memory", injected: memoryPack.injected, tokenEstimate: memoryPack.tokenEstimate });
  }
}

async function memoryPersistStage(ctx) {
  if (!ctx.flags || ctx.flags.needsMemoryPersist === false) return;
  if (!ctx.memoryStore || typeof ctx.memoryStore.persistMemoryTurn !== "function") return;
  await ctx.memoryStore.persistMemoryTurn({
    task: ctx.task && ctx.task.original ? ctx.task.original : ctx.task,
    reply: ctx.reply || ctx.result || "",
    context: {
      sessionId: ctx.sessionId || (ctx.envelope && ctx.envelope.channel && ctx.envelope.channel.chatId),
      workflow: ctx.workflowKey,
      project: ctx.projectKey,
      memoryInjected: ctx.memoryInjected === true,
    },
  });
  if (Array.isArray(ctx.telemetry)) ctx.telemetry.push({ stage: "memory:persist", persisted: true, memoryInjected: ctx.memoryInjected === true });
}

module.exports = {
  memoryStage,
  memoryPersistStage,
};
