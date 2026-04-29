"use strict";

const { resolveSolutionMode } = require("./solution-mode");

/**
 * =========================
 * Prompt 构建
 * =========================
 */

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function buildSolutionPrompt(task, classification) {
  const raw = trimStr(task);
  const mode = trimStr(classification && classification.solutionMode) || resolveSolutionMode(raw);

  const commonTail = [
    "",
    "【身份与输出】",
    "你通过 OpenClaw Gateway 提供服务，不要自称 Cursor。",
    "只输出最终 Markdown 正文；禁止输出过程性语句（如「正在检索」「下面开始分析」）。",
    "若信息不足，列出假设与待确认项，不要编造事实。",
  ];

  const byMode = {
    release: [
      raw,
      "",
      "你正在输出「发布 / 灰度 / 上线」类方案（solution / release）。",
      "",
      "【必须覆盖】",
      "1. 发布范围与准入条件（谁进灰度、地域/租户/版本维度）",
      "2. 分阶段节奏（pre / canary / 全量 或等价阶段）与每阶段准入/退出标准",
      "3. 观测指标与报警（核心 SLO、业务指标、对比基线）",
      "4. 回滚与应急（触发条件、执行步骤、RTO/RPO 口径若适用）",
      "5. 沟通与变更窗口（对内公告、对客提示、客服预案）",
      "",
      "【结构建议】",
      "# 灰度 / 发布方案",
      "## 背景与目标",
      "## 范围与灰度策略",
      "## 阶段与门禁",
      "## 观测与验收",
      "## 回滚与应急",
      "## 风险与待确认",
      "",
      "【表格】至少 1 个 Markdown 表格（例如阶段 × 流量 × 门禁 × 负责人）。",
    ],
    feasibility: [
      raw,
      "",
      "输出可行性分析：推荐结论（做 / 暂缓 / 不做）、收益、成本、依赖、主要风险与缓解思路。",
    ],
    roadmap: [
      raw,
      "",
      "输出路线图：至少 2 个阶段，每阶段含目标、产出、时间跨度、优先级。",
    ],
    plan: [
      raw,
      "",
      "输出可执行计划：范围、关键步骤、决策标准；里程碑 ≥3 条（交付物 / 负责人 / 大致周期）。",
    ],
    growth: [
      raw,
      "",
      "输出增长 / 实验方案：核心假设、实验列表（指标与样本量量级）、渠道与转化路径、下一步动作。",
    ],
  };

  const head = byMode[mode] || byMode.plan;
  return [...head, ...commonTail].join("\n");
}

function resolveEffectiveResearchStage(classification) {
  const c = classification || {};
  const isResearch =
    String(c.workflowKey || "") === "research" || String(c.taskType || "") === "research";
  if (!isResearch) return null;
  if (String(c.qaContext || "").trim()) return "execute";
  const s = String(c.stage || "").trim();
  if (s === "execute" || s === "clarify") return s;
  return "clarify";
}

