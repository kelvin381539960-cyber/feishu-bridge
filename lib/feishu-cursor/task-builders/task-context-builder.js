"use strict";

const crypto = require("crypto");
const { createTaskContext } = require("../models/task-context");

function buildTraceId(seed) {
  const raw = String(seed || "");
  if (!raw) return crypto.randomUUID();
  return crypto.createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

function buildTaskContext(input) {
  const i = input || {};
  const traceSeed = [i.chatId, i.messageId, i.task].filter(Boolean).join(":");
  return createTaskContext({
    traceId: i.traceId || buildTraceId(traceSeed),
    chatId: i.chatId,
    messageId: i.messageId,
    messageType: i.messageType,
    rawTask: i.rawTask,
    task: i.task,
    userTask: i.userTask,
    normalizedTask: i.normalizedTask,
    mediaText: i.mediaText,
    parentContextInjected: i.parentContextInjected,
    mentionContextInjected: i.mentionContextInjected,
    memoryInjected: i.memoryInjected,
    sheetTaskDetected: i.sheetTaskDetected,
    relayShortcutReply: i.relayShortcutReply,
    profile: i.profile,
    classification: i.classification,
    relayDecision: i.relayDecision,
    safety: i.safety,
    memory: i.memory,
    prompt: i.prompt,
    execution: i.execution,
    meta: i.meta,
  });
}

module.exports = {
  buildTaskContext,
};
