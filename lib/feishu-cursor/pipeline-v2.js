"use strict";

const { parseWsImDispatchPayload } = require("../feishu-im-parse");
const {
  checkRoutingEligibility,
  resolveTaskAfterRouting,
} = require("./policies/routing-policy");
const {
  buildDeterministicRelayReply,
  sanitizeRelayReplyBody,
} = require("./policies/relay-policy");
const { sendTaskAck } = require("./outbound/ack-sender");
const { createMediaProcessor } = require("./task-builders/media-processor");
const { buildTaskContext } = require("./task-builders/task-context-builder");
const { normalizeExecutionResult } = require("./models/execution-result");
const { runOutputPlugins } = require("../brain/output/output-registry");
const { buildFeishuTaskEnvelope } = require("../feishu-channel/models/feishu-task-envelope");
const { planOpenclawExecution } = require("../openclaw-control-plane/request-planner");
const { classifyOpenclawIntent } = require("../openclaw-control-plane/intent-router");
const { resolveWorkflowExecutionPolicy } = require("../openclaw-control-plane/workflow-execution-policy");
const { applyPipelineGate } = require("./runtime/pipeline-gate-adapter");
const { validateSpecializedRuntime } = require("./runtime/multi-agent-runtime-guards");
const { runSpecializedSoloWithTrace } = require("./runtime/specialized-solo-runner");
const {
  researchWorkflowStateKey,
  loadResearchWorkflowState,
  markResearchClarifySent,
  clearResearchWorkflowState,
  PHASE_CLARIFY_SENT,
} = require("./research-workflow-state");
const {
  evaluateFreshReset,
  detectFollowupWeak,
  activeWorkflowEvidence,
} = require("./conversation-reset");
const { stripLeadingProcessNarration } = require("./strip-process-narration");
const { writeFailedResearchSnapshot } = require("./failed-research-snapshot-store");
const defaultMemoryEpoch = require("./memory/default-memory-provider");
const { validateMemoryPack } = require("../brain/memory/memory-pack");
const { selectWorkflowPlugin } = require("./workflows/workflow-registry");
const { createCompatAdapter } = require("../brain/compat/compat-adapter");
const { createPlanner } = require("../brain/planning/planner");

function parseClarifyControl(text) {
  const s = String(text || "").trim();
  if (!s) return "";
  if (/^(结束任务|结束|取消|停止|算了|不用了)\s*$/i.test(s)) return "end";
  if (/^(继续澄清|继续提问|继续问|再澄清)\s*$/i.test(s)) return "clarify";
  if (/^(继续下一步|下一步|继续执行|开始执行)\s*$/i.test(s)) return "next";
  return "";
}

function isExplicitResearchRestart(text) {
  const s = String(text || "").trim();
  return !!s && /^(新调研|重新调研|重开调研|另起调研|换个调研|重新开始调研)[:：\s]/i.test(s);
}

function firstHttpUrl(s) {
  const m = String(s || "").match(/https?:\/\/[^\s)>\]}一-龥，。]+/i);
  return m ? m[0].slice(0, 2000) : "";
}

