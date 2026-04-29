"use strict";

/**
 * 将机器人回复正文转为飞书「消息卡片」JSON（用于 im/v1/messages msg_type=interactive）。
 * 元素含：note（引用条）、div+lark_md、hr、markdown（表格等）。
 * @see https://open.feishu.cn/document/server-docs/im-v1/message-content-description/create_json
 */

/** 卡片 JSON 建议 &lt; 30KB（与飞书卡片上限一致，留余量） */
const MAX_CARD_JSON_BYTES = 29000;
const MAX_LARK_MD_CHUNK = 3800;
const OU_AT_RE = /@(ou_[a-zA-Z0-9]+)/g;

/**
 * lark_md 中 @open_id 转为飞书 at 标签
 * @param {string} s
 */
function atOuToLarkMd(s) {
  return String(s).replace(OU_AT_RE, (_m, id) => `<at id="${id}"></at>`);
}

/**
 * 过长时分块为多个 div+lark_md
 * @param {string} segment
 * @returns {object[]}
 */
function chunkToLarkMdDivs(segment) {
  const t = atOuToLarkMd(String(segment || ""));
  if (!t.trim()) return [];
  const out = [];
  for (let i = 0; i < t.length; i += MAX_LARK_MD_CHUNK) {
    const chunk = t.slice(i, i + MAX_LARK_MD_CHUNK);
    out.push({
      tag: "div",
      text: { tag: "lark_md", content: chunk },
    });
  }
  return out;
}

/**
 * 简单识别 GFM 表格：首行含 |，次行为分隔行 |---|
 * @param {string} segment
 */
function isGfmTableBlock(segment) {
  const lines = String(segment)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length);
  if (lines.length < 2) return false;
  if (!/^\|.*\|$/.test(lines[0])) return false;
  return /^\|[\s\-:|]+\|$/.test(lines[1]);
}

/**
 * 从混排正文中抽出第一块 GFM 表格（前有说明、后有续文均可）。
 * @returns {{ before: string, table: string, after: string } | null}
 */
function extractFirstGfmTable(segment) {
  const lines = String(segment).split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i += 1) {
    const l1 = lines[i].trim();
    const l2 = (lines[i + 1] && lines[i + 1].trim()) || "";
    if (!/^\|.*\|$/.test(l1)) continue;
    if (!/^\|[\s\-:|]+\|$/.test(l2)) continue;
    let j = i;
    const block = [];
    while (j < lines.length) {
      const ln = lines[j].trim();
      if (!ln.includes("|")) break;
      block.push(lines[j].trimEnd());
      j += 1;
    }
    if (block.length < 2) continue;
    return {
      before: lines.slice(0, i).join("\n"),
      table: block.join("\n"),
      after: lines.slice(j).join("\n"),
    };
  }
  return null;
}

/**
 * @param {string} segment
 * @returns {object[]}
 */
function segmentToElements(segment) {
  const s = String(segment || "").trim();
  if (!s) return [];

  if (/^回复\s*/.test(s) || /^>\s?/.test(s)) {
    const body = s.replace(/^>\s?/m, "");
    // note 内仅允许 plain_text 等，不允许 div+lark_md（否则会 230099 / ErrCode 11310）
    OU_AT_RE.lastIndex = 0;
    const plain = String(body)
      .replace(OU_AT_RE, "@$1")
      .slice(0, 4000);
    return [
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: plain,
          },
        ],
      },
    ];
  }

  const mixed = extractFirstGfmTable(s);
  if (mixed) {
    /** @type {object[]} */
    const els = [];
    if (mixed.before.trim()) {
      els.push(...chunkToLarkMdDivs(mixed.before));
    }
    els.push({ tag: "markdown", content: atOuToLarkMd(mixed.table) });
    if (mixed.after.trim()) {
      els.push(...chunkToLarkMdDivs(mixed.after));
    }
    return els;
  }

  if (isGfmTableBlock(s)) {
    return [
      {
        tag: "markdown",
        content: atOuToLarkMd(s),
      },
    ];
  }

  return chunkToLarkMdDivs(s);
}

