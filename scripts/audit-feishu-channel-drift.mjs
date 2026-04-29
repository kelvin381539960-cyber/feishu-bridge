#!/usr/bin/env node
/**
 * 飞书 WS 桥配置审计：/etc/feishu-ws-cursor-bot.env 与仓库内硬编码 App ID 扫描。
 * 不写密钥，仅输出 App ID 与文件路径到 stdout（JSON）。
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

function readEnvFile(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function rgList(pattern, root, globs) {
  if (!fs.existsSync(root)) return [];
  const args = ["-l", pattern, root, "--glob", globs[0]];
  for (let i = 1; i < globs.length; i++) args.push("--glob", globs[i]);
  try {
    const out = execFileSync("rg", args, {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const cursorEnvPath = "/etc/feishu-ws-cursor-bot.env";
  const ce = readEnvFile(cursorEnvPath);
  const cursorApp = ce.FEISHU_APP_ID || null;

  const idA = "cli_a9257abf1b785ed1";
  const idB = "cli_a9366e2fb4381ed3";
  const roots = ["/opt/feishu-bridge", "/opt/feishu-bridge"];
  const globs = [
    "*.js",
    "*.mjs",
    "*.json",
    "*.env*",
    "*.service",
    "*.md",
    "*.example",
  ];
  const filesWithA = new Set();
  const filesWithB = new Set();
  for (const root of roots) {
    for (const f of rgList(idA, root, globs)) filesWithA.add(f);
    for (const f of rgList(idB, root, globs)) filesWithB.add(f);
  }

  const issues = [];
  if (!cursorApp) issues.push("E1_MISSING_FEISHU_APP_ID_IN_ENV");

  const out = {
    ok: issues.length === 0,
    issues,
    feishuWsEnvPath: cursorEnvPath,
    feishuWsAppId: cursorApp,
    checks: {
      E1: { hasFeishuAppId: Boolean(cursorApp) },
      repoScan: {
        filesMentioning9257: [...filesWithA].slice(0, 20),
        filesMentioning9366: [...filesWithB].slice(0, 20),
        count9257: filesWithA.size,
        count9366: filesWithB.size,
      },
    },
  };

  console.log(JSON.stringify(out, null, 2));
}

main();
