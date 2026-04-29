"use strict";

function normalizeRelayMode(mode) {
  const s = String(mode || "").trim().toLowerCase();
  if (s === "off" || s === "enforce") return s;
  return "shadow";
}

function sanitizeRelayReplyBody(body, userTask, message, botOpenId, isRelayLikeTask) {
  let out = String(body || "");
  if (!out || !isRelayLikeTask || !isRelayLikeTask(userTask || "")) return out;

  const names = new Set();
  const firstTriggerAt = String(userTask || "").match(/^\s*@([^\s@]+)\s*/);
  if (firstTriggerAt && firstTriggerAt[1]) names.add(firstTriggerAt[1].trim());

  const mentions = message && message.mentions;
  if (Array.isArray(mentions) && mentions.length && botOpenId) {
    for (const m of mentions) {
      const oid = m && m.id && m.id.open_id;
      const n = (m && m.name) || "";
      if (oid === botOpenId && String(n).trim()) names.add(String(n).trim());
    }
  }

  if (botOpenId) {
    const reSelfOid = new RegExp(`^\\s*@${botOpenId}\\s*`);
    out = out.replace(reSelfOid, "");
  }
  for (const n of names) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const reName = new RegExp(`^\\s*@${esc}\\s*`);
    out = out.replace(reName, "");
  }

  out = out.replace(/^\s*(请你|需要你)\s*/, "").trim();
  if (/^通过/.test(out)) out = `请${out}`;
  return out;
}

function extractRelayQuestionText(taskText) {
  const s = String(taskText || "").trim();
  if (!s) return "";
  const q = s.match(/问(.+?)(?:[。！？!?]|$)/);
  if (q && q[1]) return q[1].trim();
  const m = s.match(/(今天.+|今天天气.+|天气.+)$/);
  if (m && m[1]) return m[1].trim().replace(/[。！？!?]+$/, "");
  return "今天怎么样";
}

function buildRelayDecision(taskText, message, botOpenId, isRelayLikeTask, mode) {
  const relayMode = normalizeRelayMode(mode);
  const text = String(taskText || "");
  if (!isRelayLikeTask || !isRelayLikeTask(text)) {
    return {
      mode: relayMode,
      isRelayTask: false,
      shouldShortCircuit: false,
      replyBody: "",
      confidence: 0,
      reason: "not_relay_task",
    };
  }

  const mentions = (message && Array.isArray(message.mentions) && message.mentions) || [];
  if (!mentions.length) {
    return {
      mode: relayMode,
      isRelayTask: true,
      shouldShortCircuit: false,
      replyBody: "",
      confidence: 0.1,
      reason: "missing_mentions",
    };
  }

  const others = mentions.filter((m) => {
    const oid = m && m.id && m.id.open_id;
    return oid && (!botOpenId || oid !== botOpenId);
  });
  if (others.length !== 1) {
    return {
      mode: relayMode,
      isRelayTask: true,
      shouldShortCircuit: false,
      replyBody: "",
      confidence: 0.15,
      reason: "ambiguous_mentions",
      mentionsCount: others.length,
    };
  }

  const target = others[0].id.open_id;
  const q = extractRelayQuestionText(taskText);
  if (!target || !q) {
    return {
      mode: relayMode,
      isRelayTask: true,
      shouldShortCircuit: false,
      replyBody: "",
      confidence: 0.2,
      reason: "missing_target_or_question",
    };
  }

  const hasConnector = /通过|转告|转述|传话/.test(text);
  const hasPronoun = /(^|[^\w])(他|她|TA|ta)([^\w]|$)/.test(text);
  const isSimpleDirectRelay = !hasConnector && !hasPronoun;
  const confidence = isSimpleDirectRelay ? 0.93 : 0.35;
  const reason = isSimpleDirectRelay
    ? "simple_direct_relay"
    : hasPronoun
      ? "relay_ambiguous_pronoun"
      : "relay_ambiguous_connector";
  const replyBody = isSimpleDirectRelay ? `@${target} ${q}？` : "";
  const shouldShortCircuit =
    relayMode === "enforce" && isSimpleDirectRelay && Boolean(replyBody);

  return {
    mode: relayMode,
    isRelayTask: true,
    shouldShortCircuit,
    replyBody,
    confidence,
    reason,
    targetOpenId: target,
    question: q,
  };
}

function buildDeterministicRelayReply(taskText, message, botOpenId, isRelayLikeTask, mode) {
  const decision = buildRelayDecision(taskText, message, botOpenId, isRelayLikeTask, mode);
  return decision.shouldShortCircuit ? decision.replyBody : "";
}

module.exports = {
  sanitizeRelayReplyBody,
  normalizeRelayMode,
  extractRelayQuestionText,
  buildRelayDecision,
  buildDeterministicRelayReply,
};
