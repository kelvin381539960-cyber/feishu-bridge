"use strict";

/**
 * Solution workflow contract
 * 用于方案设计；mode 仅允许：feasibility / roadmap / plan / release / growth。
 * 对应 Gate：scripts/solution-gate.py。
 */

const ALLOWED_MODES = Object.freeze([
  "feasibility",
  "roadmap",
  "plan",
  "release",
  "growth",
]);

const ALLOWED_TASK_SIZES = Object.freeze(["S", "M", "L", "XL"]);

const COMMON_OUTPUT_FIELDS = Object.freeze([
  "conclusion",
  "goal",
  "key_judgement",
  "solution_design",
  "execution_path",
  "risk_response",
  "metrics_acceptance",
  "next_action",
]);

const MODE_REQUIRED_FIELDS = Object.freeze({
  feasibility: Object.freeze(["recommendation", "benefit", "cost", "dependency"]),
  roadmap: Object.freeze(["phase", "timeline", "milestone", "priority", "deliverable"]),
  plan: Object.freeze(["scope", "steps", "decision_criteria"]),
  release: Object.freeze([
    "release_scope",
    "release_cadence",
    "rollback",
    "notice",
  ]),
  growth: Object.freeze([
    "audience",
    "channel",
    "conversion_path",
    "growth_action",
  ]),
});

const solutionContract = Object.freeze({
  taskType: "solution",
  workflowType: "solution",
  description:
    "用于方案设计、可行性判断、路线图、执行计划、发布计划、增长方案；mode 仅允许 5 类。",
  allowedModes: ALLOWED_MODES,
  allowedTaskSizes: ALLOWED_TASK_SIZES,

  requiredInputs: Object.freeze(["userRequest", "taskType", "mode", "taskSize"]),
  optionalInputs: Object.freeze([
    "solutionScope",
    "constraints",
    "stakeholders",
    "referenceDocs",
  ]),

  clarificationPolicy: Object.freeze({
    required: false,
    when: Object.freeze([
      "方案模式不明确（feasibility/roadmap/plan/release/growth）",
      "任务规模不明（S/M/L/XL）",
      "约束/边界缺失",
    ]),
    maxQuestions: 3,
    allowAssumption: true,
  }),

  contextRequirements: Object.freeze({
    requiredPacks: Object.freeze(["baseRules", "solutionWorkflowRules"]),
    optionalPacks: Object.freeze([
      "referenceDocs",
      "historyOutputs",
      "stakeholderNotes",
    ]),
    forbiddenPacks: Object.freeze(["prdOnlyState", "researchOnlyState"]),
  }),

  outputRequirements: Object.freeze({
    format: "structuredMarkdown",
    mustInclude: COMMON_OUTPUT_FIELDS,
    mustNotInclude: Object.freeze([
      "只写原则不给行动",
      "无验收口径的方案",
      "无风险与应对的方案",
    ]),
    modeRequiredFields: MODE_REQUIRED_FIELDS,
  }),

  reviewerPolicy: Object.freeze({
    requireExecutionReviewer: Object.freeze(["L", "XL"]),
    requireRiskReviewer: Object.freeze(["XL"]),
  }),

  gateRequired: true,
  stateRequired: false,
  forbiddenActions: Object.freeze([
    "不得使用 5 类以外的 mode",
    "不得跳过 L/XL 的 Reviewer 留痕",
    "不得越界写代码、写 PRD 细节",
  ]),
  handoffTarget: "solutionWorkflow",
});

module.exports = solutionContract;
