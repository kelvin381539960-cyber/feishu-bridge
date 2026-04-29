"use strict";

/**
 * 将执行结果（stdout/stderr/code）格式化为飞书回复正文；与执行后端（OpenClaw 等）解耦。
 */

const MAX_REPLY_CHARS = 59000;

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

/**
 * @param {{ code?: number, stdout?: string, stderr?: string, runtimeRunTrace?: object }} r
 * @param {{ sourceMessageId?: string, onRequestIdMismatch?: function }} [opts]
 * @returns {string}
 */
function formatCursorAdhocReply(r, opts) {
  const o = opts || {};
  const msgId = trimStr(o.sourceMessageId);
  const trace = r && r.runtimeRunTrace;
  const trId = trace && trimStr(trace.requestId);
  if (msgId && trId && trId !== msgId && typeof o.onRequestIdMismatch === "function") {
    try {
      o.onRequestIdMismatch({ messageId: msgId, traceRequestId: trId });
    } catch (_) {
      /* ignore callback errors */
    }
  }
  const code = r && typeof r.code === "number" ? r.code : 1;
  const stdout = String((r && r.stdout) || "").replace(/\s+$/, "");
  const stderr = String((r && r.stderr) || "").replace(/\s+$/, "");
  const structuredSummary =
    r &&
    r.structuredResult &&
    typeof r.structuredResult.summary === "string" &&
    r.structuredResult.summary.trim()
      ? r.structuredResult.summary.trim()
      : "";
  if (code === 0) {
    if (structuredSummary) return structuredSummary.slice(0, MAX_REPLY_CHARS);
    if (stdout) return stdout.slice(0, MAX_REPLY_CHARS);
    if (stderr) return stderr.slice(0, MAX_REPLY_CHARS);
    return "(无输出)";
  }
  const parts = [`（任务退出码 ${code}）`];
  if (stderr) parts.push(stderr);
  else if (stdout) parts.push(stdout);
  return parts.join("\n\n").slice(0, MAX_REPLY_CHARS);
}

function getCursorTaskAckMessage() {
  if ((process.env.CURSOR_TASK_ACK_MESSAGE_OFF || "").trim() === "1") {
    return "";
  }
  const m = (process.env.CURSOR_TASK_ACK_MESSAGE || "").trim();
  return m || "⏳";
}

module.exports = {
  formatCursorAdhocReply,
  getCursorTaskAckMessage,
  MAX_REPLY_CHARS,
};
