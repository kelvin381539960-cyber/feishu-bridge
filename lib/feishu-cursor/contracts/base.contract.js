"use strict";

/**
 * Base contract（任务契约层共用结构）
 * 所有 specialized / fallback contract 必须保持字段同形（contracts/index.js 与 verify-workflow-gates.py 据此校验）。
 */

const baseContract = Object.freeze({
  taskType: "base",
  description:
    "所有 workflow contract 共用的结构骨架；不直接对外提供 workflow，仅供其他 contract 继承字段同形。",
  requiredInputs: Object.freeze(["userRequest", "taskType"]),
  optionalInputs: Object.freeze([]),
  clarificationPolicy: Object.freeze({
    required: false,
    when: Object.freeze([]),
    maxQuestions: 0,
    allowAssumption: true,
  }),
  contextRequirements: Object.freeze({
    requiredPacks: Object.freeze([]),
    optionalPacks: Object.freeze([]),
    forbiddenPacks: Object.freeze([]),
  }),
  outputRequirements: Object.freeze({
    format: "",
    mustInclude: Object.freeze([]),
    mustNotInclude: Object.freeze([]),
  }),
  gateRequired: false,
  stateRequired: false,
  forbiddenActions: Object.freeze([]),
  handoffTarget: "",
});

module.exports = baseContract;