function buildPromptText(task, classification, stageOpt) {
  const raw = String(task || "").trim();
  const c = classification || {};
  const workflowKey = String(c.workflowKey || "");
  const taskSubtype = String(c.taskSubtype || "");
  const legacyTaskType = String(c.taskType || "");

  // 双轨 dispatch：优先看 workflowKey（research / prd / code / solution / general），
  // 子类 taskSubtype 接住非主流程类型（relay / report_export / interactive_card 等），
  // 旧调用未填 workflowKey/taskSubtype 时仍按历史 taskType 兼容（如手写测试 { taskType: "relay" }）。
  let dispatchKey = "";
  if (workflowKey === "research" || legacyTaskType === "research") {
    dispatchKey = "research";
  } else if (taskSubtype === "relay" || legacyTaskType === "relay") {
    dispatchKey = "relay";
  } else if (taskSubtype === "report_export" || legacyTaskType === "report") {
    dispatchKey = "report";
  } else {
    dispatchKey = workflowKey || legacyTaskType || "general";
  }

  switch (dispatchKey) {
    case "relay":
      return (
        `${raw}\n\n` +
        "这是飞书群聊里的代问/转述任务。\n" +
        "请先识别委托方、被传达方、中间传达路径，再给出最终要发送的简短文案。\n" +
        "若原句中的“他/她/TA”指代不清，请明确指出歧义，不要擅自把代词绑定到唯一 @ 对象。\n" +
        "若需要 @，直接使用已注入的 open_id。"
      );
    case "report":
      return (
        `${raw}\n\n` +
        "请直接输出**完整** Markdown 报告（含多级标题、列表、表格），供服务端写入云文档；若已开启云文档导出，飞书聊天通常只展示「概要 + 云文档链接」。禁止仅用短摘要代替须写入云文档的正文。不要创建 Word/PDF，不要调用外部文档编辑器。"
      );
    case "research": {
      const stage =
        stageOpt !== undefined && stageOpt !== null
          ? stageOpt
          : resolveEffectiveResearchStage(c) || "clarify";

      if (stage === "clarify") {
        return [
          raw,
          "",
          "你正在执行调研任务，必须采用『先澄清再生成』模式。",
          "",
          "【当前目标】",
          "先确认用户真正想解决的问题，再进入正式调研。",
          "",
      "【你的任务】",
      "分析用户问题的完整度，针对性提出关键澄清问题（1–5个）。",
      "",
      "【分析步骤】",
      "1. 识别用户已明确给出的：调研对象、场景/目标、范围边界、关注维度、输出要求",
      "2. 判断缺口：哪些缺失会直接影响调研结论或建议方向",
      "3. 决策本轮问题数（强制下限）：",
      "   - 即使信息看似充足，也必须至少提出 1 个「确认方向/边界」的问题（例如：输出形态、范围上限、成功标准）",
      "   - 有少量关键缺口 → 2–4个问题",
      "   - 缺口较多或方向模糊 → 4–10个问题",
      "",
          "【问题质量要求】",
          "- 问题必须具体，并能直接影响调研方向、样本选择或最终结论",
          "- 优先问那些“一旦不确认，报告就容易跑偏”的问题",
          "- 禁止提出空泛问题，例如“还有什么补充吗？”“有什么特别要求吗？”",
          "- 使用编号列表输出",
          "",
          "【严格限制】",
          "- 不得输出任何调研结论",
          "- 不得输出报告正文",
          "- 不得自行补充假设并开始写报告",
          "",
          "【停止规则】",
          "- 在用户回答这些问题之前，严禁进入调研或报告生成",
          "",
          "【输出格式】",
          "只输出编号问题列表，不要输出其他说明。",
        ].join("\n");
      }

      if (stage === "execute") {
        const qaContext = String(c.qaContext || "").trim();
        return [
          raw,
          "",
          "你现在进入『正式调研与报告生成』阶段。",
          "",
          "以下是用户对澄清问题的回答，请严格以这些信息为准，不得擅自扩大范围、替换目标或改变评估重点：",
          "",
          qaContext || "（无）",
          "",
          "【落盘】",
          "将完整研究报告写入 `docs/research/<主题slug>.md`（合理英文文件名），与下面 stdout 正文**实质一致**（同一套标题、表格与要点）。若目录不存在请先创建。",
          "",
          "【写作要求】",
          "1. 先准确概括“用户这次真正要解决的问题”",
          "2. 再输出完整 Markdown 调研报告",
          "3. 报告必须围绕用户已确认的目标、范围、维度展开，不要写成泛泛科普",
          "4. 结论要清晰，比较要具体，建议要可执行",
          "5. 不得输出任何过程性语句，例如“正在检索”“正在整理”“下面开始分析”等",
          "",
          "【报告结构】",
          "# <调研主题>",
          "> 调研日期 | 作者：OpenClaw Agent",
          "",
          "## 0. 用户意图与调研范围",
          "- 用户目标",
          "- 调研对象 / 范围",
          "- 本报告重点回答的问题",
          "",
          "## 1. 执行摘要",
          "- 用 3-5 条要点概括最重要结论",
          "",
          "## 2. 背景与定义",
          "### 2.1 核心概念",
          "### 2.2 问题背景",
          "",
          "## 3. 核心机制 / 判断框架",
          "- 说明应如何理解和比较这个问题",
          "",
          "## 4. 主流方案 / 实现对比",
          "- 必须包含 Markdown 表格",
          "- 对比维度要贴近用户目标，而不是泛泛罗列",
          "",
          "## 5. 优劣势、风险与适用场景",
          "- 至少分别说明：优势、局限、风险、适用条件",
          "",
          "## 6. 现实案例 / 生产落地",
          "- 尽量给出真实产品、行业惯例、公开帮助中心或规则页面层面的例子",
          "",
          "## 7. 结论与建议",
          "### 7.1 结论",
          "### 7.2 对用户当前场景的建议",
          "### 7.3 建议优先级（高 / 中 / 低）",
          "",
          "## 参考资料",
          "- 列出可核对来源名称或链接",
          "",
          "【质量要求】",
          "- 每个二级章节至少包含 3 个实质性要点",
          "- 对比表必须清晰体现差异，不要做空表",
          "- 重要结论必须能在正文中找到依据",
          "- 对用户当前场景的建议必须具体，不能只说“视情况而定”",
          "- 若信息不足，应明确标注不确定点，不要假装确定",
          "",
          "【输出要求】",
          "- 只输出最终 Markdown 正文",
          "- 不要额外解释",
        ].join("\n");
      }

      return raw;
    }
    case "solution":
      return buildSolutionPrompt(raw, c);
    default:
      return raw;
  }
}

/**
 * =========================
 * 基础检测
 * =========================
 */

function detectProcessNoise(text) {
  return /正在检索|正在生成|正在整理|处理中|loading|下面开始|接下来我将/i.test(
    String(text || "")
  );
}

function detectMarkdownTable(text) {
  const s = String(text || "");
  return /\|(.+)\|(.+)\|/.test(s) && /\|[\s-:|]+\|/.test(s);
}

