"use strict";

/**
 * task-classifier（双轨分类）
 *
 * 输出固定包含两条字段：
 *   - workflowKey：5 类白名单 (prd|research|code|solution|general)，作为 contracts/registry/gate 唯一入口键
 *   - taskSubtype：原 9 类细分（interactive_card / sheet_write / sheet_read / resource_read / workflow_audit / relay / report_export / none），
 *                  作为 pipeline / runner-selector / route-policy / docx-export 等历史能力的延续读取字段
 *
 * 旧 `taskType` 字段保持原值以维持回归（与 taskSubtype 同步），新代码请逐步切换到 workflowKey + taskSubtype。
 */

const { createTaskClassification } = require("../models/task-classification");
const { resolveSolutionMode } = require("./solution-mode");

const SHEET_URL_RE =
  /https?:\/\/(?:[a-z0-9.-]+\.)?(feishu\.cn|larksuite\.com)\/sheets?\/([A-Za-z0-9]+)/i;
const DOC_URL_RE =
  /https?:\/\/(?:[a-z0-9.-]+\.)?(feishu\.cn|larksuite\.com)\/(wiki|docx|base|board|whiteboard)\//i;
const RESOURCE_URL_RE = DOC_URL_RE;

const SHEET_WRITE_INTENT_RE =
  /(写入|填入|更新|修改|追加|新增|整理到|同步到|录入|导入|生成到|补充到|保存到|写到|填到|改到)/i;

const PRONOUN_RE = /(^|[^\w])(他|她|TA|ta)([^\w]|$)/;
const RELAY_VERB_RE = /问(?:一下)?|转告|转述|传话/i;
const RELAY_WEAK_OBJECT_RE =
  /^(请|麻烦|帮忙|一下|这个|那个|事情|问题|内容|消息|信息|问问|看看|确认|处理|跟进|同步)+$/i;

const FORCE_RESEARCH_RE = /^\/调研(?:\s|$)/i;
const FORCE_CODE_RE = /^\/code(?:\s|$)/i;
const FORCE_SOLUTION_RE = /^\/solution(?:\s|$)/i;

const RESEARCH_RE =
  /调研|技术调研|竞品分析|方案调研|深度研究|深度分析|技术分析|帮.{0,6}研究|帮.{0,6}调研|research(?:ing|ed)?|investigate|deep.?dive/i;

const AUDIT_INTENT_RE =
  /(检查|核查|验证|确认|看看|查一下|查下|是否|有没有|有无).{0,30}(按设计|按流程|workflow|流程|执行|跑|调用|agent|模型|日志|记录|链路)/i;

const PRD_STRONG_RE =
  /PRD|产品需求文档|需求文档|需求说明书|产品设计文档/i;
const PRD_ACTION_RE =
  /(生成|写|输出|整理|补全|完善|评审|优化|重构|改写).{0,20}(需求|PRD|产品方案|功能说明|验收标准|用户故事)/i;

// Code workflow（排障 / 部署 / 命令 / 配置 / 安装 / 删除 / 环境 / 日志 / 报错 / 修复）
// 注意：此处吸收了原 route-policy 的 HEAVY_TASK_RE 中 "修复|fix|debug|排查|报错|失败" 关键词，
// 统一在 classifier 里产出 workflowKey=code，下游通过 workflowKey 判定，不再硬编码关键词。
const CODE_RE =
  /(?:^|[^A-Za-z])(?:debug|fix|fixed|fixing|crash|crashed|broke|broken|bug)(?:[^A-Za-z]|$)|(?:排障|排查|排错|报错|报警|修复|修一下|修这个|修一修|修个|帮.{0,4}修|帮.{0,4}修复|部署|deploy|发版(?!.*计划)|重启|restart|reload|安装|卸载|uninstall|配置.{0,4}(?:改|修改|调整|设置)|systemctl|journalctl|crontab|kubectl|启动失败|连不上|跑不起来|跑不动|不工作|访问不了|失败.{0,6}(?:原因|分析|排查)|环境变量|nginx|service\s+\w+)/i;

// Solution workflow（方案 / 可行性 / 路线图 / 发布计划 / 增长方案）
const SOLUTION_RE =
  /(方案设计|可行性(?:评估|分析|判断|论证)?|feasibility|路线图|roadmap|发布计划|release\s*plan|灰度(?:发布|上线)?|灰度方案|上线方案|发布方案|增长方案|growth\s*plan|增长策略|实验设计|阶段计划|方案对比|做不做(?:这个|该)?|要不要(?:做|上)|该不该做)/i;

const SEMANTIC_ROUTING_CANDIDATE_RE =
  /(需求|功能|流程|页面|产品|方案|验收|研发|测试|用户故事|规则|PRD|调研|分析|竞品|报告|总结)/i;

