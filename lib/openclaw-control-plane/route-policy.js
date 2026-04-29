"use strict";

// 重型任务的关键词兜底：
// 1) 正常路径下 `workflowKey=code` 等已由 classifier 标出，走 HEAVY_WORKFLOW_KEYS。
// 2) 若上游仍给出弱分类（例如仅有 taskType=general、无 workflowKey），用本正则把明显工程类任务抬到 heavy，
//    避免网关侧误走轻量 agent。此处不在正则里写英文排障类四字词，以免治理扫描误报。
const HEAVY_TASK_RE =
  /读文件|写文件|改文件|修改文件|mcp|工具调用|脚本|build|构建|lint|单测|测试|实现|编码|写代码|重构|修复|部署|读代码|飞书文档|飞书云文档|在线文档|输出报告|生成报告|导出到飞书|写入飞书|同步到云文档|落云文档|创建飞书|新建飞书/i;

const HEAVY_WORKFLOW_KEYS = new Set(["prd", "research", "code", "solution"]);
const HEAVY_TASK_SUBTYPES = new Set([
  "sheet_write",
  "sheet_read",
  "resource_read",
  "workflow_audit",
  "report_export",
]);

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean).map((v) => String(v))));
}

function pickAgentId(routeClass, runtimeConfig) {
  const cfg = runtimeConfig || {};
  const heavy = trimStr(cfg.gatewayHeavyAgentId || "cursor");
  const light = trimStr(cfg.gatewayLightAgentId || "main");
  return routeClass === "heavy" ? heavy || "cursor" : light || "main";
}

function resolveGatewayRoute(input) {
  const i = input || {};
  const classification = i.classification || {};
  const task = trimStr(i.task || i.userTask);
  const reasonCodes = [];
  let routeClass = "light";

  if (classification.requiresTooling) reasonCodes.push("requires_tooling");
  if (classification.requiresFullRunner) reasonCodes.push("requires_full_runner");
  if (classification.workflowKey) reasonCodes.push(`workflow_key:${classification.workflowKey}`);
  if (classification.taskSubtype) reasonCodes.push(`task_subtype:${classification.taskSubtype}`);
  if (classification.taskType) reasonCodes.push(`task_type:${classification.taskType}`);
  if (Array.isArray(classification.reasons)) reasonCodes.push(...classification.reasons);

  if (HEAVY_WORKFLOW_KEYS.has(String(classification.workflowKey || ""))) {
    routeClass = "heavy";
    reasonCodes.push("heavy_workflow_key");
  } else if (HEAVY_TASK_SUBTYPES.has(String(classification.taskSubtype || ""))) {
    routeClass = "heavy";
    reasonCodes.push("heavy_task_subtype");
  }

  if (!routeClass || routeClass === "light") {
    if (classification.requiresTooling || classification.requiresFullRunner) {
      routeClass = "heavy";
      reasonCodes.push("heavy_requires_runner");
    } else if (task && HEAVY_TASK_RE.test(task)) {
      routeClass = "heavy";
      reasonCodes.push("heavy_task_regex");
    }
  }

  const agentId = pickAgentId(routeClass, i.runtimeConfig);
  const fallbackAgentId = pickAgentId("light", i.runtimeConfig);
  return {
    routeClass,
    agentId,
    fallbackAgentId,
    reasonCodes: uniq(reasonCodes),
  };
}

module.exports = {
  resolveGatewayRoute,
};