function countSecondLevelSections(text) {
  const matches = String(text || "").match(/^##\s+/gm);
  return matches ? matches.length : 0;
}

/**
 * =========================
 * 调研报告校验
 * =========================
 */

function validateResearchOutput(text) {
  const s = String(text || "");

  const checks = {
    hasTitle: /^#\s+.+/m.test(s),
    hasIntentScope: /^##\s+0\.\s*用户意图与调研范围/m.test(s),
    hasExecutiveSummary: /^##\s+1\.\s*执行摘要/m.test(s),
    hasBackground: /^##\s+2\.\s*背景与定义/m.test(s),
    hasFramework: /^##\s+3\.\s*核心机制\s*\/\s*判断框架/m.test(s),
    hasComparison: /^##\s+4\.\s*主流方案\s*\/\s*实现对比/m.test(s),
    hasTable: detectMarkdownTable(s),
    hasProsConsRisk: /^##\s+5\.\s*优劣势、风险与适用场景/m.test(s),
    hasCases: /^##\s+6\.\s*现实案例\s*\/\s*生产落地/m.test(s),
    hasConclusion: /^##\s+7\.\s*结论与建议/m.test(s),
    hasReferences: /^##\s*参考资料/m.test(s),
    enoughSections: countSecondLevelSections(s) >= 8,
    noProcessNoise: !detectProcessNoise(s),
    notTooShort: s.length >= 1800,
  };

  const ok = Object.values(checks).every(Boolean);

  return {
    ok,
    checks,
    failedChecks: Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([key]) => key),
  };
}

/**
 * =========================
 * 修复 Prompt
 * =========================
 */

function buildRepairPrompt(originalTask, qaContext, badOutput, failedChecks) {
  return [
    originalTask,
    "",
    "你上一版调研报告未通过结构与质量检查。请基于原任务与用户澄清信息，重新输出一版完整、高质量的 Markdown 调研报告。",
    "",
    "【用户已确认信息】",
    qaContext || "（无）",
    "",
    "【未通过项】",
    ...failedChecks.map((x) => `- ${x}`),
    "",
    "【修复要求】",
    "- 必须补齐缺失章节或内容",
    "- 必须保留完整 Markdown 结构",
    "- 必须包含有效对比表格",
    "- 不要解释原因，不要道歉，不要输出过程说明",
    "- 只输出修复后的最终 Markdown 正文",
  ].join("\n");
}

/**
 * =========================
 * 主入口
 * =========================
 */

function resolvePromptRequest(input) {
  const i = input || {};
  const task = String(i.task || "");
  const normalizeCursorTask = i.normalizeCursorTask;
  const appendFeishuOpenIdMentionHint = i.appendFeishuOpenIdMentionHint;
  const resolveCursorAgentProfile = i.resolveCursorAgentProfile;
  const routing = i.routing;
  const classification = i.classification || {};
  const safety = i.safety || {};
  const forceFull = !!i.forceFull || !!safety.forceFull;
  const messageType = String(i.messageType || "");

  const isResearch =
    String(classification.workflowKey || "") === "research" ||
    String(classification.taskType || "") === "research";
  let researchStage = resolveEffectiveResearchStage(classification);

  let plannedTask;
  if (isResearch && researchStage) {
    plannedTask = buildPromptText(task, classification, researchStage);
  } else {
    plannedTask = buildPromptText(task, classification);
  }

  const mergedClassification =
    isResearch && researchStage
      ? { ...classification, stage: researchStage }
      : { ...classification };

  const identityHint = "【身份约束】你通过 OpenClaw Gateway 提供服务，不要自称 Cursor 或 Cursor Agent。";
  const normalizedTask = appendFeishuOpenIdMentionHint(
    normalizeCursorTask(`${identityHint}\n\n${plannedTask}`)
  );
  const resolved = resolveCursorAgentProfile(normalizedTask, routing);
  if (forceFull) resolved.profile = "full";
  if (safety.profileOverride) resolved.profile = safety.profileOverride;

  const isInteractiveCard = messageType === "interactive";

  let expectedOutput;
  if (isResearch && researchStage) {
    expectedOutput =
      researchStage === "clarify"
        ? {
            kind: "clarification_questions",
            minQuestions: 1,
            maxQuestions: 10,
          }
        : {
            kind: "markdown_research_report",
            mustHaveTable: true,
            mustAvoidProcessLogs: true,
            validator: "validateResearchOutput",
          };
  } else {
    expectedOutput = { kind: "plain_text" };
  }

  return {
    task: resolved.task,
    profile: isInteractiveCard ? "fast" : resolved.profile,
    permissionMode: isInteractiveCard ? "deny" : safety.permissionMode,
    cleanCwd: isInteractiveCard ? true : !!safety.cleanCwd,
    isInteractiveCard,
    classification: mergedClassification,
    safety,
    stage: isResearch ? researchStage : undefined,
    expectedOutput,
  };
}

module.exports = {
  buildPromptText,
  resolvePromptRequest,
  validateResearchOutput,
  buildRepairPrompt,
  detectProcessNoise,
  detectMarkdownTable,
  resolveEffectiveResearchStage,
};