/**
 * 按分隔线拆段并插入 hr
 * @param {string} text
 * @returns {object[]}
 */
function splitByHorizontalRules(text) {
  const raw = String(text || "");
  const parts = raw.split(/\n-{3,}\s*\n/);
  /** @type {object[]} */
  const elements = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (i > 0) elements.push({ tag: "hr" });
    const seg = parts[i].trim();
    if (!seg) continue;
    elements.push(...segmentToElements(seg));
  }
  if (elements.length === 0) {
    return chunkToLarkMdDivs(raw);
  }
  return elements;
}

/**
 * 识别并拆出 pipeline 追加的用量尾行（`a · b · c · d`，中间为 U+00B7）。
 * 避免该行混在超长 lark_md 里被 30KB 截断逻辑整块删掉。
 */
function extractTrailingUsageLine(text) {
  const raw = String(text || "");
  const lines = raw.split(/\r?\n/);
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length) return { body: raw, footer: "" };
  const last = lines[lines.length - 1].trim();
  const sep = " \u00b7 ";
  const parts = last.split(sep);
  if (parts.length < 4) return { body: raw, footer: "" };
  lines.pop();
  const body = lines.join("\n").replace(/\s+$/, "");
  return { body, footer: last };
}


/**
 * @param {string} text 完整回复（可含 ---、表格、链接）
 * @returns {{ card: object, truncated: boolean }}
 */
function buildInteractiveCardPayload(text) {
  const { body, footer } = extractTrailingUsageLine(text);
  const footerEl =
    footer && footer.trim()
      ? {
          tag: "div",
          text: { tag: "lark_md", content: atOuToLarkMd(footer.trim()) },
        }
      : null;

  let mainElements = body.trim() ? splitByHorizontalRules(body) : [];
  const truncateNoteEl = {
    tag: "div",
    text: {
      tag: "lark_md",
      content:
        "…（内容过长，已截断以符合飞书单卡约 30KB 限制；完整内容见上文或云文档链接）",
    },
  };

  function buildElements(mainShrink, withNote) {
    const mid = [...mainShrink];
    if (withNote) mid.push(truncateNoteEl);
    if (footerEl) mid.push(footerEl);
    return mid;
  }

  let mainShrink = mainElements.slice();
  let truncated = false;
  let elements = buildElements(mainShrink, false);

  let card = {
    config: {
      wide_screen_mode: true,
      enable_forward: true,
    },
    elements,
  };

  let json = JSON.stringify(card);
  while (Buffer.byteLength(json, "utf8") > MAX_CARD_JSON_BYTES && mainShrink.length > 0) {
    mainShrink = mainShrink.slice(0, -1);
    truncated = true;
    elements = buildElements(mainShrink, true);
    card = {
      ...card,
      elements,
    };
    json = JSON.stringify(card);
  }

  if (Buffer.byteLength(json, "utf8") > MAX_CARD_JSON_BYTES) {
    const { body: b2, footer: f2 } = extractTrailingUsageLine(text);
    const reserve = f2 ? 900 : 0;
    const mainSlice = String(b2).slice(0, Math.max(2000, 6000 - reserve));
    const els = [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: atOuToLarkMd(mainSlice),
        },
      },
    ];
    if (f2 && f2.trim()) {
      els.push({
        tag: "div",
        text: { tag: "lark_md", content: atOuToLarkMd(f2.trim()) },
      });
    }
    els.push({
      tag: "div",
      text: {
        tag: "lark_md",
        content: "…（单卡体积超限，已截断）",
      },
    });
    const minimal = {
      config: { wide_screen_mode: true, enable_forward: true },
      elements: els,
    };
    return { card: minimal, truncated: true };
  }

  return { card, truncated };
}

module.exports = {
  buildInteractiveCardPayload,
  extractTrailingUsageLine,
  atOuToLarkMd,
  splitByHorizontalRules,
  MAX_CARD_JSON_BYTES,
};
