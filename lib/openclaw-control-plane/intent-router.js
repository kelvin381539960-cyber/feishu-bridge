"use strict";

const { classifyTask } = require("../feishu-cursor/policies/task-classifier");
const { resolveFeishuDocExportKind } = require("../feishu-docx-export");

function classifyOpenclawIntent(input) {
  const i = input || {};
  return classifyTask({
    task: i.userTask,
    messageType: i.messageType,
    isRelayLikeTask: i.isRelayLikeTask,
    isReportLikeTask: i.isReportLikeTask,
    isResearchLikeTask: i.isResearchLikeTask,
  });
}

function resolveDocExportIntent(input) {
  const i = input || {};
  return resolveFeishuDocExportKind(
    i.userTask,
    {
      isResearchLikeTask: i.isResearchLikeTask,
      isReportLikeTask: i.isReportLikeTask,
    },
    i.classification || null
  );
}

module.exports = {
  classifyOpenclawIntent,
  resolveDocExportIntent,
};
