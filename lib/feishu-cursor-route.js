/**
 * Cursor 触发规则（Webhook 与 长连接 共用，避免分叉）。
 */

function buildChatAllowedFn() {
  const enforce =
    (process.env.FEISHU_CURSOR_ENFORCE_ALLOWED_CHAT_IDS || "").trim() === "1";
  const allowed = process.env.FEISHU_CURSOR_ALLOWED_CHAT_IDS;
  return (chatId) => {
    if (!enforce) return true;
    if (!allowed || !String(allowed).trim()) return true;
    const set = new Set(
      String(allowed)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    return set.has(chatId);
  };
}

function getCursorRoutingConfig() {
  const mode = (process.env.FEISHU_CURSOR_MODE || "prefix").trim().toLowerCase();
  let prefix = (process.env.FEISHU_CURSOR_TRIGGER_PREFIX || "/figma").trim();
  if (!prefix) prefix = "/figma";
  return {
    enabled: process.env.FEISHU_CURSOR_TRIGGER_ENABLED === "1",
    direct: mode === "direct",
    prefix,
    chatAllowed: buildChatAllowedFn(),
  };
}

function cursorShouldRun(routing, extracted) {
  if (!extracted || extracted.skip) return false;
  if (!extracted.text || !extracted.chatId) return false;
  if (!routing.enabled) return false;
  if (!routing.chatAllowed(extracted.chatId)) return false;
  if (routing.direct) return true;
  return extracted.text.startsWith(routing.prefix);
}

function cursorTaskText(routing, extracted) {
  if (routing.direct) return String(extracted.text).trim();
  return extracted.text.slice(routing.prefix.length).trim();
}

function isReportLikeTask(taskText) {
  const s = String(taskText || "");

  // 只有同时具备“生成动作” + “文档/报告目标”，才触发云文档正文生成。
  const hasCreateIntent =
    /生成|输出|导出|写入|同步|落到|沉淀|整理成|做成|创建|新建|保存到|放到/i.test(s);

  const hasDocTarget =
    /飞书文档|飞书云文档|在线文档|云文档|readme|markdown|文档形式|报告形式|数据报告|调研报告|方案文档|总结文档|说明文档/i.test(s);

  return hasCreateIntent && hasDocTarget;
}

function isResearchLikeTask(taskText) {
  const s = String(taskText || "");
  return /调研|技术调研|竞品分析|方案调研|深度研究|深度分析|技术分析|帮.{0,6}研究|帮.{0,6}调研|research(?:ing|ed)?|investigate|deep.?dive/i.test(s);
}

function isRelayLikeTask(taskText) {
  const s = String(taskText || "");
  if (!s) return false;
  return (
    /通过.+问|帮.+问一下|替.+问一下|代.+问一下|转告|转述|传话/i.test(s) &&
    (/@|_user_\d+/i.test(s) || /小智|jarvis|机器人/i.test(s))
  );
}

function normalizeCursorTask(taskText) {
  const raw = String(taskText || "").trim();
  if (!raw) return raw;
  if (isReportLikeTask(raw) || isResearchLikeTask(raw)) {
    return (
      `${raw}\n\n` +
      `请直接输出适合飞书云文档的**完整** Markdown（多级标题、列表、表格、参考链接）；标准输出将用于服务端写入云文档；若已开启云文档导出，飞书聊天通常只展示「概要 + 云文档链接」，**禁止**用短摘要代替须写入云文档的正文。\n` +
      `调研类须同时写入 \`docs/research/<slug>.md\`；不要创建 Word/PDF。`
    );
  }
  if (isRelayLikeTask(raw)) {
    return (
      `${raw}\n\n` +
      `这是飞书群聊里的“代问/转述”任务。请先正确判断谁通过谁去问谁，然后直接给出最终要发的简短文案。\n` +
      `要求：\n` +
      `1. 默认只给最终答案，不要复述你的分析过程\n` +
      `2. 不要解释占位符映射，不要输出 open_id 对照表，不要给教程\n` +
      `3. 不要附带无关的天气参考、背景知识、Markdown 标题、表格或代码块，除非用户明确要求\n` +
      `4. 若需要 @，直接在最终文案里使用已注入的 open_id；若用户原文中的收发关系不清，再用一句话指出歧义\n` +
      `5. 只允许使用用户原消息里明确出现的人物/机器人；不要擅自引入第三方（例如未提到的其它机器人）\n` +
      `6. 用户消息开头用于触发本机器人的 @（例如“@小智”）通常不是最终文案的一部分；除非用户明确要求，否则不要把对本机器人的称呼抄进最终文案\n` +
      `7. 若消息里出现“他/她/TA”等未展开代词且指代不清，请明确指出歧义；不要擅自默认指向唯一 @ 对象`
    );
  }
  return raw;
}

/**
 * Cursor-only 双档：fast（ask + 小模型）vs full（--trust 等，类 Agent）。
 * direct 模式：默认 full；若需恢复旧行为设 FEISHU_CURSOR_DIRECT_PROFILE=fast。
 * 以 /figma 或 CURSOR_FULL_TASK_PREFIXES（默认 /code,/编程）开头则 full 并去前缀。
 * prefix 模式：能进到这里的任务已是「触发后正文」，按编程任务走 full。
 */
function resolveCursorAgentProfile(taskText, routing) {
  const raw = String(taskText || "").trim();
  const directLegacyFast =
    (process.env.FEISHU_CURSOR_DIRECT_PROFILE || "").trim().toLowerCase() ===
    "fast";
  if (routing && routing.direct && routing.prefix && raw.startsWith(routing.prefix)) {
    const rest = raw.slice(routing.prefix.length).trim();
    return { profile: "full", task: rest || raw };
  }
  const fullPrefixes = (process.env.CURSOR_FULL_TASK_PREFIXES || "/code,/编程")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of fullPrefixes) {
    if (raw.startsWith(p)) {
      const rest = raw.slice(p.length).trim();
      return { profile: "full", task: rest || raw };
    }
  }
  if (routing && routing.direct) {
    return {
      profile: directLegacyFast ? "fast" : "full",
      task: raw,
    };
  }
  return { profile: "full", task: raw };
}