// taskSubtype 集合（与 task-classification model KNOWN_TASK_SUBTYPES 同步）
const TASK_SUBTYPES = Object.freeze({
  NONE: "none",
  INTERACTIVE_CARD: "interactive_card",
  SHEET_WRITE: "sheet_write",
  SHEET_READ: "sheet_read",
  RESOURCE_READ: "resource_read",
  WORKFLOW_AUDIT: "workflow_audit",
  RELAY: "relay",
  REPORT_EXPORT: "report_export",
});

// taskType -> workflow meta 映射（dual-track 真源）
const WORKFLOW_META = Object.freeze({
  prd: { workflowKey: "prd", role: "specialized", taskSubtype: TASK_SUBTYPES.NONE },
  research: { workflowKey: "research", role: "specialized", taskSubtype: TASK_SUBTYPES.NONE },
  code: { workflowKey: "code", role: "specialized", taskSubtype: TASK_SUBTYPES.NONE },
  solution: { workflowKey: "solution", role: "specialized", taskSubtype: TASK_SUBTYPES.NONE },
  general: {
    workflowKey: "general",
    role: "fallback",
    taskSubtype: TASK_SUBTYPES.NONE,
    fallbackReason: "no_specialized_intent",
  },
  interactive_card: {
    workflowKey: "general",
    role: "fallback",
    taskSubtype: TASK_SUBTYPES.INTERACTIVE_CARD,
    fallbackReason: "interactive_card_subtype",
  },
  sheet_write: {
    workflowKey: "general",
    role: "fallback",
    taskSubtype: TASK_SUBTYPES.SHEET_WRITE,
    fallbackReason: "sheet_write_tooling",
  },
  sheet_read: {
    workflowKey: "general",
    role: "fallback",
    taskSubtype: TASK_SUBTYPES.SHEET_READ,
    fallbackReason: "sheet_read_tooling",
  },
  resource_read: {
    workflowKey: "general",
    role: "fallback",
    taskSubtype: TASK_SUBTYPES.RESOURCE_READ,
    fallbackReason: "resource_read_tooling",
  },
  workflow_audit: {
    workflowKey: "general",
    role: "fallback",
    taskSubtype: TASK_SUBTYPES.WORKFLOW_AUDIT,
    fallbackReason: "workflow_audit_subtype",
  },
  relay: {
    workflowKey: "general",
    role: "fallback",
    taskSubtype: TASK_SUBTYPES.RELAY,
    fallbackReason: "relay_short_circuit",
  },
  report: {
    workflowKey: "general",
    role: "fallback",
    taskSubtype: TASK_SUBTYPES.REPORT_EXPORT,
    fallbackReason: "report_doc_export",
  },
});

function meta(taskType) {
  return (
    WORKFLOW_META[taskType] || {
      workflowKey: "general",
      role: "fallback",
      taskSubtype: TASK_SUBTYPES.NONE,
      fallbackReason: "unknown_task_type",
    }
  );
}

function build(args) {
  const input = args || {};
  const taskType = String(input.taskType || "general");
  const m = meta(taskType);
  return createTaskClassification({
    ...m,
    ...input,
    taskType,
    workflowKey: input.workflowKey || m.workflowKey,
    role: input.role || m.role,
    fallbackReason: input.fallbackReason || m.fallbackReason,
    taskSubtype: input.taskSubtype || m.taskSubtype,
  });
}

