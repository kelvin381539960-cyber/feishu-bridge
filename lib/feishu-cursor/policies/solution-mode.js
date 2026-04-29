"use strict";

/**
 * Solution workflow mode（与 docs/cursor-architecture/multi-agent/solution.md 一致）
 * 优先级：feasibility > roadmap > release > growth > plan
 */

const ORDERED = Object.freeze([
  [
    "feasibility",
    /可行性(?:评估|分析|判断|论证)?|feasibility|(?:做不做|要不要|该不该)(?:做|上|这个)?|值不值得/i,
  ],
  ["roadmap", /路线图|roadmap|多季度|中长期|年度规划|几年规划/i],
  [
    "release",
    /灰度(?:发布|上线|方案)?|发布计划|release\s*plan|上线计划|rollout|canary|分阶段(?:发布|上线)|渐进式发布|发版计划|上线方案|发布方案/i,
  ],
  ["growth", /增长方案|growth\s*plan|增长策略|实验设计|A\s*\/\s*B|渠道增长|拉新|转化漏斗/i],
  ["plan", /执行计划|里程碑|阶段计划|sprint|落地计划|方案设计|阶段划分/i],
]);

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

/**
 * @param {string} text
 * @returns {"feasibility"|"roadmap"|"release"|"growth"|"plan"}
 */
function resolveSolutionMode(text) {
  const s = trimStr(text);
  if (!s) return "plan";
  for (const [mode, re] of ORDERED) {
    if (re.test(s)) return mode;
  }
  return "plan";
}

module.exports = {
  resolveSolutionMode,
  ORDERED,
};
