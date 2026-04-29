/**
 * 飞书回复尾注：端到端耗时 R=（与模型尾注 M/API 同一行拼接）。
 * M = Cursor 本地计时 duration_ms；API = 上游 API 计时 duration_api_ms（见回复说明）。
 */

function timingAnchorLabel(extracted) {
  if (
    extracted &&
    typeof extracted.messageCreateTimeMs === "number" &&
    Number.isFinite(extracted.messageCreateTimeMs)
  ) {
    return "飞书消息时间";
  }
  return "本服务收到事件";
}

function getCursorMetaStyle() {
  const v = (process.env.FEISHU_CURSOR_META_STYLE || "").trim().toLowerCase();
  if (v === "0" || v === "off" || v === "none" || v === "false") return "off";
  if (v === "full") return "full";
  return "compact";
}

function isCursorMetaFullStyle() {
  return getCursorMetaStyle() === "full";
}

/**
 * @param {number} tEndMs - 一般为即将调用发信 API 前的 Date.now()
 * @param {number} timingRefMs - 飞书 create_time 或本服务开始处理时间
 * @param {{ messageCreateTimeMs?: number }|string} extractedOrLabel
 */
function buildFeishuTimingFooter(tEndMs, timingRefMs, extractedOrLabel) {
  if (
    timingRefMs == null ||
    !Number.isFinite(timingRefMs) ||
    !Number.isFinite(tEndMs)
  ) {
    return "";
  }
  const label =
    typeof extractedOrLabel === "string"
      ? extractedOrLabel
      : timingAnchorLabel(extractedOrLabel);
  const sec = Math.max(0, (tEndMs - timingRefMs) / 1000).toFixed(1);
  if (getCursorMetaStyle() === "off") {
    return "";
  }
  if (isCursorMetaFullStyle()) {
    return `\n---\n⏱ 端到端约 ${sec}s（${label} → 提交飞书发信）\n说明：不含网络往返与手机端展示，你侧通常再晚 0.3～3s。`;
  }
  return ` R=${sec}s`;
}

/**
 * compact 时助手末行无换行，需去掉 stdout 尾部换行后再拼 R=；full 时直接追加块。
 */
function appendFeishuTimingToReplyBody(body, tEndMs, timingRefMs, extractedOrLabel) {
  const footer = buildFeishuTimingFooter(
    tEndMs,
    timingRefMs,
    extractedOrLabel
  );
  if (!footer) return body;
  if (isCursorMetaFullStyle()) {
    return body + footer;
  }
  return body.replace(/\n+$/, "") + footer + "\n";
}

module.exports = {
  timingAnchorLabel,
  getCursorMetaStyle,
  isCursorMetaFullStyle,
  buildFeishuTimingFooter,
  appendFeishuTimingToReplyBody,
};
