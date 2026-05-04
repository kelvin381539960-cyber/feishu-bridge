"use strict";

const ALLOWED_SCOPES = Object.freeze(["user", "project", "workflow", "session", "negative"]);
const ALLOWED_SOURCES = Object.freeze(["explicit", "implicit", "system"]);

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function stableMemoryId(record) {
  const raw = [record.scope, record.subject, record.key, record.value].join("|");
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return `mem_${Math.abs(hash).toString(36)}`;
}

function asNonEmptyString(value, fallback) {
  const s = typeof value === "string" ? value.trim() : "";
  return s || fallback;
}

function createMemoryRecord(input) {
  const seed = input || {};
  const scope = ALLOWED_SCOPES.includes(seed.scope) ? seed.scope : "session";
  const source = ALLOWED_SOURCES.includes(seed.source) ? seed.source : "implicit";
  const record = {
    id: asNonEmptyString(seed.id, ""),
    scope,
    subject: asNonEmptyString(seed.subject, "general"),
    key: asNonEmptyString(seed.key, "note"),
    value: asNonEmptyString(seed.value, ""),
    confidence: clampConfidence(seed.confidence),
    source,
    updatedAt: asNonEmptyString(seed.updatedAt, new Date().toISOString()),
  };
  record.id = record.id || stableMemoryId(record);
  validateMemoryRecord(record);
  return record;
}

function validateMemoryRecord(record) {
  if (!record || typeof record !== "object") throw new Error("memory record must be object");
  for (const key of ["id", "scope", "subject", "key", "value", "source", "updatedAt"]) {
    if (typeof record[key] !== "string" || !record[key].trim()) throw new Error(`${key} must be non-empty string`);
  }
  if (!ALLOWED_SCOPES.includes(record.scope)) throw new Error(`scope must be one of ${ALLOWED_SCOPES.join(",")}`);
  if (!ALLOWED_SOURCES.includes(record.source)) throw new Error(`source must be one of ${ALLOWED_SOURCES.join(",")}`);
  if (typeof record.confidence !== "number" || record.confidence < 0 || record.confidence > 1) {
    throw new Error("confidence must be number between 0 and 1");
  }
  return true;
}

module.exports = {
  ALLOWED_SCOPES,
  ALLOWED_SOURCES,
  createMemoryRecord,
  validateMemoryRecord,
};
