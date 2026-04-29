"use strict";

function createTaskContext(input) {
  const base = input || {};
  return {
    traceId: String(base.traceId || ""),
    chatId: String(base.chatId || ""),
    messageId: String(base.messageId || ""),
    messageType: String(base.messageType || ""),
    rawTask: String(base.rawTask || base.task || ""),
    task: String(base.task || ""),
    userTask: String(base.userTask || base.task || ""),
    normalizedTask: String(base.normalizedTask || base.task || ""),
    mediaText: String(base.mediaText || ""),
    parentContextInjected: !!base.parentContextInjected,
    mentionContextInjected: !!base.mentionContextInjected,
    memoryInjected: !!base.memoryInjected,
    sheetTaskDetected: !!base.sheetTaskDetected,
    relayShortcutReply: base.relayShortcutReply || "",
    profile: base.profile || "full",
    classification:
      base.classification && typeof base.classification === "object"
        ? { ...base.classification }
        : null,
    relayDecision:
      base.relayDecision && typeof base.relayDecision === "object"
        ? { ...base.relayDecision }
        : null,
    safety:
      base.safety && typeof base.safety === "object" ? { ...base.safety } : null,
    memory:
      base.memory && typeof base.memory === "object" ? { ...base.memory } : null,
    prompt:
      base.prompt && typeof base.prompt === "object" ? { ...base.prompt } : null,
    execution:
      base.execution && typeof base.execution === "object"
        ? { ...base.execution }
        : null,
    meta: base.meta && typeof base.meta === "object" ? { ...base.meta } : {},
  };
}

module.exports = {
  createTaskContext,
};
