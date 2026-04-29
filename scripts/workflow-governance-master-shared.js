"use strict";

/**
 * 与飞书「子表标题」规则对齐：与 create-feishu-flow-workbook 一致，便于总表超链接。
 * 飞书子表标题限制见开放平台（特殊字符需替换）；过长截断。
 */
function sanitizeSheetTitle(file, index) {
  const cleaned = String(file || "")
    .replace(/[\\/?*[\]:]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const prefix = String(index + 2).padStart(2, "0") + "_";
  const maxLen = 31;
  const allowed = Math.max(1, maxLen - prefix.length);
  const sliced = (cleaned || `Sheet${index + 2}`).slice(0, allowed);
  return prefix + sliced;
}

module.exports = {
  sanitizeSheetTitle,
};
