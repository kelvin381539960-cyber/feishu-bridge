"use strict";

const { createFeishuChannelPluginRuntime } = require("./plugin-runtime");
const { augmentTaskWithQuotedParent } = require("../feishu-quoted-parent-context");
const {
  getCursorRoutingConfig,
  isReportLikeTask,
  isResearchLikeTask,
  normalizeCursorTask,
  normalizeSheetWriteTask,
  resolveCursorAgentProfile,
  appendFeishuOpenIdMentionHint,
  isRelayLikeTask,
} = require("../feishu-cursor-route");
const { runOpenclawGatewayPrompt } = require("../openclaw-gateway-adhoc");
const { augmentTaskWithFeishuAtContext } = require("../feishu-at-context");
const { maybeChainAfterCursor } = require("../feishu-chain-next");
const {
  assembleMemoryContext,
  persistMemoryTurn,
  bumpConversationEpoch,
  getLastTurnMetaForFresh,
} = require("../feishu-session-memory");
const {
  describeImage,
  extractFileText,
  transcribeAudio,
  processVideo,
  processSticker,
} = require("../media-process");
const {
  loadFeishuCursorConfig,
} = require("../feishu-cursor/config/load-feishu-cursor-config");
const {
  createInMemoryPipelineState,
} = require("../feishu-cursor/ingestion/in-memory-state");
const {
  createFileStateStore,
} = require("../feishu-cursor/ingestion/state-store");
const {
  createFeishuCursorPipelineV2,
} = require("../feishu-cursor/pipeline-v2");
const {
  createTaskQueue,
} = require("../feishu-cursor/runner/task-queue");
const {
  createTelemetry,
} = require("../feishu-cursor/observability/telemetry");

function createFeishuChannelRunner() {
  const runtimeConfig = loadFeishuCursorConfig(process.env);
  const routing = getCursorRoutingConfig();
  const channelPlugin = createFeishuChannelPluginRuntime();
  const pipelineTelemetry = createTelemetry({
    logger: console,
    filePath: runtimeConfig.telemetryFile,
  });
  const stateStore = runtimeConfig.stateStoreFile
    ? createFileStateStore(runtimeConfig.stateStoreFile)
    : undefined;
  const pipelineState = createInMemoryPipelineState({
    dedupTtlMs: runtimeConfig.dedupTtlMs,
    mergeDebounceMs:
      Number(process.env.FEISHU_MERGE_FORWARD_DEBOUNCE_MS) || 2000,
    store: stateStore,
  });
  const taskQueue = createTaskQueue({
    mode: runtimeConfig.queueMode,
  });

  const runFeishuCursorPipeline = createFeishuCursorPipelineV2({
    runtimeConfig,
    routing,
    state: pipelineState,
    taskQueue,
    telemetry: pipelineTelemetry,
    logger: {
      log: (...args) => console.log(...args),
      error: (...args) => console.error(...args),
    },
    enqueueEvent: (evt) => {
      runFeishuCursorPipeline(evt).catch((e) =>
        console.error("[feishu-ws-cursor] pipeline enqueue error", e)
      );
    },
    parseInboundEvent: channelPlugin.parseInboundEvent,
    shouldSkipGroupMessageWithoutAtBot: channelPlugin.shouldSkipGroupMessageWithoutAtBot,
    sendFeishuTextToChat: channelPlugin.sendText,
    sendFeishuChatReply: channelPlugin.sendReply,
    addFeishuMessageReaction: channelPlugin.addReaction,
    getBotSelfOpenId: channelPlugin.getBotSelfOpenId,
    fetchChatMemberOpenIdLines: channelPlugin.fetchChatMemberOpenIdLines,
    getCursorTaskAckMessage: channelPlugin.getAckMessage,
    runCursorAdhocPrompt: runOpenclawGatewayPrompt,
    formatCursorAdhocReply: channelPlugin.formatReply,
    appendFeishuTimingToReplyBody: channelPlugin.appendTiming,
    augmentTaskWithQuotedParent,
    normalizeSheetWriteTask,
    augmentTaskWithFeishuAtContext,
    assembleMemoryContext,
    persistMemoryTurn,
    bumpConversationEpoch,
    getLastTurnMetaForFresh,
    maybeChainAfterCursor,
    isReportLikeTask,
    isResearchLikeTask,
    normalizeCursorTask,
    appendFeishuOpenIdMentionHint,
    resolveCursorAgentProfile,
    isRelayLikeTask,
    downloadImage: channelPlugin.downloadImage,
    downloadResource: channelPlugin.downloadResource,
    fetchMessage: channelPlugin.fetchMessage,
    cleanupFile: channelPlugin.cleanupFile,
    describeImage,
    extractFileText,
    transcribeAudio,
    processVideo,
    processSticker,
    ackMode: (process.env.CURSOR_TASK_ACK_MODE || "reaction").trim().toLowerCase(),
    ackReactionEmoji: (process.env.CURSOR_TASK_ACK_REACTION_EMOJI || "Typing").trim(),
    ackFallbackText:
      (process.env.CURSOR_TASK_ACK_REACTION_FALLBACK_TEXT || "1").trim() !== "0",
  });

  async function handleEvent(data) {
    const mt = data && data.message && data.message.message_type;
    const cid = data && data.message && data.message.chat_id;
    console.log("[feishu-ws-cursor] >>> im.message.receive_v1 type=%s chat=%s", mt, cid);
    return runFeishuCursorPipeline(data);
  }

  return {
    runtimeConfig,
    routing,
    channelPlugin,
    handleEvent,
  };
}

module.exports = {
  createFeishuChannelRunner,
};
