"use strict";

const { OutputPlugin } = require("./output-plugin-interface");
const {
  maybeAppendFeishuResearchDocUrl,
  exportEnabled,
  mergeLongReplyDocExportKind,
} = require("../../feishu-docx-export");
const { resolveOpenclawResultPolicy } = require("../../openclaw-control-plane/result-policy");

class DocExportPlugin extends OutputPlugin {
  match(_ctx, result) {
    return !!result && typeof result.replyBody === "string";
  }

  async process(ctx, result) {
    const c = ctx || {};
    const replyBody = String((result && result.replyBody) || "");
    const previousMetadata = result && result.metadata && typeof result.metadata === "object" ? result.metadata : {};
    const logger = c.logger || console;
    const executionResult = c.executionResult || {};

    const resultPolicy = resolveOpenclawResultPolicy({
      userTask: c.resultPolicyUserTask,
      classification: c.classification,
      structuredResult: executionResult.structuredResult,
      resolveFeishuDocExportKind: c.resolveFeishuDocExportKind,
      isResearchLikeTask: c.isResearchLikeTask,
      isReportLikeTask: c.isReportLikeTask,
    });
    const longMerge = mergeLongReplyDocExportKind({
      exportKind: resultPolicy.exportKind,
      replyBody,
      code: executionResult.code,
      chatId: c.chatId,
    });
    const exportKind = longMerge.exportKind;
    const longReplyDocExport = !!longMerge.longReplyForced;
    const metadata = {
      ...previousMetadata,
      exportKind: exportKind || null,
      longReplyDocExport,
      hasFeishuDocArtifact: !!resultPolicy.hasFeishuDocArtifact,
    };

    if ((process.env.FEISHU_DOC_EXPORT_DEBUG || "").trim() === "1") {
      logger.log("[feishu-docx-export] pipeline", JSON.stringify({
        exportEnabled: exportEnabled(),
        exportKind,
        longReplyDocExport,
        taskHead: String(c.userTask || "").slice(0, 160),
      }));
    }

    if (c.promptStage === "clarify" || !exportKind) {
      return { replyBody, metadata };
    }

    const docHook = c.exportResearchDocHook || maybeAppendFeishuResearchDocUrl;
    try {
      const enriched = await docHook({
        userTask: c.userTask,
        replyBody,
        exportKind,
        logger,
      });
      const nextMetadata = { ...metadata };
      let nextReplyBody = replyBody;
      if (enriched && typeof enriched.replyBody === "string") nextReplyBody = enriched.replyBody;
      if (enriched && typeof enriched.memoryReplyBody === "string" && enriched.memoryReplyBody.trim()) {
        nextMetadata.memoryReplyBody = enriched.memoryReplyBody;
      }
      if (enriched && typeof enriched.docUrl === "string") nextMetadata.docUrl = enriched.docUrl;
      if (enriched && typeof enriched.exportOk === "boolean") nextMetadata.exportOk = enriched.exportOk;
      return { replyBody: nextReplyBody, metadata: nextMetadata };
    } catch (e) {
      logger.error("[feishu-docx-export] hook error", e && e.message);
      return { replyBody, metadata };
    }
  }
}

const docExportPlugin = new DocExportPlugin();

module.exports = {
  DocExportPlugin,
  docExportPlugin,
};