function workflowHintEnabled() {
  const raw = String(process.env.FEISHU_WORKFLOW_TRACE_HINT || "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

function buildWorkflowTraceHint(classification, prompt) {
  const c = classification || {};
  const parts = [];
  parts.push(String(c.workflowKey || c.taskType || "general").trim() || "general");
  const stage = String(prompt && prompt.stage ? prompt.stage : "execute").trim();
  if (stage) parts.push(stage);
  const sub = String(c.taskSubtype || "").trim();
  if (sub && sub !== "none") parts.push(sub);
  return `已识别：${parts.join(" / ")}`;
}

function clarifyControlFooterEnabled() {
  const raw = String(process.env.FEISHU_CLARIFY_CONTROL_FOOTER || "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

function buildClarifyControlFooter() {
  return "——\n回复选项：继续澄清 | 继续下一步 | 结束任务（默认：继续下一步）";
}

function createDefaultQueue() {
  return {
    mode: "inline",
    enqueue: async (fn) => ({
      result: await fn(),
      metadata: {
        mode: "inline",
        queueWaitMs: 0,
        queueDepth: 0,
        startedAt: Date.now(),
        finishedAt: Date.now(),
      },
    }),
  };
}

function buildEnvelope({ data, extracted, routing, runtimeConfig, task, userTask, receivedAtMs, classification }) {
  return buildFeishuTaskEnvelope({
    data,
    extracted,
    routing,
    runtimeMode: runtimeConfig && runtimeConfig.channelRuntimeMode,
    groupRequireAtBot: runtimeConfig && runtimeConfig.groupRequireAtBot,
    fullTaskPrefixes: runtimeConfig && runtimeConfig.fullTaskPrefixes,
    task,
    userTask,
    receivedAtMs,
    classification,
  });
}

function createFeishuCursorPipelineV2(deps) {
  const d = deps || {};
  d.runtimeConfig = d.runtimeConfig || {};
  if (!d.taskQueue) d.taskQueue = createDefaultQueue();

  const processMedia = createMediaProcessor({
    downloadImage: d.downloadImage,
    downloadResource: d.downloadResource,
    fetchMessage: d.fetchMessage,
    cleanupFile: d.cleanupFile,
    describeImage: d.describeImage,
    extractFileText: d.extractFileText,
    transcribeAudio: d.transcribeAudio,
    processVideo: d.processVideo,
    processSticker: d.processSticker,
  });
  const parseInboundEvent = d.parseInboundEvent || parseWsImDispatchPayload;
  const normalizeCompatContext = createCompatAdapter({ buildEnvelope });
  const planner = createPlanner({ planOpenclawExecution, classifyOpenclawIntent });

  async function runPipelineV2Legacy(data) {
    const tPipelineStart = Date.now();
    const msgId = data && data.message && data.message.message_id;

    if (!data._feishuSkipDedupOnce && await d.state.dedupConsume(msgId)) {
      d.logger.log("[feishu-ws-cursor] skip duplicate message_id=", msgId);
      return;
    }

    const extracted = parseInboundEvent(data);
    d.logger.log("[feishu-ws-cursor] parsed(v2):", JSON.stringify({
      skip: extracted.skip,
      reason: extracted.reason,
      messageType: extracted.messageType,
      hasText: !!extracted.text,
      textLen: extracted.text && extracted.text.length,
      hasMedia: !!extracted.media,
    }));

    if (extracted.skip) {
      if (extracted.reason === "unknown_type" && extracted.chatId) {
        await d.sendFeishuTextToChat(extracted.chatId, `暂不支持此消息类型(${extracted.message_type})。`);
      }
      return;
    }

    const normalizedContext = normalizeCompatContext({ data, extracted, routing: d.routing, runtimeConfig: d.runtimeConfig, receivedAtMs: tPipelineStart });

    const routeCheck = checkRoutingEligibility(d.routing, extracted);
    if (!routeCheck.ok) {
      if (d.telemetry) d.telemetry.emit("route_skipped", { reason: routeCheck.reason, chatId: extracted.chatId || "", messageId: extracted.messageId || "" });
      return;
    }

    if (d.runtimeConfig.groupRequireAtBot && data.message) {
      const botOid = await d.getBotSelfOpenId();
      if (d.shouldSkipGroupMessageWithoutAtBot(data.message, botOid)) return;
    }

    if (await d.state.consumeRecentOutboundReply(extracted.chatId, extracted.text || "")) return;

    if (extracted.messageType === "merge_forward" && !data._feishuMergeForwardSolo) {
      d.state.scheduleMergeForwardDebounce(extracted.chatId, data, d.enqueueEvent);
      return;
    }

    let prefixedMediaText = "";
    if (["text", "post", "interactive"].includes(extracted.messageType)) {
      const pendingMerge = d.state.takePendingMergeForwardForChat(extracted.chatId);
      if (pendingMerge) {
        const exM = parseInboundEvent(pendingMerge);
        if (exM && exM.media) prefixedMediaText = (await processMedia(exM.media)) || "";
      }
    }

    let task = extracted.text || "";
    if (prefixedMediaText) task = task ? `${prefixedMediaText}\n\n${task}` : prefixedMediaText;
    if (extracted.media) {
      const mediaText = await processMedia(extracted.media);
      if (mediaText) task = task ? `${task}\n\n${mediaText}` : mediaText;
    }

    const routedTask = resolveTaskAfterRouting(d.routing, task);
    if (!routedTask.ok) {
      if (routedTask.reason === "empty_task") {
        await d.sendFeishuTextToChat(extracted.chatId, d.routing.direct ? "消息为空，请发送需要 Cursor 执行的文本任务。" : "请在触发前缀后输入任务描述（例如 /figma 在 Figma 里画登录页）。");
      } else if (routedTask.reason === "prefix_miss" && d.routing && !d.routing.direct && d.runtimeConfig.prefixMissHintEnabled !== false) {
        const p = (d.routing.prefix && String(d.routing.prefix).trim()) || "/figma";
        await d.sendFeishuTextToChat(extracted.chatId, `前缀模式：消息请以「${p}」开头（例：${p} 任务说明）。任意文本触发请设 FEISHU_CURSOR_MODE=direct；关本提示设 FEISHU_PREFIX_MISS_HINT=0。`);
      }
      return;
    }
    task = routedTask.task;

    const parentId = data.message && data.message.parent_id;
    const quoted = await d.augmentTaskWithQuotedParent(task, parentId, d.fetchMessage);
    task = quoted.task;
    const parentContextInjected = quoted.injected;

    task = d.normalizeSheetWriteTask(task);
    const userTaskForChain = task;
    task = await d.augmentTaskWithFeishuAtContext(task, {
      message: data.message,
      chatId: extracted.chatId,
      fetchMembers: d.fetchChatMemberOpenIdLines,
    });
    const mentionContextInjected = task !== userTaskForChain;
    const botOpenId = await d.getBotSelfOpenId();

    const rwKey = researchWorkflowStateKey(extracted.chatId, d.runtimeConfig.openclawFeishuSessionNamespace);
    let researchRow = loadResearchWorkflowState(rwKey);
    const rcFirst = d.runtimeConfig.researchClarifyFirst !== false;
    const rwV2 = !!d.runtimeConfig.researchWorkflowV2;

    let classificationMerge = null;
    let hadResearchContinuation = false;
    let planUserTask = userTaskForChain;
    let planTask = task;
    let memoryModePipeline = "default";

    const probeEnvelope = buildEnvelope({ data, extracted, routing: d.routing, runtimeConfig: d.runtimeConfig, task: planTask, userTask: planUserTask, receivedAtMs: tPipelineStart });
    const probePlanned = planner.prePlan({
      normalizedContext,
      envelope: probeEnvelope,
      task: planTask,
      userTask: planUserTask,
      classificationMerge: null,
      messageType: extracted.messageType,
      message: data.message,
      botOpenId,
      routing: d.routing,
      forceFull: /(feishu|larksuite)\./i.test(String(planTask)) || parentContextInjected,
      runtimeConfig: d.runtimeConfig,
      isRelayLikeTask: d.isRelayLikeTask,
      isReportLikeTask: d.isReportLikeTask,
      isResearchLikeTask: d.isResearchLikeTask,
      normalizeCursorTask: d.normalizeCursorTask,
      appendFeishuOpenIdMentionHint: d.appendFeishuOpenIdMentionHint,
      resolveCursorAgentProfile: d.resolveCursorAgentProfile,
      parentContextInjected,
    });
    const probeSessionId = (probePlanned.dispatch && probePlanned.dispatch.opts && String(probePlanned.dispatch.opts.sessionId || "").trim()) || "";
    const bumpFn = typeof d.bumpConversationEpoch === "function" ? d.bumpConversationEpoch : defaultMemoryEpoch.bumpConversationEpoch;
    const metaFn = typeof d.getLastTurnMetaForFresh === "function" ? d.getLastTurnMetaForFresh : defaultMemoryEpoch.getLastTurnMetaForFresh;
    const lastTurnMeta = metaFn({ conversationKey: rwKey, sessionId: probeSessionId || extracted.chatId });
    const freshEval = evaluateFreshReset({
      userText: userTaskForChain,
      researchRow,
      PHASE_CLARIFY_SENT,
      lastTurnMeta: lastTurnMeta || undefined,
      assistantLenThreshold: parseInt(process.env.FRESH_ACTIVE_ASSISTANT_MIN_LEN || "1200", 10),
    });
    if (freshEval.shouldReset) {
      clearResearchWorkflowState(rwKey);
      researchRow = null;
      classificationMerge = null;
      hadResearchContinuation = false;
      task = userTaskForChain;
      planUserTask = userTaskForChain;
      planTask = task;
      memoryModePipeline = "ignore";
      bumpFn({ conversationKey: rwKey, newEpoch: extracted.messageId || msgId || "" });
      if (d.telemetry) d.telemetry.emit("conversation_fresh_reset", { chatId: extracted.chatId, messageId: extracted.messageId || "", reason: freshEval.reason });
    }

    if (memoryModePipeline === "default") {
      const activeFollowup = activeWorkflowEvidence({ researchRow, PHASE_CLARIFY_SENT, lastTurnMeta: lastTurnMeta || undefined, assistantLenThreshold: parseInt(process.env.FRESH_ACTIVE_ASSISTANT_MIN_LEN || "1200", 10) });
      if (detectFollowupWeak(userTaskForChain) && activeFollowup) memoryModePipeline = "meta_followup";
    }

    if (researchRow && researchRow.phase === PHASE_CLARIFY_SENT) {
      const clarifyControl = parseClarifyControl(userTaskForChain);
      const explicitRestart = isExplicitResearchRestart(userTaskForChain);
      if (!explicitRestart && clarifyControl === "end") {
        clearResearchWorkflowState(rwKey);
        const endMsg = "好的，已结束本次调研。若要重新开始，请发送「新调研：<主题>」。";
        await d.state.rememberOutboundReply(extracted.chatId, endMsg);
        await d.sendFeishuChatReply(extracted.chatId, endMsg);
        return;
      }
      if (!explicitRestart && clarifyControl === "clarify") {
        classificationMerge = { workflowKey: "research", role: "specialized", taskSubtype: "none", taskType: "research", stage: "clarify", requiresTooling: true, requiresFullRunner: true, needsClarification: true, reasons: ["research_continue_clarify_user"] };
        hadResearchContinuation = true;
        if (researchRow.originalUserTask) planUserTask = researchRow.originalUserTask;
        if (researchRow.originalTask) planTask = researchRow.originalTask;
        task = planTask;
      } else if (!explicitRestart) {
        classificationMerge = { workflowKey: "research", role: "specialized", taskSubtype: "none", taskType: "research", stage: "execute", qaContext: clarifyControl === "next" ? "" : userTaskForChain.trim(), requiresTooling: true, requiresFullRunner: true, needsClarification: false, reasons: ["research_clarify_default_next_step"] };
        hadResearchContinuation = true;
        if (researchRow.originalUserTask) planUserTask = researchRow.originalUserTask;
        if (researchRow.originalTask) planTask = researchRow.originalTask;
        task = planTask;
      } else {
        clearResearchWorkflowState(rwKey);
        researchRow = null;
      }
    }

    if (!classificationMerge && rcFirst === false) {
      const early = planner.classify({ userTask: userTaskForChain, messageType: extracted.messageType, isRelayLikeTask: d.isRelayLikeTask, isReportLikeTask: d.isReportLikeTask, isResearchLikeTask: d.isResearchLikeTask });
      if (early.taskType === "research") classificationMerge = { stage: "execute", reasons: ["research_skip_clarify_env"] };
    }

    const envelope = buildEnvelope({ data, extracted, routing: d.routing, runtimeConfig: d.runtimeConfig, task: planTask, userTask: planUserTask, receivedAtMs: tPipelineStart });
    const planned = planner.finalPlan({
      normalizedContext,
      envelope,
      task: planTask,
      userTask: planUserTask,
      classificationMerge,
      messageType: extracted.messageType,
      message: data.message,
      botOpenId,
      routing: d.routing,
      forceFull: /(feishu|larksuite)\./i.test(String(planTask)) || parentContextInjected,
      runtimeConfig: d.runtimeConfig,
      isRelayLikeTask: d.isRelayLikeTask,
      isReportLikeTask: d.isReportLikeTask,
      isResearchLikeTask: d.isResearchLikeTask,
      normalizeCursorTask: d.normalizeCursorTask,
      appendFeishuOpenIdMentionHint: d.appendFeishuOpenIdMentionHint,
      resolveCursorAgentProfile: d.resolveCursorAgentProfile,
      parentContextInjected,
    });
    let classification = planned.classification;
    const relayDecision = planned.relayDecision;
    if (d.telemetry) d.telemetry.emit("classification", { chatId: extracted.chatId, messageId: extracted.messageId || "", taskType: classification.taskType, workflowKey: classification.workflowKey, confidence: classification.confidence, relayReason: relayDecision.reason, relayMode: relayDecision.mode, solutionMode: classification.solutionMode, memoryMode: memoryModePipeline });

    const relayBody = buildDeterministicRelayReply(userTaskForChain, data.message, botOpenId, d.isRelayLikeTask, d.runtimeConfig.relayPolicyMode);
    if (relayBody) {
      await d.state.rememberOutboundReply(extracted.chatId, relayBody);
      await d.sendFeishuChatReply(extracted.chatId, relayBody);
      if (d.telemetry) d.telemetry.emit("relay_short_circuit", { chatId: extracted.chatId, messageId: extracted.messageId || "", reason: relayDecision.reason, mode: relayDecision.mode });
      return;
    }

    const sessionIdForMemory = planned.dispatch && planned.dispatch.opts && typeof planned.dispatch.opts.sessionId === "string" && planned.dispatch.opts.sessionId.trim() ? planned.dispatch.opts.sessionId.trim() : "";
    const researchClarifySnapshot = { originalUserTask: planUserTask, originalTask: planTask };

    const memory = await d.assembleMemoryContext({ chatId: extracted.chatId, sessionId: sessionIdForMemory, conversationEpochKey: rwKey, memoryMode: memoryModePipeline, task });
    const memoryPack = memory && memory.memoryPack ? memory.memoryPack : null;
    let memoryInjected = false;
    if (memoryPack) {
      validateMemoryPack(memoryPack);
      memoryInjected = !!memoryPack.injected;
    } else if (memory && memory.injected) {
      memoryInjected = true;
      if (typeof memory.task === "string" && memory.task) task = memory.task;
    }

    const controlEnvelope = buildEnvelope({ data, extracted, routing: d.routing, runtimeConfig: d.runtimeConfig, task, userTask: planUserTask, receivedAtMs: tPipelineStart, classification });
    const controlPlanned = planner.rebaseFinalPlan({
      normalizedContext,
      basePlan: planned,
      classification,
      envelope: controlEnvelope,
      task,
      userTask: planUserTask,
      messageType: extracted.messageType,
      message: data.message,
      botOpenId,
      routing: d.routing,
      forceFull: /(feishu|larksuite)\./i.test(String(task)) || parentContextInjected,
      runtimeConfig: d.runtimeConfig,
      isRelayLikeTask: d.isRelayLikeTask,
      normalizeCursorTask: d.normalizeCursorTask,
      appendFeishuOpenIdMentionHint: d.appendFeishuOpenIdMentionHint,
      resolveCursorAgentProfile: d.resolveCursorAgentProfile,
      parentContextInjected,
    });
    const gateResult = applyPipelineGate({ classification: controlPlanned.classification });
    if (!gateResult.ok) {
      controlPlanned.classification = gateResult.classification;
      classification = gateResult.classification;
      if (d.telemetry) d.telemetry.emit("pipeline_gate_violation", { chatId: extracted.chatId, messageId: extracted.messageId || "", violations: gateResult.violations });
      if (d.logger && typeof d.logger.warn === "function") d.logger.warn("[pipeline-gate] classification violation", { violations: gateResult.violations });
    }
    if (controlPlanned.dispatch && controlPlanned.dispatch.route && Array.isArray(controlPlanned.dispatch.route.reasonCodes)) {
      controlPlanned.dispatch = planner.withDispatchRouteReasonCodes(controlPlanned.dispatch, gateResult.reasonCodes);
    }

    const safety = controlPlanned.safety;
    const prompt = controlPlanned.prompt;
    const runner = controlPlanned.runner;
    let dispatch = controlPlanned.dispatch;
    if (memoryPack && memoryInjected && dispatch) dispatch = planner.withDispatchOpts(dispatch, { memoryPack });
    if (memoryModePipeline === "ignore" && dispatch && dispatch.opts && dispatch.opts.gatewayRequest && typeof dispatch.opts.gatewayRequest === "object") {
      dispatch = planner.withGatewayRequest(dispatch, { sessionResetHint: true });
    }
    controlPlanned.dispatch = dispatch;

    const planClassification = controlPlanned.classification || {};
    const executionPolicy = resolveWorkflowExecutionPolicy({ classification: planClassification, planTask: (dispatch && dispatch.task) || "", qaContext: planClassification.qaContext, promptStage: prompt.stage });
    if (executionPolicy.multiAgentRequired && !rwV2 && planClassification.taskType === "research" && prompt.stage === "execute" && d.telemetry) {
      d.telemetry.emit("research_v2_forced_by_policy", { chatId: extracted.chatId, messageId: extracted.messageId || "" });
    }
    classification = planClassification;

    const taskContext = buildTaskContext({
      chatId: extracted.chatId,
      messageId: extracted.messageId,
      messageType: extracted.messageType,
      rawTask: extracted.text || "",
      task,
      userTask: userTaskForChain,
      normalizedTask: prompt.task,
      mediaText: prefixedMediaText,
      parentContextInjected,
      mentionContextInjected,
      memoryInjected,
      sheetTaskDetected: planClassification.taskSubtype === "sheet_write",
      classification: planClassification,
      relayDecision,
      safety,
      memory: memory || null,
      prompt,
      meta: { traceSource: "pipeline_v2", channelRuntimeMode: d.runtimeConfig.channelRuntimeMode },
    });
    if (d.telemetry) d.telemetry.emit("policy_decision", { traceId: taskContext.traceId, chatId: extracted.chatId, messageId: extracted.messageId || "", taskType: planClassification.taskType, workflowKey: planClassification.workflowKey, taskSize: executionPolicy.taskSize, multiAgentRequired: executionPolicy.multiAgentRequired, decisionReason: executionPolicy.decisionReason, forcedRuntimeV2: executionPolicy.forcedRuntimeV2 });

    if (workflowHintEnabled()) {
      const workflowHint = buildWorkflowTraceHint(planClassification, prompt);
      try {
        if (workflowHint) {
          await d.state.rememberOutboundReply(extracted.chatId, workflowHint);
          await d.sendFeishuTextToChat(extracted.chatId, workflowHint);
        }
      } catch (e) {
        d.logger.error("[feishu-workflow-hint] send failed", e && e.message);
      }
    }

    const ack = await sendTaskAck({ ackMode: d.ackMode, chatId: extracted.chatId, messageId: extracted.messageId, reactionEmoji: d.ackReactionEmoji, allowFallbackText: d.ackFallbackText, sendFeishuTextToChat: d.sendFeishuTextToChat, addFeishuMessageReaction: d.addFeishuMessageReaction, getCursorTaskAckMessage: d.getCursorTaskAckMessage });
    if (d.telemetry) d.telemetry.emit("ack_sent", { traceId: taskContext.traceId, chatId: extracted.chatId, messageId: extracted.messageId || "", ackMode: ack.mode, ackSent: ack.sent });

    const queued = await d.taskQueue.enqueue(async () => {
      const originalExecution = async () => {
        if (planClassification.role === "specialized") {
          return runSpecializedSoloWithTrace(d.runCursorAdhocPrompt, { dispatch, classification: planClassification, executionPolicy, promptStage: prompt.stage });
        }
        return d.runCursorAdhocPrompt(task, dispatch.opts);
      };

      const wf = selectWorkflowPlugin({ classification: planClassification });
      if (wf) {
        const wfResult = await wf.run({
          classification: planClassification,
          prompt,
          executionPolicy,
          rwV2,
          envelope: controlEnvelope,
          runtimeConfig: d.runtimeConfig,
          dispatch,
          messageId: extracted.messageId,
          logger: d.logger,
          task,
          runOpenclawGatewayPrompt: d.runCursorAdhocPrompt,
          next: originalExecution,
        });
        if (wfResult && wfResult.error) throw wfResult.error;
        if (wfResult && wfResult.type === "override") return wfResult.result;
        if (wfResult && Object.prototype.hasOwnProperty.call(wfResult, "result")) return wfResult.result;
      }
      return originalExecution();
    });

    const rawQueued = queued.result || {};
    let r = normalizeExecutionResult({ ...rawQueued, executionPolicy, multiAgentRequired: executionPolicy.multiAgentRequired, runnerType: runner.runnerType, backendMode: runner.backendMode, queueMode: queued.metadata && queued.metadata.mode, queueWaitMs: queued.metadata && queued.metadata.queueWaitMs, queueDepth: queued.metadata && queued.metadata.queueDepth, agentProfile: runner.agentProfile, permissionMode: runner.permissionMode, cleanCwd: runner.cleanCwd, ackMode: ack.mode, degradeReason: runner.degradeReason, routeClass: dispatch.route && dispatch.route.routeClass, routeAgentId: dispatch.route && dispatch.route.agentId, routeReasonCodes: dispatch.route && dispatch.route.reasonCodes, sessionId: dispatch.opts && dispatch.opts.sessionId });
    const effectiveMultiAgent = r.runtimeRunTrace && typeof r.runtimeRunTrace.multiAgentRequired === "boolean" ? r.runtimeRunTrace.multiAgentRequired : !!executionPolicy.multiAgentRequired;
    r = normalizeExecutionResult({ ...r, multiAgentRequired: !!effectiveMultiAgent });
    const sv = validateSpecializedRuntime({ classification: planClassification, multiAgentRequired: !!effectiveMultiAgent, runtimeRunTrace: r.runtimeRunTrace });
    if (!sv.ok && planClassification.role === "specialized") {
      if (d.telemetry) d.telemetry.emit("specialized_trace_missing", { chatId: extracted.chatId, messageId: extracted.messageId || "", code: sv.code, reason: sv.reason });
      r = normalizeExecutionResult({ ...r, code: 1, stdout: `交付被阻断（${sv.code}）：${sv.reason}`, stderr: String(sv.reason || ""), executionPolicy, multiAgentRequired: executionPolicy.multiAgentRequired });
    }
    taskContext.execution = r;
    taskContext.profile = runner.agentProfile;

    if (rcFirst && classification.taskType === "research" && prompt.stage === "clarify" && !hadResearchContinuation && r.code === 0) {
      markResearchClarifySent(rwKey, { originalUserTask: researchClarifySnapshot.originalUserTask, originalTask: researchClarifySnapshot.originalTask });
    }

    if (d.telemetry) d.telemetry.emit("runner_completed", { traceId: taskContext.traceId, chatId: extracted.chatId, messageId: extracted.messageId || "", taskType: classification.taskType, runnerType: r.runnerType, queueMode: r.queueMode, queueWaitMs: r.queueWaitMs, code: r.code, routeClass: r.routeClass, routeAgentId: r.routeAgentId, sessionId: r.sessionId, researchContinuation: hadResearchContinuation, researchWorkflowV2: rwV2, researchMeta: r.researchMeta || null, taskSize: executionPolicy.taskSize, multiAgentRequired: executionPolicy.multiAgentRequired, policyDecisionReason: executionPolicy.decisionReason });

    const timingRef = typeof extracted.messageCreateTimeMs === "number" && Number.isFinite(extracted.messageCreateTimeMs) ? extracted.messageCreateTimeMs : tPipelineStart;
    let formattedReply = d.formatCursorAdhocReply(r, { sourceMessageId: String(extracted.messageId || msgId || ""), onRequestIdMismatch: () => d.telemetry && d.telemetry.emit("artifact_request_id_mismatch", { chatId: extracted.chatId, messageId: extracted.messageId || "" }) });
    if (planClassification.workflowKey === "research" && prompt.stage === "execute" && typeof r.code === "number" && r.code === 0) {
      const stripped = stripLeadingProcessNarration(formattedReply);
      if (stripped.length < formattedReply.length && d.telemetry) d.telemetry.emit("reply_strip_process_narration", { chatId: extracted.chatId, messageId: extracted.messageId || "", removedChars: formattedReply.length - stripped.length });
      formattedReply = stripped;
    }
    if (prompt.stage === "clarify" && clarifyControlFooterEnabled()) {
      const footer = buildClarifyControlFooter();
      if (footer && !String(formattedReply).includes("回复选项：")) formattedReply = `${String(formattedReply || "").trim()}\n\n${footer}`;
    }

    const body = d.appendFeishuTimingToReplyBody(formattedReply, Date.now(), timingRef, extracted);
    const finalBody = sanitizeRelayReplyBody(body, userTaskForChain, data.message, botOpenId, d.isRelayLikeTask);
    const outputResult = await runOutputPlugins({
      deps: d,
      data,
      extracted,
      classification,
      prompt,
      planUserTask,
      userTaskForChain,
      executionResult: r,
      taskContext,
    }, {
      replyBody: finalBody,
      executionResult: r,
      metadata: {},
    }, d.outputPlugins);
    let replyToSend = outputResult && typeof outputResult.replyBody === "string" ? outputResult.replyBody : finalBody;
    const outputMetadata = (outputResult && outputResult.metadata) || {};
    const exportKind = outputMetadata.exportKind || null;
    const longReplyDocExport = !!outputMetadata.longReplyDocExport;
    if (typeof outputMetadata.memoryReplyBody === "string" && outputMetadata.memoryReplyBody.trim()) taskContext.memoryReplyBody = outputMetadata.memoryReplyBody;

    if (classification.taskType === "research" && prompt.stage === "execute") {
      if (r.code !== 0) {
        const errText = String(r.stderr || r.stdout || (r.error && r.error.message) || "").trim().slice(0, 8000);
        const artBody = typeof taskContext.memoryReplyBody === "string" && taskContext.memoryReplyBody.trim() ? taskContext.memoryReplyBody : replyToSend;
        writeFailedResearchSnapshot(rwKey, { requestId: String(extracted.messageId || msgId || ""), originalUserTask: String(planUserTask || ""), workflow: "research", stage: "execute", error: errText || `exit:${r.code}`, lastKnownArtifactRef: firstHttpUrl(artBody) });
        if (d.telemetry) d.telemetry.emit("research_execute_failed_snapshot", { chatId: extracted.chatId, messageId: extracted.messageId || "", code: r.code });
      }
      clearResearchWorkflowState(rwKey);
    }

    const memoryPersistBody = typeof taskContext.memoryReplyBody === "string" && taskContext.memoryReplyBody.trim() ? taskContext.memoryReplyBody : replyToSend;
    const replySegments = Array.isArray(outputMetadata.replySegments) && outputMetadata.replySegments.length > 1 ? outputMetadata.replySegments : null;
    const repliesToSend = replySegments || [replyToSend];
    for (const outboundReply of repliesToSend) {
      await d.state.rememberOutboundReply(extracted.chatId, outboundReply);
      await d.sendFeishuChatReply(extracted.chatId, outboundReply);
    }

    void d.persistMemoryTurn({ chatId: extracted.chatId, sessionId: sessionIdForMemory, conversationEpochKey: rwKey, userTask: userTaskForChain, replyBody: memoryPersistBody, cursorResult: r, taskContext, classification, workflowKey: String((classification && classification.workflowKey) || (classification && classification.taskType) || ""), artifactRef: firstHttpUrl(memoryPersistBody) }).then((ret) => {
      if (ret && ret.ok) d.logger.log("[feishu-memory] persisted(v2) chat=%s session=%s turns=%s", extracted.chatId, sessionIdForMemory || "(chatId)", ret.turnCount);
    }).catch((e) => d.logger.error("[feishu-memory] persist unexpected error(v2):", e && e.message));

    await d.maybeChainAfterCursor({ chatId: extracted.chatId, cursorResult: r, replyBody: replyToSend, userTaskBeforeInject: userTaskForChain, sendFeishuChatReply: d.sendFeishuChatReply, getBotSelfOpenId: d.getBotSelfOpenId });
    if (d.telemetry) d.telemetry.emit("reply_sent", { traceId: taskContext.traceId, chatId: extracted.chatId, messageId: extracted.messageId || "", taskType: classification.taskType, replyStatus: "sent", exportKind: exportKind || null, longReplyDocExport: !!longReplyDocExport });
  }

  return async function runPipelineV2(data) {
    return runPipelineV2Legacy(data);
  };
}

module.exports = {
  createFeishuCursorPipelineV2,
};
