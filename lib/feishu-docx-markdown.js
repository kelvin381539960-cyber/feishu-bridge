"use strict";

/**
 * 将 Markdown 子集转为飞书 docx v1「创建子块」请求体中的 descendants 项。
 * block_type 与开放平台枚举对齐：2 正文、3–11 标题、12 无序、13 有序、14 代码、15 引用、22 分割线（18 为多维表格，勿混用）。
 */

const crypto = require("node:crypto");

const MAX_TEXT_RUN = 1800;

function randomBlockId() {
  // 使用纯字母数字 ID，避免 b_ 前缀
  return crypto.randomBytes(8).toString("hex");
}

function elementsFromString(s) {
  const t = String(s ?? "");
  if (!t) return [{ text_run: { content: " " } }];
  const els = [];
  for (let i = 0; i < t.length; i += MAX_TEXT_RUN) {
    els.push({ text_run: { content: t.slice(i, i + MAX_TEXT_RUN) } });
  }
  return els;
}

function textBlock(content) {
  return {
    block_id: randomBlockId(),
    block_type: 2,
    text: { elements: elementsFromString(content) },
  };
}

function headingBlock(level, text) {
  const lv = Math.min(Math.max(Number(level) || 1, 1), 9);
  const blockType = lv + 2;
  const key = `heading${lv}`;
  return {
    block_id: randomBlockId(),
    block_type: blockType,
    [key]: { elements: elementsFromString(text) },
  };
}

function bulletBlock(text) {
  return {
    block_id: randomBlockId(),
    block_type: 12,
    bullet: { elements: elementsFromString(text) },
  };
}

function orderedBlock(text) {
  return {
    block_id: randomBlockId(),
    block_type: 13,
    ordered: {
      elements: elementsFromString(text),
      // 创建有序列表时必填之一；缺省会触发 1770001 invalid param（Lark 国际站）
      sequence: "auto",
    },
  };
}

function codeBlock(text) {
  return {
    block_id: randomBlockId(),
    block_type: 14,
    code: { elements: elementsFromString(text) },
  };
}

function quoteBlock(text) {
  return {
    block_id: randomBlockId(),
    block_type: 15,
    quote: { elements: elementsFromString(text) },
  };
}

// 高亮块替代方案：使用带 emoji 前缀的加粗文本块
// 原 block_type 19 (callout) 在部分租户 API 仍在开发中，用 styled text 稳妥替代
function styledHighlightBlock(text, type = "info") {
  const emoji = type === "warning" ? "⚠️" : type === "success" ? "✅" : "📌";
  // 加粗样式：通过在 text_run 中增加 style 实现
  const styledElements = [{
    text_run: {
      content: emoji + " " + text,
      text_element_style: {
        bold: true,
        background_color: type === "warning" ? 1 : type === "success" ? 4 : 5, // 红/绿/蓝背景
      },
    },
  }];
  return {
    block_id: randomBlockId(),
    block_type: 2,
    text: { elements: styledElements },
  };
}

// 解析简单 Markdown 表格为二维数组
function parseMarkdownTable(lines) {
  if (!lines || lines.length < 2) return null;
  const rows = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    // 跳过分隔行 |---|---|
    if (/^\|[\s\-:|]+\|\s*$/.test(trimmed)) continue;
    const cells = trimmed
      .slice(1, trimmed.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((c) => c.trim());
    if (cells.length > 0) rows.push(cells);
  }
  return rows.length > 0 ? rows : null;
}

// 最终回退方案：美化文本表格，并用代码块承载
function formattedTableBlock(rows) {
  if (!rows || rows.length === 0) return textBlock("[空表格]");
  
  const colWidths = [];
  for (const row of rows) {
    row.forEach((cell, idx) => {
      const text = String(cell || "");
      let w = 0;
      for (let i = 0; i < text.length; i++) {
        w += (text.charCodeAt(i) > 127) ? 2 : 1;
      }
      colWidths[idx] = Math.max(colWidths[idx] || 0, w);
    });
  }
  
  const lines = [];
  lines.push("┌" + colWidths.map(w => "─".repeat(w + 2)).join("┬") + "┐");
  
  rows.forEach((row, ridx) => {
    const cells = row.map((cell, idx) => {
      const text = String(cell || "");
      const targetW = colWidths[idx] || 1;
      let currentW = 0;
      for (let i = 0; i < text.length; i++) {
        currentW += (text.charCodeAt(i) > 127) ? 2 : 1;
      }
      const pad = " ".repeat(Math.max(0, targetW - currentW));
      return " " + text + pad + " ";
    });
    lines.push("│" + cells.join("│") + "│");
    
    if (ridx === 0) {
      lines.push("├" + colWidths.map(w => "─".repeat(w + 2)).join("┼") + "┤");
    } else if (ridx < rows.length - 1) {
      lines.push("├" + colWidths.map(w => "─".repeat(w + 2)).join("┼") + "┤");
    }
  });
  
  lines.push("└" + colWidths.map(w => "─".repeat(w + 2)).join("┴") + "┘");
  
  return codeBlock(lines.join("\n"));
}

function tableBlockFromRows(rows) {
  return formattedTableBlock(rows);
}

function dividerBlock() {
  return {
    block_id: randomBlockId(),
    block_type: 22,
    divider: {},
    children: [],
  };
}

