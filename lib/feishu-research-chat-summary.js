"use strict";

/**
 * 调研/报告云文档导出成功后，飞书聊天侧仅发送「标题 + 章节概要 + 链接」，
 * 完整 Markdown 以云文档为准（避免交互卡片塞入全文）。
 */

const MAX_CARD_TITLE_LEN = 80;
const MAX_OUTLINE_ITEMS = 8;
const FALLBACK_SNIPPET_CHARS = 520;
const MAX_SUMMARY_NARRATIVE_CHARS = 1100;

/**
 * @param {string} md
 * @returns {string}
 */
function extractFirstH1Text(md) {
  const m = String(md || "").match(/^\s*#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : "";
}

/**
 * @param {string} md
 * @returns {string[]}
 */
function extractH2Outline(md) {
  const out = [];
  for (const line of String(md || "").split(/\r?\n/)) {
    const t = line.trim();
    const m = t.match(/^##\s+(.+)/);
    if (m) {
      const s = m[1].trim();
      if (s && !/^澄清假设/.test(s)) out.push(s);
    }
    if (out.length >= MAX_OUTLINE_ITEMS + 4) break;
  }
  return out.slice(0, MAX_OUTLINE_ITEMS);
}

/**
 * 去掉引用块/代码块后取一段可读的短摘要（无 ## 时的退路）
 * @param {string} md
 */
function fallbackSnippet(md) {
  let s = String(md || "");
  s = s.replace(/^---[\s\S]*?^---\s*/m, "");
  const lines = s.split(/\r?\n/).filter((l) => {
    const t = l.trim();
    if (!t) return false;
    if (/^```/.test(t)) return false;
    if (/^>\s/.test(t)) return false;
    if (/^#{1,6}\s/.test(t)) return false;
    return true;
  });
  const joined = lines.join(" ").replace(/\s+/g, " ").trim();
  if (joined.length <= FALLBACK_SNIPPET_CHARS) return joined;
  return `${joined.slice(0, FALLBACK_SNIPPET_CHARS)}…`;
}

/**
 * @param {string} title
 */
function clampTitle(title) {
  const t = String(title || "").trim() || "研究报告";
  if (t.length <= MAX_CARD_TITLE_LEN) return t;
  return `${t.slice(0, MAX_CARD_TITLE_LEN - 1)}…`;
}

/**
 * 从正文抽一段「可读总结」：优先跳过「澄清假设」类章节，取其后第一个二级章节下的段落并压成短文。
 * @param {string} md
 * @param {number} [maxChars]
 */
function extractSummaryNarrative(md, maxChars) {
  const cap = Number.isFinite(maxChars) ? maxChars : MAX_SUMMARY_NARRATIVE_CHARS;
  const parts = String(md || "").split(/^##\s+/m);
  for (let i = 1; i < parts.length; i += 1) {
    const chunk = parts[i];
    const head = (chunk.split(/\r?\n/)[0] || "").trim();
    if (/^澄清假设|^待确认问题|^目录$/i.test(head)) continue;
    const body = chunk.replace(/^[^\n]+\n/, "").trim();
    if (!body) continue;
    const lines = body.split(/\r?\n/);
    const acc = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (/^```/.test(t)) continue;
      if (/^#{1,4}\s+/.test(t)) continue;
      if (/^\|.+\|$/.test(t)) continue;
      const cleaned = t
        .replace(/^[-*]\s+/, "")
        .replace(/^\d+\.\s+/, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1");
      if (cleaned) acc.push(cleaned);
      if (acc.join(" ").length >= cap) break;
    }
    const plain = acc.join(" ").replace(/\s+/g, " ").trim();
    if (plain.length >= 35) {
      return plain.length > cap ? `${plain.slice(0, cap - 1)}…` : plain;
    }
  }
  const fb = fallbackSnippet(md);
  return fb.length > cap ? `${fb.slice(0, cap - 1)}…` : fb;
}

/**
 * @param {{ fullMarkdown: string, docUrl: string, fallbackTitle?: string }} p
 * @returns {string} 适合发 interactive/post 的短 Markdown
 */
function buildResearchChatSummary(p) {
  const full = String(p.fullMarkdown || "");
  const docUrl = String(p.docUrl || "").trim();
  const h1 = extractFirstH1Text(full);
  const title = clampTitle(h1 || p.fallbackTitle || "研究报告");
  const narrative = extractSummaryNarrative(full);
  const outline = extractH2Outline(full);
  const bullets =
    outline.length > 0
      ? outline.map((x) => `- ${x}`).join("\n")
      : `- ${fallbackSnippet(full) || "（详见云文档）"}`;

  const linkLine = docUrl
    ? `📄 **完整研究报告**（云文档）：${docUrl}`
    : "📄 云文档链接不可用，请稍后重试导出。";

  return [
    `# ${title}`,
    "",
    "**总结**",
    "",
    narrative || "（详见云文档正文）",
    "",
    "**章节要点**",
    "",
    bullets,
    "",
    linkLine,
    "",
    "_卡片为摘要；完整表格与引用以云文档为准。_",
  ].join("\n");
}

module.exports = {
  extractFirstH1Text,
  extractH2Outline,
  extractSummaryNarrative,
  buildResearchChatSummary,
  clampTitle,
};
