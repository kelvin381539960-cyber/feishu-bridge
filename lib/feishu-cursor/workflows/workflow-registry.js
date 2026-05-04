"use strict";

/**
 * workflow-registry
 *
 * 仓库执行主体唯一允许的 5 类 workflow 入口：prd / research / code / solution / general。
 * 作为 pipeline / classifier / gate / context 的单一 workflow 配置来源；不承载业务执行。
 */

const {
  CONTRACTS,
  FINAL_WORKFLOWS,
} = require("../contracts");
const { researchWorkflowPlugin } = require("./research-workflow");

const WORKFLOW_REGISTRY = Object.freeze({
  prd: Object.freeze({
    taskType: "prd",
    workflow: "prd",
    role: "specialized",
    allowedModes: Object.freeze([]),
    contract: CONTRACTS.prd,
    gate: "prd",
    expectedOutputKind: "structured_prd",
    multiAgentPolicy: "conditional",
    executionGraphKey: "prd_graph",
  }),

  research: Object.freeze({
    taskType: "research",
    workflow: "research",
    role: "specialized",
    allowedModes: Object.freeze([]),
    contract: CONTRACTS.research,
    gate: "research",
    expectedOutputKind: "structured_research",
    multiAgentPolicy: "conditional",
    executionGraphKey: "research_graph",
  }),

  code: Object.freeze({
    taskType: "code",
    workflow: "code",
    role: "specialized",
    allowedModes: Object.freeze(["inspect", "execute"]),
    contract: CONTRACTS.code,
    gate: "code",
    expectedOutputKind: "structured_code",
    multiAgentPolicy: "conditional",
    executionGraphKey: "code_graph",
  }),

  solution: Object.freeze({
    taskType: "solution",
    workflow: "solution",
    role: "specialized",
    allowedModes: Object.freeze([
      "feasibility",
      "roadmap",
      "plan",
      "release",
      "growth",
    ]),
    contract: CONTRACTS.solution,
    gate: "solution",
    expectedOutputKind: "structured_solution",
    multiAgentPolicy: "conditional",
    executionGraphKey: "solution_graph",
  }),

  general: Object.freeze({
    taskType: "general",
    workflow: "general",
    role: "fallback",
    allowedModes: Object.freeze([]),
    contract: CONTRACTS.general,
    gate: "general",
    expectedOutputKind: "feishu_reply",
    multiAgentPolicy: "single",
    executionGraphKey: "general_graph",
  }),
});

const SPECIALIZED_WORKFLOWS = Object.freeze(
  FINAL_WORKFLOWS.filter((k) => k !== "general")
);

function listWorkflowTypes() {
  return FINAL_WORKFLOWS.slice();
}

function listSpecializedWorkflowTypes() {
  return SPECIALIZED_WORKFLOWS.slice();
}

function getFallbackWorkflow() {
  return WORKFLOW_REGISTRY.general;
}

function getWorkflowByTaskType(taskType) {
  if (typeof taskType !== "string" || !taskType) {
    return WORKFLOW_REGISTRY.general;
  }
  return WORKFLOW_REGISTRY[taskType] || WORKFLOW_REGISTRY.general;
}

function requireWorkflowByTaskType(taskType) {
  const entry = WORKFLOW_REGISTRY[taskType];
  if (!entry) {
    throw new Error(`Unsupported workflow taskType: ${taskType}`);
  }
  return entry;
}

function freezePluginEntry(entry) {
  const e = entry || {};
  if (!e.id || typeof e.id !== "string") {
    throw new Error("workflow plugin entry requires string id");
  }
  if (!e.plugin || typeof e.plugin.match !== "function" || typeof e.plugin.run !== "function") {
    throw new Error(`workflow plugin ${e.id} requires match(ctx) and run(ctx)`);
  }
  if (!Number.isInteger(e.priority)) {
    throw new Error(`workflow plugin ${e.id} requires integer priority`);
  }
  if (!Number.isInteger(e.order)) {
    throw new Error(`workflow plugin ${e.id} requires integer order`);
  }
  return Object.freeze({
    id: e.id,
    workflow: e.workflow || e.id,
    priority: e.priority,
    order: e.order,
    plugin: e.plugin,
  });
}

function comparePluginEntries(a, b) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.order - b.order;
}

const WORKFLOW_PLUGIN_ENTRIES = Object.freeze([
  freezePluginEntry({
    id: "research-execute-dispatch",
    workflow: "research",
    priority: 100,
    order: 0,
    plugin: researchWorkflowPlugin,
  }),
].sort(comparePluginEntries));

const WORKFLOW_PLUGINS = Object.freeze(
  WORKFLOW_PLUGIN_ENTRIES.map((entry) => entry.plugin)
);

function listWorkflowPluginEntries() {
  return WORKFLOW_PLUGIN_ENTRIES.slice();
}

function selectWorkflowPlugin(ctx) {
  for (const entry of WORKFLOW_PLUGIN_ENTRIES) {
    if (entry.plugin.match(ctx)) return entry.plugin;
  }
  return null;
}

module.exports = {
  WORKFLOW_REGISTRY,
  FINAL_WORKFLOWS,
  SPECIALIZED_WORKFLOWS,
  getWorkflowByTaskType,
  requireWorkflowByTaskType,
  listWorkflowTypes,
  listSpecializedWorkflowTypes,
  getFallbackWorkflow,
  WORKFLOW_PLUGIN_ENTRIES,
  WORKFLOW_PLUGINS,
  listWorkflowPluginEntries,
  selectWorkflowPlugin,
};
