#!/usr/bin/env node
"use strict";

const {
  DEFAULT_WHITEBOARD_ID,
  writeSwimlaneToWhiteboard,
} = require("../lib/feishu-whiteboard-write");

function printUsage() {
  console.error(
    "usage: node scripts/feishu-whiteboard-write-final.js <whiteboardId> <oauthCode> [redirectUri] [--dry-run]"
  );
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const filtered = args.filter((arg) => arg !== "--dry-run");

  const whiteboardId = filtered[0] || DEFAULT_WHITEBOARD_ID;
  const oauthCode = filtered[1] || "";
  const redirectUri = filtered[2] || "";

  if (!whiteboardId || (!dryRun && !oauthCode)) {
    printUsage();
    process.exit(2);
  }

  const result = await writeSwimlaneToWhiteboard({
    whiteboardId,
    oauthCode,
    redirectUri,
    dryRun,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
