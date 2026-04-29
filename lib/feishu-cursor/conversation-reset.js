"use strict";

/**
 * PR1: Fresh-task vs followup-weak. followupWeak is checked first and never triggers reset.
 */

const HARD_FRESH_RE =
  /^(新任务|新话题|换个话题|重新开始|重开|换一个问题|新的问题|new task|fresh task)[:：、，\s]/i;

const WEAK_FRESH_RE =
  /^(另外做一个|再来一个新的|换成|先不说这个|另一个需求|新需求|不要管上一个|这次换成)[:：、，\s]?/i;

const FOLLOWUP_WEAK_RE =
  /(补充一下|继续优化|继续|展开|优化上一版|再深入|改一下|基于刚才|沿用上面|完善一下|补充|展开第)/;

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function detectFollowupWeak(text) {
  const s = trimStr(text);
  if (!s) return false;
  return FOLLOWUP_WEAK_RE.test(s);
}

function detectFreshHard(text) {
  const s = trimStr(text);
  if (!s) return false;
  return HARD_FRESH_RE.test(s);
}

function detectFreshWeak(text) {
  const s = trimStr(text);
  if (!s) return false;
  return WEAK_FRESH_RE.test(s);
}

function activeWorkflowEvidence(input) {
  const i = input || {};
  const researchRow = i.researchRow;
  const PHASE_CLARIFY_SENT = i.PHASE_CLARIFY_SENT || "clarify_sent";
  if (researchRow && researchRow.phase === PHASE_CLARIFY_SENT) return true;

  const meta = i.lastTurnMeta;
  if (meta && typeof meta === "object") {
    if (trimStr(meta.workflowKey)) return true;
    if (trimStr(meta.artifactRef)) return true;
    const n = Number(meta.assistantReplyLen);
    const th = Number(i.assistantLenThreshold);
    const threshold = Number.isFinite(th) && th > 0 ? th : 1200;
    if (Number.isFinite(n) && n > threshold) return true;
  }
  return false;
}

/**
 * @returns {{ shouldReset: boolean, reason: string }}
 */
function evaluateFreshReset(input) {
  const text = trimStr(input && input.userText);
  if (!text) return { shouldReset: false, reason: "" };

  if (detectFollowupWeak(text)) {
    return { shouldReset: false, reason: "followup_weak_no_reset" };
  }
  if (detectFreshHard(text)) {
    return { shouldReset: true, reason: "fresh_hard" };
  }
  if (detectFreshWeak(text) && activeWorkflowEvidence(input)) {
    return { shouldReset: true, reason: "fresh_weak_with_evidence" };
  }
  return { shouldReset: false, reason: "" };
}

module.exports = {
  detectFreshHard,
  detectFreshWeak,
  detectFollowupWeak,
  activeWorkflowEvidence,
  evaluateFreshReset,
};
