/**
 * 为 Cursor 任务注入「可 @」上下文：本条 mentions、群用户列表、可选别名→open_id 映射。
 * 说明：飞书「群成员」接口不返回机器人；@ 其它机器人需同消息 mentions 或 FEISHU_BOT_OPEN_ID_MAP。
 */

const { isP2PChatType } = require("./feishu-group-at-bot");

function parseBotOpenIdMap() {
  const raw = (process.env.FEISHU_BOT_OPEN_ID_MAP || "").trim();
  if (!raw) return [];
  const out = [];
  for (const part of raw.split(/[,;\n]/)) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf("=");
    if (eq <= 0) continue;
    const key = p.slice(0, eq).trim().toLowerCase();
    const val = p.slice(eq + 1).trim();
    if (key && /^ou_[a-zA-Z0-9]+$/.test(val)) {
      out.push({ key, val, rawKey: p.slice(0, eq).trim() });
    }
  }
  return out;
}

function buildMentionBlock(message) {
  const mentions = message && message.mentions;
  if (!Array.isArray(mentions) || !mentions.length) return "";
  const rows = [];
  for (const m of mentions) {
    const oid = m && m.id && m.id.open_id;
    if (!oid) continue;
    const name = (m.name || "").trim() || "(无昵称)";
    rows.push(`- ${name}  ${oid}`);
  }
  if (!rows.length) return "";
  return (
    `[飞书·本条消息里的 @ 提及（如需真实 @，请用下方 open_id：@ou_…）]\n` +
    `${rows.join("\n")}\n\n`
  );
}

function buildBotMapBlock() {
  const entries = parseBotOpenIdMap();
  if (!entries.length) return "";
  const lines = entries.map((e) => `- ${e.rawKey} → ${e.val}`);
  return `[飞书·FEISHU_BOT_OPEN_ID_MAP 别名→open_id]\n${lines.join("\n")}\n\n`;
}

function buildRelevantBotMapBlock(task) {
  const raw = String(task || "");
  const entries = parseBotOpenIdMap();
  if (!raw || !entries.length) return "";
  const lowered = raw.toLowerCase();
  const matched = entries.filter((e) => {
    const key = String(e.key || "").toLowerCase();
    const rawKey = String(e.rawKey || "").toLowerCase();
    return lowered.includes(key) || lowered.includes(rawKey);
  });
  if (!matched.length) return "";
  const lines = matched.map((e) => `- ${e.rawKey} → ${e.val}`);
  return `[飞书·FEISHU_BOT_OPEN_ID_MAP（仅本条任务相关别名）]\n${lines.join("\n")}\n\n`;
}

function shouldInjectChatMembers(task, message) {
  const raw = String(task || "");
  if (!raw) return false;
  if (isP2PChatType(message && message.chat_type)) return false;
  if ((process.env.FEISHU_INJECT_CHAT_MEMBERS || "1").trim() === "0") {
    return false;
  }
  if (/本群|群成员|群里有哪些人|群里都有谁|所有人|全部成员/i.test(raw)) {
    return true;
  }
  const mentions = message && message.mentions;
  const hasMentions = Array.isArray(mentions) && mentions.length > 0;
  if (!hasMentions && /@|艾特|at谁|open_id/i.test(raw)) {
    return true;
  }
  return false;
}

/**
 * @param {string} task
 * @param {{ message?: object, chatId?: string, fetchMembers?: (cid: string) => Promise<{ lines?: string[], error?: string }> }} ctx
 */
async function augmentTaskWithFeishuAtContext(task, ctx) {
  let out = String(task || "");
  const msg = ctx && ctx.message;
  const chatId = ctx && ctx.chatId;

  if ((process.env.FEISHU_INJECT_MENTION_CONTEXT || "1").trim() !== "0") {
    const mb = buildMentionBlock(msg);
    if (mb) out = mb + out;
  }

  out = buildRelevantBotMapBlock(out) + out;

  if (
    shouldInjectChatMembers(out, msg) &&
    chatId &&
    typeof ctx.fetchMembers === "function"
  ) {
    try {
      const { lines, error } = await ctx.fetchMembers(chatId);
      const note =
        "说明：飞书群成员接口不返回机器人；若需 @ 其它机器人，请用户在指令里同时 @ 对方，或配置 FEISHU_BOT_OPEN_ID_MAP。";
      if (lines && lines.length) {
        out =
          `[飞书·本群用户 open_id（${note}）]\n` +
          `${lines.join("\n")}\n\n` +
          out;
      } else if (error) {
        out =
          `[飞书·本群成员列表未获取：${error}]\n\n` + out;
      }
    } catch (e) {
      out = `[飞书·本群成员列表异常：${e.message || e}]\n\n` + out;
    }
  }

  return out;
}

module.exports = {
  augmentTaskWithFeishuAtContext,
  parseBotOpenIdMap,
  buildMentionBlock,
  shouldInjectChatMembers,
  buildRelevantBotMapBlock,
};
