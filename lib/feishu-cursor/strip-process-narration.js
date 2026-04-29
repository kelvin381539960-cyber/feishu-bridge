"use strict";

/**
 * 去掉模型 stdout 开头的「过程性废话」行，与 prompt-policy detectProcessNoise 语义对齐。
 */

const NOISE_LINE =
  /^\s*(正在检索|正在生成|正在整理|正在分析|处理中|loading|下面开始|接下来我将|请稍候)[:：.。…]?\s*$/i;
const SHORT_NOISE_START =
  /^(正在检索|正在生成|正在整理|正在分析|处理中|loading|下面开始|接下来我将|请稍候)/i;

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

/**
 * @param {string} text
 * @returns {string}
 */
function stripLeadingProcessNarration(text) {
  const s = String(text || "");
  if (!s) return s;
  const lines = s.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const L = lines[i];
    const t = trimStr(L);
    if (!t) {
      i += 1;
      continue;
    }
    if (NOISE_LINE.test(L) || (t.length < 140 && SHORT_NOISE_START.test(t))) {
      i += 1;
      continue;
    }
    break;
  }
  const rest = lines.slice(i).join("\n");
  const out = rest.replace(/^\s*\n+/, "");
  return out.length ? out : s;
}

module.exports = {
  stripLeadingProcessNarration,
};
