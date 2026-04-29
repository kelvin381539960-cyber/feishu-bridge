"use strict";

/**
 * PRD workflow contract
 * 用于 PRD 编写、PRD 改写、需求分析、产品方案、页面规则、交互规则等任务。
 * 与 .cursor/rules/prd-workflow.mdc 与 scripts/verify-prd-gates.py 共同构成 PRD workflow。
 */

const prdContract = Object.freeze({
  taskType: "prd",
  description:
    "用于 PRD、产品方案、需求分析、交互规则、页面规则类任务。",
  requiredInputs: Object.freeze(["userRequest", "taskType"]),
  optionalInputs: Object.freeze([
    "existingPrd",
    "businessRules",
    "pageCopy",
    "reviewComments",
    "stateFile",
    "referenceDocs",
  ]),
  clarificationPolicy: Object.freeze({
    required: true,
    when: Object.freeze([
      "需求目标不明确",
      "业务规则存在冲突",
      "页面范围不明确",
      "涉及上线范围但缺少边界",
      "用户明确要求先澄清",
    ]),
    maxQuestions: 5,
    allowAssumption: false,
  }),
  contextRequirements: Object.freeze({
    requiredPacks: Object.freeze(["baseRules", "prdWorkflowRules", "taskState"]),
    optionalPacks: Object.freeze(["referenceDocs", "historyOutputs", "reviewNotes"]),
    forbiddenPacks: Object.freeze(["researchOnlyState"]),
  }),
  outputRequirements: Object.freeze({
    format: "structuredMarkdown",
    mustInclude: Object.freeze([
      "需求背景",
      "目标",
      "范围",
      "规则说明",
      "异常场景",
      "验收标准",
    ]),
    mustNotInclude: Object.freeze([
      "未确认的技术实现承诺",
      "超出用户要求的扩展",
    ]),
  }),
  gateRequired: true,
  stateRequired: true,
  forbiddenActions: Object.freeze([
    "不得直接进入研发实现",
    "不得跳过 Brief / Outline / Review 闭环",
    "不得改 PRD workflow 主链路",
  ]),
  handoffTarget: "prdWorkflow",
});

module.exports = prdContract;