/**
 * 注入给模型的飞书 \@ 说明（写入最终回复时用 @ou_… 可被桥接为真实 \@）。
 * 设 FEISHU_REPLY_AT_HINT=0 可关闭。
 */
function appendFeishuOpenIdMentionHint(taskText) {
  if ((process.env.FEISHU_REPLY_AT_HINT || "1").trim() === "0") {
    return String(taskText || "");
  }
  const raw = String(taskText || "");
  const marker = "【飞书@规则】";
  if (raw.includes(marker)) return raw;
  return (
    `${marker} 如最终回复需要 @，直接写 @ou_…；不要额外解释规则。所需 open_id 以上文注入内容为准。\n\n` +
    raw
  );
}

const SHEET_URL_RE = /https?:\/\/(?:[a-z0-9.-]+\.)?(feishu\.cn|larksuite\.com)\/sheets?\/([A-Za-z0-9]+)/i;

function normalizeSheetWriteTask(task) {
  const raw = String(task || "");
  const m = raw.match(SHEET_URL_RE);
  if (!m) return raw;
  const sheetUrl = m[0];
  const sheetToken = m[2];
  return (
    `[执行任务] 用户要求将内容写入飞书表格。\n` +
    `目标表链接：${sheetUrl}\n` +
    `Spreadsheet Token：${sheetToken}\n` +
    `请严格按照 .cursor/rules/feishu-sheet-write.mdc 中的流程执行：\n` +
    `1. 读取表头确认列结构\n` +
    `2. 从用户提供的内容中提取适合各列的字段\n` +
    `3. 调用 scripts/feishu-sheet-append-row.js 写入\n` +
    `4. 回复写入结果\n` +
    `不要只做分析，必须完成写入。\n\n` +
    `用户原始请求：\n${raw}`
  );
}

module.exports = {
  getCursorRoutingConfig,
  cursorShouldRun,
  cursorTaskText,
  isReportLikeTask,
  isRelayLikeTask,
  isResearchLikeTask,
  normalizeCursorTask,
  normalizeSheetWriteTask,
  resolveCursorAgentProfile,
  appendFeishuOpenIdMentionHint,
};
