"use strict";

const fs = require("fs");
const path = require("path");

function createNoopStateStore() {
  return {
    load() {
      return null;
    },
    save() {},
  };
}

function createFileStateStore(filePath) {
  const target = String(filePath || "").trim();
  if (!target) return createNoopStateStore();
  return {
    load() {
      try {
        if (!fs.existsSync(target)) return null;
        const raw = fs.readFileSync(target, "utf8").trim();
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (err) {
        console.error("[feishu-state] load failed:", err && err.message);
        return null;
      }
    },
    save(payload) {
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, JSON.stringify(payload, null, 2));
      } catch (err) {
        console.error("[feishu-state] save failed:", err && err.message);
      }
    },
  };
}

module.exports = {
  createNoopStateStore,
  createFileStateStore,
};
