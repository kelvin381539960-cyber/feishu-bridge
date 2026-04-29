"use strict";

const fs = require("fs");
const path = require("path");

function appendJsonLine(filePath, payload) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(payload) + "\n");
}

function createTelemetry(input) {
  const i = input || {};
  const logger = i.logger || console;
  const filePath = String(i.filePath || "").trim();

  function emit(event, payload) {
    const row = {
      ts: Date.now(),
      event: String(event || "unknown"),
      ...((payload && typeof payload === "object") ? payload : {}),
    };
    logger.log("[feishu-telemetry]", JSON.stringify(row));
    if (filePath) appendJsonLine(filePath, row);
  }

  return {
    emit,
  };
}

module.exports = {
  createTelemetry,
};
