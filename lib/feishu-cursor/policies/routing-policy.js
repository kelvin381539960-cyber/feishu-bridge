"use strict";

function checkRoutingEligibility(routing, extracted) {
  if (!extracted || extracted.skip) return { ok: false, reason: "skip" };
  if (!extracted.chatId) return { ok: false, reason: "no_chat_id" };
  if (!routing || !routing.enabled) return { ok: false, reason: "routing_disabled" };
  if (!routing.chatAllowed(extracted.chatId)) {
    return { ok: false, reason: "chat_not_allowed" };
  }
  return { ok: true };
}

function resolveTaskAfterRouting(routing, rawTask) {
  const base = String(rawTask || "");
  if (routing && routing.direct) {
    const t = base.trim();
    if (!t) return { ok: false, reason: "empty_task" };
    return { ok: true, task: t };
  }
  const prefix = routing && routing.prefix ? routing.prefix : "/figma";
  if (!base.startsWith(prefix)) return { ok: false, reason: "prefix_miss" };
  const t = base.slice(prefix.length).trim();
  if (!t) return { ok: false, reason: "empty_task" };
  return { ok: true, task: t };
}

module.exports = {
  checkRoutingEligibility,
  resolveTaskAfterRouting,
};
