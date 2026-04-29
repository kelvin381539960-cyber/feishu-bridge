"use strict";

/**
 * workflow-execution-policy
 *
 * Intake 之后、执行之前：根据 classification + 任务文本决定 taskSize、
 * multiAgentRequired、agentsPlanned、skippedAgents、decisionReason。
 * 不修改 classification；不新增 workflow 类型。
 */

const { SPECIALIZED_WORKFLOWS } = require("../feishu-cursor/workflows/workflow-registry");

const RESEARCH_MULTI_TRIGGERS_RE =
  /竞品|市场|行业|对比分析|调研报告|正式报告|生产落地/i;
const RESEARCH_XL_DECISION_RE =
  /正式报告|调研报告|面向决策|决策依据|业务决策|产品决策/i;

const URL_RE = /https?:\/\/[^\s)]+/gi;

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function countUrls(text) {
  const m = String(text || "").match(URL_RE);
  return m ? m.length : 0;
}

function computeTaskSize(planTask, qaContext) {
  const t = trimStr(planTask);
  const qa = trimStr(qaContext);
  const urlN = countUrls(t);
  const strong = RESEARCH_MULTI_TRIGGERS_RE.test(t) || RESEARCH_XL_DECISION_RE.test(t);

  if (RESEARCH_XL_DECISION_RE.test(t) || qa.length >= 500) return "XL";
  if (t.length > 120 || urlN >= 2 || strong) return "L";
  if (t.length >= 30 || urlN >= 1) return "M";
  return "S";
}

const RESEARCH_AGENT_CRAWLER = "Researcher_Crawler";
const RESEARCH_AGENT_ANALYST = "Researcher_Analyst";

function researchSkippedBoth(reason) {
  return [
    {
      agentRole: RESEARCH_AGENT_CRAWLER,
      skipReason: reason,
      fallbackAgent: "",
      fallbackReason: "",
    },
    {
      agentRole: RESEARCH_AGENT_ANALYST,
      skipReason: reason,
      fallbackAgent: "",
      fallbackReason: "",
    },
  ];
}

function resolveResearchPolicy(input) {
  const planTask = trimStr(input.planTask);
  const qaContext = trimStr(input.qaContext);
  const stage = trimStr(input.promptStage);
  const taskSize = computeTaskSize(planTask, qaContext);
  const urlN = countUrls(planTask);

  if (stage === "clarify") {
    return {
      workflow: "research",
      taskType: "research",
      taskSize,
      multiAgentRequired: false,
      agentsPlanned: [],
      mustRunAgents: [],
      skippedAgents: researchSkippedBoth("research_clarify_stage_only"),
      skipReason: "research_clarify_stage_only",
      decisionReason: "research_clarify_stage|no_parallel_gather",
      reasonCodes: ["execution_policy_research_clarify"],
      forcedRuntimeV2: false,
    };
  }

  const triggersMulti =
    RESEARCH_MULTI_TRIGGERS_RE.test(planTask) ||
    taskSize === "L" ||
    taskSize === "XL" ||
    qaContext.length >= 500 ||
    urlN >= 2;

  const allowsSingle =
    !triggersMulti && (taskSize === "S" || taskSize === "M");

  if (triggersMulti) {
    return {
      workflow: "research",
      taskType: "research",
      taskSize,
      multiAgentRequired: true,
      agentsPlanned: [RESEARCH_AGENT_CRAWLER, RESEARCH_AGENT_ANALYST],
      mustRunAgents: [RESEARCH_AGENT_CRAWLER, RESEARCH_AGENT_ANALYST],
      skippedAgents: [],
      skipReason: "",
      decisionReason: `research_multi_required|taskSize=${taskSize}|urls=${urlN}|qaLen=${qaContext.length}`,
      reasonCodes: ["execution_policy_research_multi"],
      forcedRuntimeV2: false,
    };
  }

  if (allowsSingle) {
    return {
      workflow: "research",
      taskType: "research",
      taskSize,
      multiAgentRequired: false,
      agentsPlanned: [RESEARCH_AGENT_CRAWLER, RESEARCH_AGENT_ANALYST],
      mustRunAgents: [],
      skippedAgents: researchSkippedBoth("single_agent_focused_scope"),
      skipReason: "single_agent_focused_scope",
      decisionReason: "research_focused_scope_size_s_or_m",
      reasonCodes: ["execution_policy_research_solo"],
      forcedRuntimeV2: false,
    };
  }

  return {
    workflow: "research",
    taskType: "research",
    taskSize,
    multiAgentRequired: true,
    agentsPlanned: [RESEARCH_AGENT_CRAWLER, RESEARCH_AGENT_ANALYST],
    mustRunAgents: [RESEARCH_AGENT_CRAWLER, RESEARCH_AGENT_ANALYST],
    skippedAgents: [],
    skipReason: "",
    decisionReason: `research_multi_required_fallback|taskSize=${taskSize}`,
    reasonCodes: ["execution_policy_research_multi_fallback"],
    forcedRuntimeV2: false,
  };
}

function pendingMultiAgentPolicy(workflow) {
  const w = trimStr(workflow) || "general";
  const role = `${w}_MultiAgentGraph`;
  return {
    workflow: w,
    taskType: w,
    taskSize: "M",
    multiAgentRequired: false,
    agentsPlanned: [],
    mustRunAgents: [],
    skippedAgents: [
      {
        agentRole: role,
        skipReason: "multi_agent_runner_not_implemented_pending_phase2",
        fallbackAgent: "",
        fallbackReason: "",
      },
    ],
    skipReason: "multi_agent_runner_not_implemented_pending_phase2",
    decisionReason: `multi_agent_runtime_pending_${w}`,
    reasonCodes: ["execution_policy_phase2_pending"],
    forcedRuntimeV2: false,
  };
}

/**
 * @param {{
 *   classification: object,
 *   planTask?: string,
 *   qaContext?: string,
 *   promptStage?: string,
 *   workflowEntry?: object,
 * }} input
 */
function resolveWorkflowExecutionPolicy(input) {
  const i = input || {};
  const classification = i.classification || {};
  const taskType = trimStr(classification.taskType) || "general";
  const role = trimStr(classification.role);
  const wfKey = trimStr(classification.workflowKey) || taskType;
  if (role !== "specialized" || !SPECIALIZED_WORKFLOWS.includes(taskType)) {
    return {
      workflow: wfKey,
      taskType,
      taskSize: "S",
      multiAgentRequired: false,
      agentsPlanned: [],
      mustRunAgents: [],
      skippedAgents: [],
      skipReason: "not_specialized_workflow",
      decisionReason: "execution_policy_skipped|not_specialized",
      reasonCodes: ["execution_policy_not_specialized"],
      forcedRuntimeV2: false,
    };
  }

  const planTask = trimStr(i.planTask);
  const qaContext =
    i.qaContext != null && String(i.qaContext).trim()
      ? String(i.qaContext).trim()
      : trimStr(classification.qaContext);
  const promptStage = trimStr(i.promptStage);

  if (taskType === "research") {
    return resolveResearchPolicy({
      planTask,
      qaContext,
      promptStage,
    });
  }

  if (taskType === "prd" || taskType === "code" || taskType === "solution") {
    return pendingMultiAgentPolicy(taskType);
  }

  return pendingMultiAgentPolicy(taskType);
}

module.exports = {
  resolveWorkflowExecutionPolicy,
  computeTaskSize,
  RESEARCH_AGENT_CRAWLER,
  RESEARCH_AGENT_ANALYST,
};
