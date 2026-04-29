"use strict";

const crypto = require("crypto");
const { runOpenclawGatewayPrompt } = require("../openclaw-gateway-adhoc");
const {
  buildFeishuSessionKey,
  buildFeishuIdempotencyKey,
} = require("./session-dispatch");
const {
  validateResearchOutput,
  buildRepairPrompt,
} = require("../feishu-cursor/policies/prompt-policy");
const {
  createRunTrace,
  planAgents,
  recordAgentExecuted,
  recordSkippedAgent,
  recordHandoff,
  setGateResult,
} = require("../feishu-cursor/runtime/run-trace-recorder");
const {
  RESEARCH_AGENT_CRAWLER,
  RESEARCH_AGENT_ANALYST,
} = require("./workflow-execution-policy");

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function defaultAdhocSec() {
  const n = Number(process.env.CURSOR_ADHOC_TIMEOUT_SEC || 600);
  return Number.isFinite(n) && n > 0 ? n : 600;
}

function timeoutSecFromEnv(name, fallbackSec) {
  const raw = trimStr(process.env[name] || "");
  if (!raw) return fallbackSec;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallbackSec;
}

function toTimeoutMs(sec) {
  const s = Number(sec);
  if (!Number.isFinite(s) || s <= 0) return Math.min(Math.floor(defaultAdhocSec() * 1000), 3_600_000);
  return Math.min(Math.floor(s * 1000), 3_600_000);
}

function buildResearchCrawlerPrompt({ planTask, classification }) {
  const qa = trimStr(classification && classification.qaContext);
  return [
    trimStr(planTask),
    "",
    "【角色】你是调研资料收集助手，仅做公开信息检索与摘录，不做最终方案决策或执行建议。",
    "",
    "【硬约束】",
    "- 不得编造链接；没有可信来源就明确写「未检索到」",
    "- 每条摘录尽量可回溯（页面标题 + URL）",
    "- 不做长篇分析；只输出「资料包」",
    "",
    "【配图 / 截图效率（必做其一）】",
    "- 优先收集**官方可引用**素材：新闻稿 / 帮助中心 / App Store / 产品更新页 / 文档站中的**现成配图 URL**（标明版权与是否建议仅内部分享）",
    "- 若无合适官方图：用 Markdown **表格**列「产品 | 对比页/落地页 URL | 页面内是否有公开 UI 图 | 推荐截图区域（hero/定价/功能卡片/导航/控制台主区） | 是否建议读者自行打开页面截图」",
    "- 禁止编造截图链接；需要实拍时只给**可打开的公开 URL**与操作提示，不要把本地路径写进资料包",
    "",
    qa ? `【用户对澄清问题的回答（必须尊重）】\n${qa}\n` : "",
    "【输出格式】",
    "输出 Markdown：先 ## 检索摘要（3条以内要点），再 ## 资料条目列表。",
    "每个资料条目用子标题，字段：- 标题：…  - 链接：…  - 日期（若页面有）：…  - 摘录：…  - 配图/素材链接（若有）：…  - 页面截图候选（若适用）：推荐页面 URL + 推荐区域/关键词  - 可信度：高/中/低  - 备注：是否需要进一步核验",
    "",
    "不要输出 JSON、不要输出调研结论章节。",
  ]
    .filter(Boolean)
    .join("\n");
}

function channelRuntimeModeFromDispatch(dispatch) {
  const g =
    dispatch &&
    dispatch.opts &&
    dispatch.opts.gatewayRequest &&
    typeof dispatch.opts.gatewayRequest.channelRuntimeMode === "string"
      ? dispatch.opts.gatewayRequest.channelRuntimeMode.trim()
      : "";
  return g === "plugin-native" ? "plugin-native" : "legacy-bridge";
}