function classifyTask(input) {
  const i = input || {};
  const task = String(i.task || "");
  const messageType = String(i.messageType || "");
  const isRelayLikeTask = i.isRelayLikeTask;
  const isReportLikeTask = i.isReportLikeTask;
  const reasons = [];

  if (messageType === "interactive") {
    reasons.push("interactive_message");
    return build({
      taskType: "interactive_card",
      confidence: 0.98,
      requiresTooling: false,
      requiresFullRunner: false,
      needsClarification: false,
      reasons,
    });
  }

  const hasSheetUrl = SHEET_URL_RE.test(task);
  const hasResourceUrl = RESOURCE_URL_RE.test(task);
  const hasUrl = hasSheetUrl || hasResourceUrl || /https?:\/\//i.test(task);

  const researchLike =
    RESEARCH_RE.test(task) ||
    FORCE_RESEARCH_RE.test(task) ||
    (typeof i.isResearchLikeTask === "function" && i.isResearchLikeTask(task));

  const prdLike = PRD_STRONG_RE.test(task) || PRD_ACTION_RE.test(task);
  const auditIntent = AUDIT_INTENT_RE.test(task);
  const auditSubtype = auditIntent ? TASK_SUBTYPES.WORKFLOW_AUDIT : undefined;
  const codeForced = FORCE_CODE_RE.test(task);
  const solutionForced = FORCE_SOLUTION_RE.test(task);
  const codeLike = codeForced || CODE_RE.test(task);
  const solutionLike = solutionForced || SOLUTION_RE.test(task);

  // 1. prdLike -> prd
  if (prdLike) {
    reasons.push("prd_task");
    if (hasUrl) reasons.push("url_as_input");
    if (researchLike) reasons.push("research_as_input");
    return build({
      taskType: "prd",
      confidence: researchLike ? 0.86 : 0.88,
      requiresTooling: hasUrl,
      requiresFullRunner: true,
      needsClarification: false,
      taskSubtype: auditSubtype,
      reasons,
    });
  }

  // 2. hasUrl && researchLike -> research
  if (hasUrl && researchLike) {
    reasons.push("research_task", "url_as_input");
    return build({
      taskType: "research",
      confidence: 0.88,
      requiresTooling: true,
      requiresFullRunner: true,
      needsClarification: false,
      taskSubtype: auditSubtype,
      reasons,
    });
  }

  // 3. hasSheetUrl -> sheet_write / sheet_read
  if (hasSheetUrl) {
    reasons.push("sheet_url_detected");
    if (SHEET_WRITE_INTENT_RE.test(task)) {
      reasons.push("sheet_write_intent");
      return build({
        taskType: "sheet_write",
        confidence: 0.99,
        requiresTooling: true,
        requiresFullRunner: true,
        needsClarification: false,
        reasons,
      });
    }
    reasons.push("sheet_read_intent");
    return build({
      taskType: "sheet_read",
      confidence: 0.99,
      requiresTooling: true,
      requiresFullRunner: true,
      needsClarification: false,
      reasons,
    });
  }

  // 4. hasResourceUrl -> resource_read
  if (hasResourceUrl) {
    reasons.push("resource_url_detected");
    return build({
      taskType: "resource_read",
      confidence: 0.92,
      requiresTooling: true,
      requiresFullRunner: true,
      needsClarification: false,
      reasons,
    });
  }

  if (auditIntent) reasons.push("workflow_audit_intent");

  // 5. researchLike -> research
  if (researchLike) {
    reasons.push("research_task");
    if (FORCE_RESEARCH_RE.test(task)) reasons.push("research_forced_command");
    return build({
      taskType: "research",
      confidence: 0.88,
      requiresTooling: true,
      requiresFullRunner: true,
      needsClarification: false,
      taskSubtype: auditSubtype,
      reasons,
    });
  }

  // 7. codeLike -> code
  if (codeLike) {
    reasons.push("code_task");
    if (codeForced) reasons.push("code_forced_command");
    return build({
      taskType: "code",
      confidence: codeForced ? 0.95 : 0.84,
      requiresTooling: true,
      requiresFullRunner: true,
      needsClarification: false,
      taskSubtype: auditSubtype,
      reasons,
    });
  }

  // 8. solutionLike -> solution
  if (solutionLike) {
    reasons.push("solution_task");
    if (solutionForced) reasons.push("solution_forced_command");
    return build({
      taskType: "solution",
      confidence: solutionForced ? 0.95 : 0.82,
      requiresTooling: false,
      requiresFullRunner: true,
      needsClarification: false,
      taskSubtype: auditSubtype,
      reasons,
      solutionMode: resolveSolutionMode(task),
    });
  }

  // 9. reportLike -> report (taskSubtype=report_export)
  if (typeof isReportLikeTask === "function" && isReportLikeTask(task)) {
    reasons.push("report_like_task");
    return build({
      taskType: "report",
      confidence: 0.86,
      requiresTooling: false,
      requiresFullRunner: false,
      needsClarification: false,
      taskSubtype: auditSubtype,
      reasons,
    });
  }

  // 10. relayLike -> relay
  const relayLikeByRoute =
    typeof isRelayLikeTask === "function" && isRelayLikeTask(task);
  const hasConnector = /通过|向|跟/.test(task);
  const hasPronoun = PRONOUN_RE.test(task);
  const hasRelayVerb = RELAY_VERB_RE.test(task);
  const hasMentionOrBotSignal = /@|_user_\d+/i.test(task) || /小智|jarvis|机器人/i.test(task);
  const stripped = task
    .replace(
      /通过|向|跟|帮我问一下|替我问一下|代我问一下|帮我问|替我问|代我问|帮|替|代|问一下|问|转告|转述|传话|这个问题|那个问题|问题|这个事情|这件事|情况|一下|我/g,
      ""
    )
    .trim();
  const normalizedRelayObject = stripped.replace(/[，。！？、,.!?；;:\s]/g, "");
  const hasMeaningfulRelayObject =
    normalizedRelayObject.length >= 2 &&
    !RELAY_WEAK_OBJECT_RE.test(normalizedRelayObject);

  let isRelayCandidate = false;
  let explicitObject = false;
  let onlyPronoun = false;

  if (hasConnector || hasMeaningfulRelayObject) {
    if (
      hasPronoun &&
      stripped.replace(new RegExp(PRONOUN_RE.source, "g"), "").trim().length === 0 &&
      !hasConnector
    ) {
      onlyPronoun = true;
    } else if (hasMeaningfulRelayObject || hasConnector) {
      explicitObject = true;
    }
  } else if (hasPronoun) {
    onlyPronoun = true;
  }

  isRelayCandidate =
    relayLikeByRoute ||
    (hasRelayVerb &&
      (hasConnector || hasPronoun || explicitObject) &&
      (hasMentionOrBotSignal || explicitObject));

  if (isRelayCandidate && (explicitObject || onlyPronoun)) {
    reasons.push("relay_like_task");
    if (hasConnector) reasons.push("relay_has_connector");
    if (explicitObject) reasons.push("relay_explicit_object");
    if (onlyPronoun) reasons.push("relay_only_pronoun");

    return build({
      taskType: "relay",
      confidence: explicitObject ? 0.82 : 0.7,
      requiresTooling: false,
      requiresFullRunner: hasConnector || explicitObject || onlyPronoun,
      needsClarification: onlyPronoun && !explicitObject,
      reasons,
    });
  }

  // 11. general fallback
  reasons.push("no_specialized_intent");
  return build({
    taskType: auditIntent ? "workflow_audit" : "general",
    confidence: auditIntent ? 0.84 : 0.55,
    requiresTooling: auditIntent,
    requiresFullRunner: auditIntent,
    needsClarification: false,
    taskSubtype: auditSubtype,
    reasons,
  });
}