function isDividerLine(trim) {
  return /^(\*{3,}|-{3,}|_{3,})\s*$/.test(trim);
}

function isTableLine(line) {
  const t = String(line || "").trim();
  return /^\|/.test(t) && t.includes("|", 1);
}

// 检测是否为「关键摘要」段落（适合用高亮块突出）
function isKeySummaryParagraph(text) {
  const keyPatterns = [
    /交付对象有两层/,
    /产品交付.*机制交付/,
    /本期默认以.*产品落地优先/,
    /10 周内需要同时回答四个问题/,
    /成功标准.*可上线、可观测、可复用/,
    /上线权限.*团队内部可自主推进/,
    /项目定位.*解释与引导/,
    /一期聚焦三类高频问题/,
    /兜底原则.*宁可少答、宁可直接转人工/,
    /实验目标.*用户使用.*产品质量.*团队提速.*机制沉淀/,
    /里程碑.*按.*状态达成.*判定/,
    /关键交付物.*项目方案文档.*知识体系文档/,
  ];
  return keyPatterns.some((p) => p.test(text));
}

// 检测段落是否为「风险/红线」内容（用红色高亮）
function isRiskContent(text) {
  const riskPatterns = [
    /红线/,
    /越界/,
    /兜底/,
    /风险/,
    /投诉/,
    /纠纷/,
    /资金相关/,
  ];
  return riskPatterns.some((p) => p.test(text));
}

/**
 * @param {string} markdown
 * @returns {object[]} Feishu descendants blocks
 */
function markdownToFeishuDescendants(markdown) {
  const src = String(markdown || "");
  const lines = src.split(/\r?\n/);
  /** @type {object[]} */
  const out = [];
  let i = 0;
  let inFence = false;
  /** @type {string[]} */
  const fenceBuf = [];
  /** @type {string[]} */
  let para = [];

  const flushPara = () => {
    if (!para.length) return;
    const t = para.join("\n").replace(/\s+$/, "");
    para = [];
    if (!t) return;
    // 关键摘要用高亮样式
    if (isKeySummaryParagraph(t)) {
      out.push(styledHighlightBlock(t, "info"));
    } else if (isRiskContent(t)) {
      out.push(styledHighlightBlock(t, "warning"));
    } else {
      out.push(textBlock(t));
    }
  };

  while (i < lines.length) {
    const raw = lines[i];
    const trim = raw.trim();

    if (trim.startsWith("```")) {
      if (inFence) {
        inFence = false;
        const body = fenceBuf.join("\n");
        fenceBuf.length = 0;
        if (body.length) out.push(codeBlock(body));
        i += 1;
        continue;
      }
      flushPara();
      inFence = true;
      i += 1;
      continue;
    }
    if (inFence) {
      fenceBuf.push(raw);
      i += 1;
      continue;
    }

    if (!trim) {
      flushPara();
      i += 1;
      continue;
    }

    if (isDividerLine(trim)) {
      flushPara();
      out.push(dividerBlock());
      i += 1;
      continue;
    }

    const hm = trim.match(/^(#{1,9})\s+(.*)$/);
    if (hm) {
      flushPara();
      const level = hm[1].length;
      const title = hm[2].trim();
      // 一级标题前加视觉分隔线（文档标题更突出）
      if (level === 1) {
        out.push(dividerBlock());
      }
      // 二级标题（Part 1 / Part 2 等大章节）前也加轻度分隔
      if (level === 2) {
        out.push(dividerBlock());
      }
      out.push(headingBlock(level, title));
      // 一级标题后加高亮摘要提示
      if (level === 1) {
        out.push(styledHighlightBlock("本文档为 AI 客服一期方案（v2），面向决策层汇报使用。包含项目定义、产品方案、团队机制与 10 周推进框架。", "success"));
      }
      i += 1;
      continue;
    }

    if (isTableLine(raw)) {
      flushPara();
      const tblLines = [];
      while (i < lines.length) {
        const rowTrim = lines[i].trim();
        if (isTableLine(lines[i]) || /^\|[\s\-:|]+\|\s*$/.test(rowTrim)) {
          tblLines.push(lines[i].trimEnd());
          i += 1;
        } else {
          break;
        }
      }
      const rows = parseMarkdownTable(tblLines);
      if (rows && rows.length >= 1) {
        // 使用格式化表格（带对齐和表头分隔）比原始代码块更美观
        out.push(formattedTableBlock(rows));
      }
      continue;
    }

    const bullet = trim.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushPara();
      out.push(bulletBlock(bullet[1].trim()));
      i += 1;
      continue;
    }

    const ordered = trim.match(/^(\d+)\.\s+(.+)$/);
    if (ordered) {
      flushPara();
      out.push(orderedBlock(ordered[2].trim()));
      i += 1;
      continue;
    }

    if (/^>\s?/.test(trim)) {
      flushPara();
      const q = trim.replace(/^>\s?/, "").trim();
      out.push(quoteBlock(q));
      i += 1;
      continue;
    }

    para.push(raw);
    i += 1;
  }
  flushPara();

  if (!out.length) {
    out.push(textBlock(src.slice(0, MAX_TEXT_RUN * 5) || " "));
  }
  return out;
}

module.exports = {
  markdownToFeishuDescendants,
  _test: {
    elementsFromString,
    MAX_TEXT_RUN,
  },
};
