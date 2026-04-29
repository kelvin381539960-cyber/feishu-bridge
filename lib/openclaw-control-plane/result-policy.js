"use strict";

const { resolveDocExportIntent } = require("./intent-router");

function resolveOpenclawResultPolicy(input) {
  const i = input || {};
  const classification = i.classification || null;
  const structuredResult =
    i.structuredResult && typeof i.structuredResult === "object" ? i.structuredResult : null;
  const artifacts =
    structuredResult && Array.isArray(structuredResult.artifacts) ? structuredResult.artifacts : [];
  const hasFeishuDocArtifact = artifacts.some(
    (artifact) => artifact && typeof artifact === "object" && artifact.kind === "feishu_doc"
  );
  const exportKind =
    typeof i.resolveFeishuDocExportKind === "function"
      ? i.resolveFeishuDocExportKind(i.userTask, classification)
      : resolveDocExportIntent({
          userTask: i.userTask,
          classification,
          isResearchLikeTask: i.isResearchLikeTask,
          isReportLikeTask: i.isReportLikeTask,
        });

  return {
    exportKind: hasFeishuDocArtifact ? null : exportKind,
    hasFeishuDocArtifact,
  };
}

module.exports = {
  resolveOpenclawResultPolicy,
};