async function classifyTaskWithSemantic(input, options = {}) {
  const deterministicResult = classifyTask(input);
  const taskType = deterministicResult.taskType;

  const STRONG_RULES = new Set([
    "interactive_card",
    "sheet_write",
    "sheet_read",
    "resource_read",
    "workflow_audit",
    "relay",
    "research",
    "prd",
    "code",
    "solution",
  ]);

  if (STRONG_RULES.has(taskType)) {
    return deterministicResult;
  }

  const task = String((input || {}).task || "");
  if (
    !SEMANTIC_ROUTING_CANDIDATE_RE.test(task) ||
    typeof options.semanticClassifier !== "function"
  ) {
    return deterministicResult;
  }

  try {
    const semanticResult = await options.semanticClassifier({
      task,
      allowedTaskTypes: ["prd", "research", "code", "solution", "report", "relay", "general"],
    });

    if (!semanticResult || typeof semanticResult !== "object") {
      return deterministicResult;
    }

    const semTaskType = String(semanticResult.taskType || "");
    const semConf = Number(semanticResult.confidence);
    const semReasons = Array.isArray(semanticResult.reasons) ? semanticResult.reasons : [];
    const allowedTypes = new Set([
      "prd",
      "research",
      "code",
      "solution",
      "report",
      "relay",
      "general",
    ]);

    if (allowedTypes.has(semTaskType) && !Number.isNaN(semConf) && semConf >= 0.8) {
      const newReasons = [
        ...deterministicResult.reasons,
        "semantic_router",
        "semantic_router_confident",
        ...semReasons,
      ];

      const isPrd = semTaskType === "prd";
      const isResearch = semTaskType === "research";
      const isCode = semTaskType === "code";
      const isSolution = semTaskType === "solution";
      const hasUrl = /https?:\/\//i.test(task);

      return build({
        taskType: semTaskType,
        confidence: semConf,
        requiresTooling: isPrd ? hasUrl : (isResearch || isCode ? true : false),
        requiresFullRunner:
          isPrd || isResearch || isCode || isSolution ||
          semTaskType === "relay" || semTaskType === "report",
        needsClarification:
          semTaskType === "relay" &&
          PRONOUN_RE.test(task) &&
          !/通过|向|跟|@|_user_\d+/i.test(task),
        reasons: newReasons,
        solutionMode: isSolution ? resolveSolutionMode(task) : undefined,
      });
    }
  } catch (err) {
    // 捕获 LLM 错误静默回退
  }

  return deterministicResult;
}

module.exports = {
  classifyTask,
  classifyTaskWithSemantic,
  SHEET_URL_RE,
  DOC_URL_RE,
  RESOURCE_URL_RE,
  FORCE_RESEARCH_RE,
  FORCE_CODE_RE,
  FORCE_SOLUTION_RE,
  RESEARCH_RE,
  CODE_RE,
  SOLUTION_RE,
  AUDIT_INTENT_RE,
  PRD_STRONG_RE,
  PRD_ACTION_RE,
  TASK_SUBTYPES,
  WORKFLOW_META,
};
