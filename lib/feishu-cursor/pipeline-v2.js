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
const {
  maybeAppendFeishuResearchDocUrl,
  exportEnabled,
  mergeLongReplyDocExportKind,
} = require("../feishu-docx-export");
const { buildFeishuTaskEnvelope } = require("../feishu-channel/models/feishu-task-envelope");
const { planOpenclawExecution } = require("../openclaw-control-plane/request-planner");
const { applyPipelineGate } = require("./runtime/pipeline-gate-adapter");
const { classifyOpenclawIntent } = require("../openclaw-control-plane/intent-router");
const { resolveOpenclawResultPolicy } = require("../openclaw-control-plane/result-policy");
const { runResearchWorkflowV2 } = require("../openclaw-control-plane/research-workflow-runner");
const { resolveWorkflowExecutionPolicy } = require("../openclaw-control-plane/workflow-execution-policy");
const { validateSpecializedRuntime } = require("./runtime/multi-agent-runtime-guards");
const { runSpecializedSoloWithTrace } = require("./runtime/specialized-solo-runner");
const { appendLlmUsageFooterToReply } = require("../feishu-llm-usage-footer");
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

// ✅ 插件 registry（唯一新增）
const { selectWorkflow } = require("./workflows/plugin-registry");

function isExplicitResearchRestart(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  return /^(新调研|重新调研|重开调研|另起调研|换个调研|重新开始调研)[:：\s]/i.test(s);
}

function parseClarifyControl(text) {
  const s = String(text || "").trim();
  if (!s) return "";
  if (/^(结束任务|结束|取消|停止|算了|不用了)\s*$/i.test(s)) return "end";
  if (/^(继续澄清|继续提问|继续问|再澄清)\s*$/i.test(s)) return "clarify";
  if (/^(继续下一步|下一步|继续执行|开始执行)\s*$/i.test(s)) return "next";
  return "";
}

function createFeishuCursorPipelineV2(deps) {
  const d = deps || {};

  if (!d.taskQueue) {
    d.taskQueue = {
      mode: "inline",
      enqueue: async (fn) => ({ result: await fn(), metadata: {} }),
    };
  }

  const parseInboundEvent = d.parseInboundEvent || parseWsImDispatchPayload;

  async function runPipelineV2Legacy(data) {
    const extracted = parseInboundEvent(data);

    const routedTask = resolveTaskAfterRouting(d.routing, extracted.text || "");
    if (!routedTask.ok) return;

    let task = routedTask.task;
    const userTaskForChain = task;

    const planned = planOpenclawExecution({
      envelope: buildFeishuTaskEnvelope({ data, extracted, routing: d.routing, task }),
      task,
      userTask: task,
      routing: d.routing,
    });

    const classification = planned.classification || {};

    const prompt = planned.prompt;
    const dispatch = planned.dispatch;

    const ack = await sendTaskAck({
      ackMode: d.ackMode,
      chatId: extracted.chatId,
      messageId: extracted.messageId,
      reactionEmoji: d.ackReactionEmoji,
      allowFallbackText: d.ackFallbackText,
      sendFeishuTextToChat: d.sendFeishuTextToChat,
      addFeishuMessageReaction: d.addFeishuMessageReaction,
      getCursorTaskAckMessage: d.getCursorTaskAckMessage,
    });

    const queued = await d.taskQueue.enqueue(async () => {

      const originalExecution = async () => {
        return d.runCursorAdhocPrompt(dispatch.task, dispatch.opts);
      };

      const wf = selectWorkflow({ classification });

      if (wf) {
        const r = await wf.run({
          classification,
          next: originalExecution,
        });
        if (r && r.result) return r.result;
      }

      return originalExecution();
    });

    const raw = queued.result || {};
    const r = normalizeExecutionResult(raw);

    const reply = d.formatCursorAdhocReply(r);

    await d.sendFeishuChatReply(extracted.chatId, reply);

    await d.persistMemoryTurn({
      chatId: extracted.chatId,
      userTask: userTaskForChain,
      replyBody: reply,
    });
  }

  return async function runPipelineV2(data) {
    return runPipelineV2Legacy(data);
  };
}

module.exports = {
  createFeishuCursorPipelineV2,
};
