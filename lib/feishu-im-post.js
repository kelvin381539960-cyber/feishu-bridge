/**
 * 将含 @open_id 的纯文本转为飞书 post（富文本）content，以触发真实 \@ 提醒。
 * 约定：在正文中使用 @ou_xxxxxxxx（与事件 mentions[].id.open_id 同形）。
 */

const OU_AT_RE = /@(ou_[a-zA-Z0-9]+)/g;

/**
 * @param {string} text
 * @returns {object|null} post 的 content 对象（可直接 JSON.stringify 入 im/v1/messages），无有效 @ 则 null
 */
function buildZhCnPostContentFromText(text) {
  const s = String(text);
  OU_AT_RE.lastIndex = 0;
  const line = [];
  let last = 0;
  let m;
  while ((m = OU_AT_RE.exec(s)) !== null) {
    if (m.index > last) {
      const t = s.slice(last, m.index);
      if (t) line.push({ tag: "text", text: t });
    }
    line.push({ tag: "at", user_id: m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) {
    const t = s.slice(last);
    if (t) line.push({ tag: "text", text: t });
  }
  if (line.length === 0) return null;
  const hasAt = line.some((x) => x.tag === "at");
  if (!hasAt) return null;
  return {
    zh_cn: {
      title: "",
      content: [line],
    },
  };
}

const URL_SPLIT_RE = /(https?:\/\/[^\s<]+)/g;

/**
 * 通用 post：按行拆段，行内识别 http(s) 链接为 &lt;a&gt;，无 @ 时用于卡片降级。
 * @param {string} text
 * @returns {object|null} zh_cn post content
 */
function buildZhCnPostRichFromText(text) {
  const s = String(text || "");
  const lines = s.split(/\r?\n/);
  /** @type {object[][]} */
  const content = [];
  for (const rawLine of lines) {
    const line = rawLine;
    /** @type {object[]} */
    const row = [];
    let last = 0;
    let m;
    URL_SPLIT_RE.lastIndex = 0;
    while ((m = URL_SPLIT_RE.exec(line)) !== null) {
      if (m.index > last) {
        const t = line.slice(last, m.index);
        if (t) row.push({ tag: "text", text: t });
      }
      const href = m[1];
      row.push({ tag: "a", href, text: href });
      last = m.index + m[0].length;
    }
    if (last < line.length) {
      const t = line.slice(last);
      if (t) row.push({ tag: "text", text: t });
    }
    if (row.length === 0) row.push({ tag: "text", text: " " });
    content.push(row);
  }
  if (content.length === 0) return null;
  return {
    zh_cn: {
      title: "",
      content,
    },
  };
}

module.exports = {
  buildZhCnPostContentFromText,
  buildZhCnPostRichFromText,
};
