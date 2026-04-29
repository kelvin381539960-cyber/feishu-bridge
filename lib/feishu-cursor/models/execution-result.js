"use strict";

function normalizeExecutionResult(input) {
  const base = input || {};
  const code = Number.isFinite(Number(base.code)) ? Number(base.code) : 1;
  const out = {
    ok: code === 0,
    code,
    stdout: String(base.stdout || ""),
    stderr: String(base.stderr || ""),
    error: base.error || null,
    runnerType: String(base.runnerType || "openclaw"),
    backendMode: String(base.backendMode || "openclaw"),
    queueMode: String(base.queueMode || "inline"),
    queueWaitMs: Number(base.queueWaitMs || 0),
    queueDepth: Number(base.queueDepth || 0),
    agentProfile: String(base.agentProfile || "full"),
    permissionMode:
      base.permissionMode === undefined ? undefined : String(base.permissionMode || ""),
    cleanCwd: !!base.cleanCwd,
    ackMode:
      base.ackMode === undefined ? undefined : String(base.ackMode || ""),
    degradeReason:
      base.degradeReason === undefined ? "" : String(base.degradeReason || ""),
    routeClass:
      base.routeClass === undefined ? "" : String(base.routeClass || ""),
    routeAgentId:
      base.routeAgentId === undefined ? "" : String(base.routeAgentId || ""),
    sessionId: base.sessionId === undefined ? "" : String(base.sessionId || ""),
    routeReasonCodes: Array.isArray(base.routeReasonCodes)
      ? base.routeReasonCodes.filter(Boolean).map((v) => String(v))
      : [],
    structuredResult:
      base.structuredResult && typeof base.structuredResult === "object"
        ? base.structuredResult
        : null,
  };
  if (base.researchMeta && typeof base.researchMeta === "object") {
    out.researchMeta = base.researchMeta;
  }
  if (base.runtimeRunTrace != null && typeof base.runtimeRunTrace === "object") {
    out.runtimeRunTrace = base.runtimeRunTrace;
  }
  if (base.learningMemoryRecord != null && typeof base.learningMemoryRecord === "object") {
    out.learningMemoryRecord = base.learningMemoryRecord;
  }
  if (base.multiAgentRequired !== undefined) {
    out.multiAgentRequired = !!base.multiAgentRequired;
  }
  if (base.executionPolicy != null && typeof base.executionPolicy === "object") {
    out.executionPolicy = base.executionPolicy;
  }
  return out;
}

module.exports = {
  normalizeExecutionResult,
};
