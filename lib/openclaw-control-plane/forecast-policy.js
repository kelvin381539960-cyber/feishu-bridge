"use strict";

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean).map((v) => String(v))));
}

function includesAny(text, patterns) {
  const s = trimStr(text);
  return patterns.some((p) => p.test(s));
}

function resolveRiskForecast({ workflow, taskType, taskSize, planTask, multiAgentRequired }) {
  const w = trimStr(workflow || taskType || "general");
  const size = trimStr(taskSize || "S");
  const task = trimStr(planTask);
  const codeOrOps = w === "code" || includesAny(task, [/部署|上线|systemd|env|权限|token|secret|删除|清理|rm\s+-rf/i]);
  const governance = includesAny(task, [/workflow|治理|harness|Task List|Context Pack|Gate|Trace|pipeline/i]);

  if (size === "XL" || codeOrOps) return "high";
  if (size === "L" || multiAgentRequired || governance) return "medium";
  return "low";
}

function buildFailureModes({ workflow, taskType, taskSize, planTask, riskForecast }) {
  const w = trimStr(workflow || taskType || "general");
  const task = trimStr(planTask);
  const modes = [];

  if (w === "research") {
    modes.push("source coverage may be incomplete or stale");
    modes.push("summary may overfit a small evidence set");
  }
  if (w === "prd") {
    modes.push("requirements may be underspecified or misaligned with user intent");
  }
  if (w === "solution") {
    modes.push("solution may be too broad to implement safely in one step");
  }
  if (w === "code") {
    modes.push("code change may affect the runtime path or tests");
  }
  if (/删除|清理|cleanup|archive/i.test(task)) {
    modes.push("cleanup may remove a current source artifact by mistake");
  }
  if (/pipeline|gateway|systemd|deploy|env|权限|token|secret/i.test(task)) {
    modes.push("runtime or deployment behavior may change unexpectedly");
  }
  if (riskForecast === "high") {
    modes.push("high-risk task may require explicit user confirmation before execution");
  }
  if (!modes.length) {
    modes.push("task may produce incomplete output if context is insufficient");
  }
  return uniq(modes);
}

function buildRollbackPlan({ workflow, taskType, riskForecast }) {
  const w = trimStr(workflow || taskType || "general");
  if (riskForecast === "high") {
    return "pause before high-risk execution; if already changed, revert the commit and restore the previous runtime path";
  }
  if (w === "code") {
    return "revert the code commit and rerun the relevant tests";
  }
  if (w === "research" || w === "prd" || w === "solution") {
    return "treat output as draft and revise or replace the artifact without runtime impact";
  }
  return "revert the last artifact change or mark the task failed with reason";
}

function resolveExecuteDecision({ riskForecast, workflow, taskType, planTask }) {
  const w = trimStr(workflow || taskType || "general");
  const task = trimStr(planTask);
  if (riskForecast === "high" && /删除|清理|部署|上线|systemd|env|token|secret|权限/i.test(task)) {
    return "needs_user_confirmation";
  }
  if (riskForecast === "high" && w === "code") return "pause";
  return "execute";
}

function buildLearningSignals({ workflow, taskType, riskForecast, executeDecision, failureModes }) {
  const w = trimStr(workflow || taskType || "general");
  return uniq([
    `workflow:${w}`,
    `risk:${riskForecast}`,
    `decision:${executeDecision}`,
    failureModes && failureModes.length >= 2 ? "forecast:multi_failure_modes" : "forecast:minimal",
  ]);
}

function buildForecastPolicy(input = {}) {
  const workflow = trimStr(input.workflow || input.taskType || "general");
  const taskType = trimStr(input.taskType || workflow);
  const taskSize = trimStr(input.taskSize || "S");
  const planTask = trimStr(input.planTask || "");
  const riskForecast = resolveRiskForecast({
    workflow,
    taskType,
    taskSize,
    planTask,
    multiAgentRequired: !!input.multiAgentRequired,
  });
  const failureModes = buildFailureModes({ workflow, taskType, taskSize, planTask, riskForecast });
  const executeDecision = resolveExecuteDecision({ riskForecast, workflow, taskType, planTask });
  const rollbackPlan = buildRollbackPlan({ workflow, taskType, riskForecast });
  const expectedOutcome = planTask
    ? `Complete ${workflow} task for: ${planTask.slice(0, 120)}`
    : `Complete ${workflow} task according to its workflow policy`;
  const nextStepPrediction = executeDecision === "execute"
    ? "run executor, then apply gate and record trace"
    : "pause before execution and return decision reason";

  return {
    expectedOutcome,
    nextStepPrediction,
    failureModes,
    riskForecast,
    rollbackPlan,
    executeDecision,
    forecastGate: {
      status: executeDecision === "blocked" ? "failed" : executeDecision === "execute" ? "passed" : "warning",
      reasons: executeDecision === "execute" ? [] : [`execute_decision:${executeDecision}`],
    },
    learningSignals: buildLearningSignals({
      workflow,
      taskType,
      riskForecast,
      executeDecision,
      failureModes,
    }),
  };
}

module.exports = {
  buildForecastPolicy,
  resolveRiskForecast,
};
