"use strict";

const { OutputPlugin } = require("./output-plugin-interface");
const {
  maybeAppendFeishuResearchDocUrl,
  exportEnabled,
  mergeLongReplyDocExportKind,
} = require("../../feishu-docx-export");
const { resolveOpenclawResultPolicy } = require("../../openclaw-control-plane/result-policy");

class DocExportPlugin extends OutputPlugin {
  constructor() {
    super();
    this.name = "docExportPlugin";
  }

  match(_ctx, _result) {
    return true;
  }

  async process(ctx, result) {
    const c = ctx || {};
    const d = c.deps || {};
    const logger = d.logger || console;
    const r = (result && result.executionResult) || c.executionResult || {};
    const replyBody = result && typeof result.replyBody === "string" ? result.replyBody : "";
    const classification = c.classification || {};
    const prompt = c.prompt || {};
    const extracted = c.extracted || {};
    const userTaskForChain = c.userTaskForChain || c.userTask || "";
    const planUserTask = c.planUserTask || userTaskForChain;

    const resultPolicy = resolveOpenclawResultPolicy({
      userTask: planUserTask,
      classification,
      structuredResult: r.structuredResult,
      resolveFeishuDocExportKind: d.resolveFeishuDocExportKind,
      isResearchLikeTask: d.isResearchLikeTask,
      isReportLikeTask: d.isReportLikeTask,
    });
    const longMerge = mergeLongReplyDocExportKind({
      exportKind: resultPolicy.exportKind,
      replyBody,
      code: r.code,
      chatId: extracted.chatId,
    });
    const exportKind = longMerge.exportKind;
    const longReplyDocExport = longMerge.longReplyForced;
    const metadata = {
      exportKind: exportKind || null,
      longReplyDocExport: !!longReplyDocExport,
    };

    if ((process.env.FEISHU_DOC_EXPORT_DEBUG || "").trim() === "1") {
      (logger.log || console.log).call(logger, "[feishu-docx-export] pipeline", JSON.stringify({
        exportEnabled: exportEnabled(),
        exportKind,
        longReplyDocExport,
        taskHead: String(userTaskForChain || "").slice(0, 160),
      }));
    }

    let nextReplyBody = replyBody;
    const docHook = d.exportResearchDocHook || maybeAppendFeishuResearchDocUrl;
    try {
      if (prompt.stage !== "clarify" && exportKind) {
        const enriched = await docHook({
          userTask: userTaskForChain,
          replyBody,
          exportKind,
          logger,
        });
        if (enriched && typeof enriched.replyBody === "string") nextReplyBody = enriched.replyBody;
        if (enriched && typeof enriched.memoryReplyBody === "string" && enriched.memoryReplyBody.trim()) {
          metadata.memoryReplyBody = enriched.memoryReplyBody;
        }
        if (enriched && typeof enriched.docUrl === "string") metadata.docUrl = enriched.docUrl;
        if (enriched && Object.prototype.hasOwnProperty.call(enriched, "exportOk")) metadata.exportOk = !!enriched.exportOk;
      }
    } catch (e) {
      (logger.error || console.error).call(logger, "[feishu-docx-export] hook error", e && e.message);
    }

    return {
      replyBody: nextReplyBody,
      metadata,
    };
  }
}

const docExportPlugin = new DocExportPlugin();

module.exports = {
  DocExportPlugin,
  docExportPlugin,
};
