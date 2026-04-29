#!/usr/bin/env node
/**
 * 将 agent --output-format stream-json --stream-partial-output 的 NDJSON 流聚合成一段纯文本 stdout。
 * 行格式因 Cursor 版本可能变化：尽力从常见字段提取文本增量。
 */
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let out = "";

function pickText(obj) {
  if (obj == null) return "";
  if (typeof obj === "string") return obj;
  if (typeof obj.text === "string") return obj.text;
  if (typeof obj.delta === "string") return obj.delta;
  if (obj.delta && typeof obj.delta.text === "string") return obj.delta.text;
  if (obj.message && typeof obj.message.content === "string") return obj.message.content;
  if (obj.content && typeof obj.content === "string") return obj.content;
  if (obj.result && typeof obj.result === "string") return obj.result;
  return "";
}

rl.on("line", (line) => {
  const s = line.trim();
  if (!s) return;
  try {
    const j = JSON.parse(s);
    const t = pickText(j);
    if (t) out += t;
  } catch {
    out += s;
  }
});

rl.on("close", () => {
  process.stdout.write(out.trimEnd());
  if (out && !out.endsWith("\n")) process.stdout.write("\n");
});
