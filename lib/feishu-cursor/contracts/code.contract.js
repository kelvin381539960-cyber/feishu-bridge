"use strict";

/**
 * Code workflow contract
 * 涵盖编码、排障、报错、命令、部署、日志、配置、安装、删除、环境类请求。
 * 默认 mode=inspect；execute 必须显式授权（authorization_status=authorized）。
 * 对应 Gate：scripts/code-gate.py。
 */

const ALLOWED_MODES = Object.freeze(["inspect", "execute"]);
const ALLOWED_OPERATIONS = Object.freeze([
  "inspect",
  "read",
  "analyze",
  "edit",
  "write",
  "install",
  "restart",
  "deploy",
  "delete",
]);
const ALLOWED_AUTHORIZATION_STATUSES = Object.freeze([
  "authorized",
  "not_required",
  "not_provided",
  "unknown",
]);

const codeContract = Object.freeze({
  taskType: "code",
  workflowType: "code",
  description:
    "用于编码、排障、命令、部署、配置、日志、运维、环境类请求；默认 inspect，execute 必须显式授权。",
  allowedModes: ALLOWED_MODES,
  allowedOperations: ALLOWED_OPERATIONS,
  allowedAuthorizationStatuses: ALLOWED_AUTHORIZATION_STATUSES,

  requiredInputs: Object.freeze([
    "userRequest",
    "taskType",
    "mode",
    "declaredAction",
  ]),
  optionalInputs: Object.freeze([
    "targetFiles",
    "allowedOperations",
    "authorizationStatus",
    "dangerousOperation",
  ]),

  clarificationPolicy: Object.freeze({
    required: false,
    when: Object.freeze([
      "目标文件/服务/范围不明",
      "execute 但未提供授权",
      "高风险动作但未指明回滚",
    ]),
    maxQuestions: 3,
    allowAssumption: false,
  }),

  contextRequirements: Object.freeze({
    requiredPacks: Object.freeze(["baseRules", "codeWorkflowRules"]),
    optionalPacks: Object.freeze([
      "referenceDocs",
      "targetFileSnapshots",
      "previousInspectResult",
    ]),
    forbiddenPacks: Object.freeze(["prdOnlyState", "researchOnlyState"]),
  }),

  outputRequirements: Object.freeze({
    format: "structuredMarkdown",

    inspectMustInclude: Object.freeze([
      "target",
      "judgement",
      "evidence",
      "next_action",
      "execution_status=not_executed",
    ]),
    inspectMustNotInclude: Object.freeze([
      "已修改",
      "已写入",
      "已安装",
      "已重启",
      "已部署",
      "已创建",
      "已验证通过",
    ]),

    executeMustInclude: Object.freeze([
      "change_target",
      "operation_detail",
      "authorization_status=authorized",
      "risk",
      "validation",
      "rollback",
      "result_summary",
    ]),
    executeMustNotInclude: Object.freeze([
      "无授权即声称已执行",
      "无验证即声称已修复",
      "无回滚方案即执行高危操作",
    ]),
  }),

  gateRequired: true,
  stateRequired: false,
  forbiddenActions: Object.freeze([
    "inspect 模式下不得声称已执行任何变更",
    "execute 未授权不得动手",
    "不得在输出中泄露密钥/Token/凭据",
    "不得绕过 runtimeRunTrace 中的 Risk Checker / Verifier",
  ]),
  handoffTarget: "codeWorkflow",
});

module.exports = codeContract;
