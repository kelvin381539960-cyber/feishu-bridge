"use strict";

/**
 * General workflow contract（fallback only）
 * 只处理未命中 specialized workflow 的普通问答、轻量解释、简单判断、文案优化、未知请求。
 * 不抢占 prd / research / code / solution。
 */

const generalContract = Object.freeze({
  taskType: "general",
  role: "fallback",
  externalName: "General Agent / General workflow",
  description:
    "General Agent 是兜底处理器，不是 specialized workflow 替代品；不得抢占 specialized workflow。",

  requiredInputs: Object.freeze([
    "userRequest",
    "taskType",
    "role",
    "fallbackReason",
  ]),
  optionalInputs: Object.freeze(["referenceDocs", "conversationContext"]),

  clarificationPolicy: Object.freeze({
    required: false,
    when: Object.freeze([
      "请求过短无法判断意图",
      "用户主动要求先澄清",
    ]),
    maxQuestions: 1,
    allowAssumption: true,
  }),

  contextRequirements: Object.freeze({
    requiredPacks: Object.freeze(["base", "general", "light_policy"]),
    optionalPacks: Object.freeze(["referenceDocs", "conversationContext"]),
    forbiddenPacks: Object.freeze([
      "fullPrdWorkflow",
      "fullResearchWorkflow",
      "fullCodeWorkflow",
      "fullSolutionWorkflow",
    ]),
  }),

  outputRequirements: Object.freeze({
    format: "feishuReply",
    mustInclude: Object.freeze(["直接回答", "必要说明"]),
    mustNotInclude: Object.freeze([
      "完整 PRD",
      "完整调研报告",
      "完整方案设计",
      "完整 Code execute 记录",
    ]),
  }),

  gateRequired: false,
  stateRequired: false,
  forbiddenActions: Object.freeze([
    "不得抢占 specialized workflow（prd/research/code/solution）",
    "不得伪装成 specialized 输出（不得自称 PRD / 调研报告 / 方案 / 已执行变更）",
  ]),
  handoffTarget: "",
});

module.exports = generalContract;
