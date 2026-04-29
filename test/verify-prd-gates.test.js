"use strict";

const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const python = process.env.PYTHON ?? "python3";

test("verify-prd-gates.py exits 0", () => {
  const r = spawnSync(python, ["scripts/verify-prd-gates.py"], {
    cwd: root,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`verify-prd-gates failed: ${r.stderr || r.stdout}`);
  }
});

test("verify-prd-brief-gate.py shim exits 0", () => {
  const r = spawnSync(python, ["scripts/verify-prd-brief-gate.py"], {
    cwd: root,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`verify-prd-brief-gate shim failed: ${r.stderr || r.stdout}`);
  }
});
