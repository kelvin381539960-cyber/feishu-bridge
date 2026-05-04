"use strict";

const { validateMemoryRecord } = require("./memory-record");

function partitionRecords(records) {
  const safeRecords = Array.isArray(records) ? records : [];
  return {
    negative: safeRecords.filter((record) => record.scope === "negative"),
    positive: safeRecords.filter((record) => record.scope !== "negative"),
  };
}

function createMemoryPack(input) {
  const seed = input || {};
  const records = Array.isArray(seed.records) ? seed.records : [];
  for (const record of records) validateMemoryRecord(record);

  const partitions = seed.partitions || partitionRecords(records);
  const pack = {
    injected: records.length > 0,
    records,
    partitions: {
      negative: Array.isArray(partitions.negative) ? partitions.negative : [],
      positive: Array.isArray(partitions.positive) ? partitions.positive : [],
    },
    tokenEstimate: Math.max(0, Number(seed.tokenEstimate || 0)),
    omitted: Array.isArray(seed.omitted) ? seed.omitted : [],
    budget: seed.budget || null,
  };
  validateMemoryPack(pack);
  return pack;
}

function validateMemoryPack(pack) {
  if (!pack || typeof pack !== "object") throw new Error("memory pack must be object");
  if (typeof pack.injected !== "boolean") throw new Error("memory pack injected must be boolean");
  if (!Array.isArray(pack.records)) throw new Error("memory pack records must be array");
  if (!pack.partitions || typeof pack.partitions !== "object") throw new Error("memory pack partitions required");
  if (!Array.isArray(pack.partitions.negative)) throw new Error("memory pack negative partition must be array");
  if (!Array.isArray(pack.partitions.positive)) throw new Error("memory pack positive partition must be array");
  if (!Number.isFinite(pack.tokenEstimate) || pack.tokenEstimate < 0) throw new Error("memory pack tokenEstimate must be non-negative number");
  if (!Array.isArray(pack.omitted)) throw new Error("memory pack omitted must be array");
  for (const record of pack.records) validateMemoryRecord(record);
  for (const record of pack.partitions.negative) validateMemoryRecord(record);
  for (const record of pack.partitions.positive) validateMemoryRecord(record);
  if (pack.partitions.negative.some((record) => record.scope !== "negative")) throw new Error("negative partition may only contain negative records");
  if (pack.partitions.positive.some((record) => record.scope === "negative")) throw new Error("positive partition may not contain negative records");
  return true;
}

module.exports = {
  createMemoryPack,
  validateMemoryPack,
  partitionRecords,
};