function suffixIdempotency(baseIdem, tail) {
  const b = trimStr(baseIdem);
  if (b) return `${b}:${tail}`;
  return `feishu-adhoc:${tail}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * @param {{
 *   runOpenclawGatewayPrompt?: typeof runOpenclawGatewayPrompt,
 *   envelope: object,
 *   runtimeConfig: object,
 *   dispatch: { task: string, opts: object },
 *   classification: object,
 *   messageId?: string,
 *   logger?: { log: Function, error?: Function },
 *   executionPolicy?: object,
 * }} input
 */
async function runResearchWorkflowV2(input) {
  const i = input || {};
  const run =
    typeof i.runOpenclawGatewayPrompt === "function"
      ? i.runOpenclawGatewayPrompt
      : runOpenclawGatewayPrompt;

  const envelope = i.envelope || {};
  const runtimeConfig = i.runtimeConfig || {};
  const dispatch = i.dispatch || {};
  const classification = i.classification || {};
  const messageId = trimStr(i.messageId || envelope.sourceMessageId);
  const logger = i.logger || console;
  const ep = i.executionPolicy || {};

  const trace = createRunTrace({
    requestId: messageId || undefined,
    multiAgentRequired: true,
    workflow: "research",
    taskType: "research",
    mode: "execute",
    taskSize: trimStr(ep.taskSize),
    decisionReason: trimStr(ep.decisionReason) || "research_v2_multi_agent",
    skipReason: "",
    forcedRuntimeV2: !!ep.forcedRuntimeV2,
    agentsPlanned: [RESEARCH_AGENT_CRAWLER, RESEARCH_AGENT_ANALYST],
  });
  planAgents(trace, [RESEARCH_AGENT_CRAWLER, RESEARCH_AGENT_ANALYST]);

  const cfg = runtimeConfig;
  const crawlerId =
    trimStr(cfg.researchCrawlerAgentId) || trimStr(cfg.gatewayLightAgentId) || "main";
  const analystId =
    trimStr(cfg.researchAnalystAgentId) || trimStr(cfg.gatewayHeavyAgentId) || "cursor";

  const crawlRoute = {
    routeClass: "light",
    agentId: crawlerId,
    fallbackAgentId: trimStr(cfg.gatewayLightAgentId) || "main",
    reasonCodes: ["research_v2_crawler"],
  };
  const analystRoute = {
    routeClass: "heavy",
    agentId: analystId,
    fallbackAgentId: trimStr(cfg.gatewayHeavyAgentId) || "cursor",
    reasonCodes: ["research_v2_analyst"],
  };

  const crawlSec = timeoutSecFromEnv(
    "FEISHU_RESEARCH_CRAWLER_TIMEOUT_SEC",
    Math.min(600, defaultAdhocSec())
  );
  const analystSec = timeoutSecFromEnv("FEISHU_RESEARCH_ANALYST_TIMEOUT_SEC", defaultAdhocSec());

  const sessionCrawl = buildFeishuSessionKey(envelope, crawlRoute, runtimeConfig);
  const sessionAnalyst = buildFeishuSessionKey(envelope, analystRoute, runtimeConfig);

  const baseIdemCrawl = buildFeishuIdempotencyKey(envelope, crawlRoute, runtimeConfig);
  const idemCrawl = suffixIdempotency(baseIdemCrawl, `rw2:crawl:${crawlerId}`);

  const baseIdemAnalyst = buildFeishuIdempotencyKey(envelope, analystRoute, runtimeConfig);
  const idemAnalyst = suffixIdempotency(baseIdemAnalyst, `rw2:analyst:${analystId}`);

  const crm = channelRuntimeModeFromDispatch(dispatch);
  const t0 = Date.now();

  const crawlTask = buildResearchCrawlerPrompt({
    planTask: trimStr(dispatch.task),
    classification,
  });

  const crawlRes = await run(crawlTask, {
    ...(dispatch.opts || {}),
    sessionId: sessionCrawl,
    routeHint: crawlRoute,
    gatewayRequest: {
      sessionKey: sessionCrawl,
      idempotencyKey: idemCrawl,
      channelRuntimeMode: crm,
      timeoutMs: toTimeoutMs(crawlSec),
    },
  });

  const crawlOk = crawlRes && Number(crawlRes.code) === 0;
  const crawlBody = crawlOk ? trimStr(crawlRes.stdout) : "";

  if (crawlOk) {
    recordAgentExecuted(trace, RESEARCH_AGENT_CRAWLER, {
      outputRef: `crawl:${idemCrawl}`,
      summary: "research_crawler_completed",
    });
  } else {
    recordSkippedAgent(trace, RESEARCH_AGENT_CRAWLER, "research_crawler_failed_or_empty", {
      fallbackAgent: RESEARCH_AGENT_ANALYST,
      fallbackReason: "analyst_continues_with_degraded_context",
    });
  }

  const analystHead = crawlOk
    ? `\n\n---\n## 外部资料摘录（由资料收集阶段生成；请批判性引用，缺来源处须标注不确定）\n\n${crawlBody}\n`
    : `\n\n---\n## 资料收集阶段失败或未返回可用摘录\n请在不编造链接的前提下完成调研，并显著标注不确定性。\n`;

  let analystTask = `${trimStr(dispatch.task)}${analystHead}`;

  recordHandoff(trace, {
    fromAgent: RESEARCH_AGENT_CRAWLER,
    toAgent: RESEARCH_AGENT_ANALYST,
    inputRef: `idem:${idemCrawl}`,
    outputRef: crawlOk ? `crawl_body:${messageId}` : `crawl_failed:${messageId}`,
    handoffSummary: crawlOk
      ? "资料包已交给分析阶段"
      : "资料收集失败，分析阶段在无摘录下继续",
    status: crawlOk ? "completed" : "skipped",
    ...(crawlOk ? {} : { skipReason: "crawler_stage_not_ok" }),
  });

  let analystRes = await run(analystTask, {
    ...(dispatch.opts || {}),
    sessionId: sessionAnalyst,
    routeHint: analystRoute,
    gatewayRequest: {
      sessionKey: sessionAnalyst,
      idempotencyKey: idemAnalyst,
      channelRuntimeMode: crm,
      timeoutMs: toTimeoutMs(analystSec),
    },
  });

  let repairUsed = false;
  const allowRepair = cfg.researchQualityRepair !== false;
  if (allowRepair && analystRes && Number(analystRes.code) === 0) {
    const v = validateResearchOutput(analystRes.stdout);
    if (!v.ok) {
      const qa = trimStr(classification.qaContext);
      const repair = buildRepairPrompt(
        trimStr(dispatch.task),
        qa,
        trimStr(analystRes.stdout),
        v.failedChecks
      );
      repairUsed = true;
      const idemRepair = suffixIdempotency(baseIdemAnalyst, `rw2:analyst:repair:${analystId}`);
      analystRes = await run(repair, {
        ...(dispatch.opts || {}),
        sessionId: sessionAnalyst,
        routeHint: analystRoute,
        gatewayRequest: {
          sessionKey: sessionAnalyst,
          idempotencyKey: idemRepair,
          channelRuntimeMode: crm,
          timeoutMs: toTimeoutMs(analystSec),
        },
      });
    }
  }

  const analystOk = analystRes && Number(analystRes.code) === 0;
  if (analystOk) {
    recordAgentExecuted(trace, RESEARCH_AGENT_ANALYST, {
      outputRef: `analyst:${idemAnalyst}${repairUsed ? ":repaired" : ""}`,
      summary: repairUsed ? "research_analyst_completed_after_repair" : "research_analyst_completed",
    });
  } else {
    recordSkippedAgent(trace, RESEARCH_AGENT_ANALYST, "research_analyst_failed", {
      fallbackAgent: "",
      fallbackReason: "",
    });
  }

  const vFinal = analystOk ? validateResearchOutput(analystRes.stdout) : { ok: false, failedChecks: ["analyst_not_ok"] };
  setGateResult(trace, {
    ok: analystOk && vFinal.ok,
    gate: "research_v2_runtime",
    repairUsed,
    validationOk: vFinal.ok,
  });

  const elapsedMs = Date.now() - t0;
  logger.log(
    "[feishu-research-workflow-v2] crawler_ok=%s analyst_code=%s repair=%s elapsed_ms=%s",
    crawlOk,
    analystRes && analystRes.code,
    repairUsed,
    elapsedMs
  );

  const researchMeta = {
    mode: "research_v2",
    crawlerAgentId: crawlerId,
    analystAgentId: analystId,
    crawlerOk: crawlOk,
    repairUsed,
    elapsedMs,
    crawlerCode: crawlRes ? crawlRes.code : null,
    runtimeRunTraceRequestId: trace.requestId,
    forcedRuntimeV2: !!ep.forcedRuntimeV2,
  };

  const finalRes =
    analystRes || { code: 1, stdout: "", stderr: "analyst missing", error: null, structuredResult: null };
  return { ...finalRes, researchMeta, runtimeRunTrace: trace };
}

module.exports = {
  runResearchWorkflowV2,
  buildResearchCrawlerPrompt,
};
