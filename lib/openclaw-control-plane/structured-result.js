"use strict";

const { buildUsageDigest } = require("../feishu-llm-usage-footer");

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function normalizeArtifact(input) {
  if (!input) return null;
  if (typeof input === "string") {
    const s = trimStr(input);
    return s ? { kind: "text", text: s } : null;
  }
  if (typeof input !== "object") return null;
  const kind = trimStr(input.kind || input.type || "artifact") || "artifact";
  const path = trimStr(input.path);
  const url = trimStr(input.url);
  const text = trimStr(input.text || input.content || input.markdown);
  const title = trimStr(input.title);
  const out = { kind };
  if (path) out.path = path;
  if (url) out.url = url;
  if (text) out.text = text;
  if (title) out.title = title;
  return out;
}

function extractTextFromContent(content) {
  if (typeof content === "string") return trimStr(content);
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
      continue;
    }
    if (block.type === "markdown" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return trimStr(parts.join("\n"));
}

function extractArtifactsFromHistory(historyPayload) {
  const messages =
    historyPayload && Array.isArray(historyPayload.messages) ? historyPayload.messages : [];
  const artifacts = [];
  for (const message of messages) {
    if (!message || message.role !== "assistant") continue;
    const content = Array.isArray(message.content) ? message.content : [];
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "artifact" || block.type === "file" || block.type === "link") {
        const artifact = normalizeArtifact(block);
        if (artifact) artifacts.push(artifact);
      }
      if (block.type === "markdown" && typeof block.text === "string") {
        artifacts.push({
          kind: "markdown",
          text: trimStr(block.text),
        });
      }
    }
  }
  return artifacts;
}

function firstStructuredCandidate(payload) {
  if (!payload || typeof payload !== "object") return null;
  const candidates = [
    payload.structuredResult,
    payload.result,
    payload.output,
    payload.finalResult,
    payload.reply,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") return candidate;
  }
  return null;
}

function normalizeStructuredResult(input) {
  const i = input || {};
  const candidate =
    firstStructuredCandidate(i.waitPayload) ||
    firstStructuredCandidate(i.sendPayload) ||
    firstStructuredCandidate(i.historyPayload) ||
    null;
  const fallbackText =
    trimStr(i.fallbackText) ||
    extractTextFromContent(
      i.historyPayload &&
        Array.isArray(i.historyPayload.messages) &&
        i.historyPayload.messages.length
        ? i.historyPayload.messages[i.historyPayload.messages.length - 1].content
        : null
    );
  const artifacts = [];
  if (candidate && Array.isArray(candidate.artifacts)) {
    for (const artifact of candidate.artifacts) {
      const normalized = normalizeArtifact(artifact);
      if (normalized) artifacts.push(normalized);
    }
  }
  artifacts.push(...extractArtifactsFromHistory(i.historyPayload));

  const summary =
    trimStr(candidate && candidate.summary) ||
    trimStr(candidate && candidate.message) ||
    trimStr(candidate && candidate.text) ||
    fallbackText;
  const status = trimStr(candidate && candidate.status) || (i.code === 0 ? "succeeded" : "failed");
  const executor =
    trimStr(candidate && candidate.executor) ||
    trimStr(candidate && candidate.backend) ||
    "cursor";
  const errorClass =
    trimStr(candidate && candidate.errorClass) || (i.code === 0 ? "" : "executor_error");

  const usageDigest = buildUsageDigest({
    candidate,
    waitPayload: i.waitPayload,
    sendPayload: i.sendPayload,
    historyPayload: i.historyPayload,
  });

  return {
    runId: trimStr(i.runId),
    status,
    summary,
    artifacts,
    replyHints:
      candidate && candidate.replyHints && typeof candidate.replyHints === "object"
        ? candidate.replyHints
        : {},
    needsApproval: !!(candidate && candidate.needsApproval),
    executor,
    errorClass,
    raw: candidate,
    /** 供用量脚注在未预计算 usageDigest 时回退解析（agent.wait 本身不含 token） */
    waitPayload: i.waitPayload || null,
    sendPayload: i.sendPayload || null,
    historyPayload: i.historyPayload || null,
    usageDigest,
  };
}

function selectReplyTextFromStructuredResult(result, fallbackText) {
  const r = result || {};
  const summary = trimStr(r.summary);
  if (summary) return summary;
  const artifacts = Array.isArray(r.artifacts) ? r.artifacts : [];
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact !== "object") continue;
    if (artifact.kind === "markdown" && trimStr(artifact.text)) return trimStr(artifact.text);
    if (artifact.kind === "text" && trimStr(artifact.text)) return trimStr(artifact.text);
  }
  return trimStr(fallbackText);
}

module.exports = {
  normalizeStructuredResult,
  selectReplyTextFromStructuredResult,
};
