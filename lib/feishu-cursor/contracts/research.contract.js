"use strict";

/**
 * Research workflow contract（specialized）
 *
 * 注意：xlsx sheet 41 的备注「fallback only / 历史兼容」与 sheet 47/99 矛盾——以 47/99 为准。
 * Research 是与 PRD/Code/Solution 同级的 specialized workflow，不是 fallback。
 *
 * 用于调研、竞品分析、资料整理、方案对比、行业判断类任务。
 */

const researchContract = Object.freeze({
  taskType: "research",
  description:
    "用于调研、竞品分析、资料整理、方案对比、行业判断类任务。",
  requiredInputs: Object.freeze(["userRequest", "taskType"]),
  optionalInputs: Object.freeze([
    "researchScope",
    "targetAudience",
    "referenceDocs",
    "sourceRequirements",
    "exportRequirement",
  ]),
  clarificationPolicy: Object.freeze({
    required: true,
    when: Object.freeze([
      "调研目标不明确",
      "调研对象不明确",
      "输出用途不明确",
      "用户要求先澄清再调研",
      "需要区分内部资料和公开资料",
    ]),
    maxQuestions: 4,
    allowAssumption: true,
  }),
  contextRequirements: Object.freeze({
    requiredPacks: Object.freeze(["baseRules", "researchWorkflowRules"]),
    optionalPacks: Object.freeze(["referenceDocs", "historyOutputs", "sourceNotes"]),
    forbiddenPacks: Object.freeze(["prdOnlyState"]),
  }),
  outputRequirements: Object.freeze({
    format: "structuredMarkdown",
    mustInclude: Object.freeze([
      "澄清假设",
      "结论",
      "关键发现",
      "依据说明",
      "建议方案",
      "不确定性说明",
    ]),
    mustNotInclude: Object.freeze([
      "无来源的确定性结论",
      "只罗列资料不下判断",
      "把假设包装成事实",
    ]),
  }),
  gateRequired: true,
  stateRequired: true,
  forbiddenActions: Object.freeze([
    "不得新增 Research Agent",
    "不得重构 research-workflow-runner.js 主链路",
    "不得改飞书入口",
    "不得改 docx 导出主逻辑",
    "不得要求所有调研都必须联网",
    "不得跳过 Research Gate",
  ]),
  handoffTarget: "researchWorkflow",
});

module.exports = researchContract;
