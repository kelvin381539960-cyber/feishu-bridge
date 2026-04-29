#!/usr/bin/env node
/**
 * lark-doc-mcp — stdio MCP server that reads Lark Suite wiki/doc content.
 *
 * If LARK_USER_ACCESS_TOKEN is set → all API calls use user_access_token.
 * Otherwise → tenant_access_token (app identity).
 * App id/secret: LARK_APP_ID / LARK_APP_SECRET (or FEISHU_APP_ID / FEISHU_APP_SECRET).
 */
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname_mcp = dirname(fileURLToPath(import.meta.url));
const requireCjs = createRequire(import.meta.url);
const {
  readFeishuResourceGraph,
  formatFeishuResourceGraphReply,
} = requireCjs(join(__dirname_mcp, "..", "lib", "feishu-online-doc.js"));

const SDK_BASE = join(__dirname_mcp, "node_modules");
const { McpServer } = await import(`${SDK_BASE}/@modelcontextprotocol/sdk/dist/esm/server/mcp.js`);
const { StdioServerTransport } = await import(`${SDK_BASE}/@modelcontextprotocol/sdk/dist/esm/server/stdio.js`);
const { z } = await import(`${SDK_BASE}/zod/index.js`);

function loadLarkCredentials() {
  const appId = process.env.LARK_APP_ID || process.env.FEISHU_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET || process.env.FEISHU_APP_SECRET;
  if (appId && appSecret) {
    return {
      appId,
      appSecret,
      domain:
        process.env.LARK_DOMAIN ||
        process.env.FEISHU_LARK_DOMAIN ||
        "lark",
    };
  }
  throw new Error(
    "No Lark credentials found. Set LARK_APP_ID/LARK_APP_SECRET (or FEISHU_APP_ID/FEISHU_APP_SECRET) and optional LARK_DOMAIN / FEISHU_LARK_DOMAIN."
  );
}

const creds = loadLarkCredentials();
const DOMAIN_BASES = {
  lark: "https://open.larksuite.com/open-apis",
  feishu: "https://open.feishu.cn/open-apis",
};
const API_BASE = (process.env.LARK_API_BASE || DOMAIN_BASES[creds.domain] || DOMAIN_BASES.lark).replace(/\/$/, "");
const APP_ID = creds.appId;
const APP_SECRET = creds.appSecret;
const TIMEOUT_MS = 20_000;

const USER_TOKEN = process.env.LARK_USER_ACCESS_TOKEN?.trim();
if (USER_TOKEN) {
  console.error("[lark-doc-mcp] auth=user_access_token (LARK_USER_ACCESS_TOKEN set)");
} else {
  console.error("[lark-doc-mcp] auth=tenant_access_token");
}

let tokenCache = { token: null, expireAt: 0 };

async function getAuthToken() {
  if (USER_TOKEN) return USER_TOKEN;
  return getTenantToken();
}

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", ...opts });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, ok: res.ok, body };
  } finally {
    clearTimeout(timer);
  }
}

async function getTenantToken() {
  if (!APP_ID || !APP_SECRET) throw new Error("LARK_APP_ID / LARK_APP_SECRET not set");
  const now = Date.now() / 1000;
  if (tokenCache.token && tokenCache.expireAt > now + 120) return tokenCache.token;
  const { body } = await fetchJson(`${API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }),
  });
  if (!body || body.code !== 0) {
    throw new Error(`token error: ${body?.msg || JSON.stringify(body)}`);
  }
  const exp = Number(body.expire) || 7200;
  tokenCache = { token: body.tenant_access_token, expireAt: now + exp };
  return tokenCache.token;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Extract wiki token from a Lark Suite URL, or return the input as-is if it looks like a raw token. */
function parseWikiToken(input) {
  const trimmed = input.trim();
  const m = trimmed.match(/\/wiki\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  const m2 = trimmed.match(/\/docx\/([A-Za-z0-9_-]+)/);
  if (m2) return { docToken: m2[1] };
  if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  throw new Error(`Cannot parse token from input: ${trimmed}`);
}

/** Extract spreadsheet token from a Lark Suite URL, or return the input as-is if it looks like a raw token. */
function parseSpreadsheetToken(input) {
  const trimmed = String(input || "").trim();
  const m = trimmed.match(/\/sheets?\/([A-Za-z0-9_-]+)/) || trimmed.match(/\/spreadsheet\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  throw new Error(`Cannot parse spreadsheet token from input: ${trimmed}`);
}

/** Extract whiteboard token from a Lark Suite URL, or return the input as-is if it looks like a raw token. */
function parseWhiteboardToken(input) {
  const trimmed = String(input || "").trim();
  const m =
    trimmed.match(/\/whiteboards?\/([A-Za-z0-9_-]+)/) ||
    trimmed.match(/\/board\/([A-Za-z0-9_-]+)/) ||
    trimmed.match(/[?&]whiteboard_id=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  throw new Error(`Cannot parse whiteboard token from input: ${trimmed}`);
}

/** Get wiki node → underlying obj_type + obj_token */
async function getWikiNode(token) {
  const tok = await getAuthToken();
  const { body } = await fetchJson(
    `${API_BASE}/wiki/v2/spaces/get_node?token=${encodeURIComponent(token)}`,
    { headers: authHeaders(tok) },
  );
  if (body?.code !== 0) throw new Error(`wiki get_node error: ${body?.msg || JSON.stringify(body)}`);
  return body.data?.node;
}

/** Fetch docx document blocks and flatten to readable text */
async function getDocxContent(docToken) {
  const tok = await getAuthToken();
  const blocks = [];
  let pageToken = "";
  for (let page = 0; page < 20; page++) {
    const qs = pageToken ? `?page_size=500&page_token=${pageToken}` : "?page_size=500";
    const { body } = await fetchJson(
      `${API_BASE}/docx/v1/documents/${encodeURIComponent(docToken)}/blocks${qs}`,
      { headers: authHeaders(tok) },
    );
    if (body?.code !== 0) throw new Error(`docx blocks error: ${body?.msg || JSON.stringify(body)}`);
    const items = body.data?.items || [];
    blocks.push(...items);
    if (!body.data?.has_more) break;
    pageToken = body.data.page_token || "";
  }
  return blocksToText(blocks);
}

/** Convert Lark docx blocks array to plain readable text */
function blocksToText(blocks) {
  const lines = [];
  for (const block of blocks) {
    const type = block.block_type;
    let text = "";
    const extractText = (elements) => {
      if (!Array.isArray(elements)) return "";
      return elements.map((el) => {
        if (el.text_run) return el.text_run.content || "";
        if (el.mention_user) return `@${el.mention_user.user_id || "user"}`;
        if (el.equation) return el.equation.content || "";
        return "";
      }).join("");
    };

    switch (type) {
      case 2: // text / paragraph
      case 3: // heading1
      case 4: // heading2
      case 5: // heading3
      case 6: // heading4
      case 7: // heading5
      case 8: // heading6
      case 9: // heading7
      case 10: // heading8
      case 11: // heading9
      {
        const paraData = block.text || block.heading1 || block.heading2 ||
          block.heading3 || block.heading4 || block.heading5 ||
          block.heading6 || block.heading7 || block.heading8 || block.heading9;
        if (paraData?.elements) {
          text = extractText(paraData.elements);
          if (type >= 3 && type <= 11) {
            const level = type - 2;
            text = "#".repeat(level) + " " + text;
          }
        }
        break;
      }
      case 12: // bullet
      case 13: // ordered
      {
        const listData = block.bullet || block.ordered;
        if (listData?.elements) {
          const prefix = type === 12 ? "- " : "1. ";
          text = prefix + extractText(listData.elements);
        }
        break;
      }
      case 14: // code block
      {
        const codeData = block.code;
        if (codeData?.elements) {
          text = "```\n" + extractText(codeData.elements) + "\n```";
        }
        break;
      }
      case 15: // quote
      {
        const quoteData = block.quote;
        if (quoteData?.elements) {
          text = "> " + extractText(quoteData.elements);
        }
        break;
      }
      case 17: // todo
      {
        const todoData = block.todo;
        if (todoData?.elements) {
          const done = todoData.style?.done ? "x" : " ";
          text = `[${done}] ` + extractText(todoData.elements);
        }
        break;
      }
      case 18: // 多维表格（旧版文档曾误用 18 作分割线，兼容 divider 字段）
        if (block.divider) {
          text = "---";
        } else if (block.bitable) {
          text = "[多维表格]";
        }
        break;
      case 19: // 高亮块 / callout
      {
        const calloutData = block.callout;
        if (calloutData?.elements) {
          text = "💡 " + extractText(calloutData.elements);
        }
        break;
      }
      case 20: // table cell — skip, handled by table
        break;
      case 22: // 分割线（开放平台枚举）；旧 reader 曾误标为 callout
        if (block.divider) {
          text = "---";
        }
        break;
      case 27: // image
        text = "[image]";
        break;
      default:
        break;
    }
    if (text) lines.push(text);
  }
  return lines.join("\n");
}

/** Read a Lark old-format doc (sheet/bitable/mindnote etc. just report type) */
async function getDocContent(objType, objToken) {
  const typeNames = {
    doc: "Doc (old format)",
    sheet: "Spreadsheet",
    bitable: "Bitable",
    mindnote: "MindNote",
    slides: "Slides",
    wiki: "Wiki",
    docx: "Docx",
  };
  if (objType === "docx") {
    return await getDocxContent(objToken);
  }
  return `[Document type: ${typeNames[objType] || objType}] — token: ${objToken}\nOnly docx format is supported for full content extraction. For other types, use the Lark Suite web interface.`;
}

async function getSpreadsheetContent(spreadsheetToken) {
  const tok = await getAuthToken();
  const { body: sheetsBody } = await fetchJson(
    `${API_BASE}/sheets/v3/spreadsheets/${encodeURIComponent(spreadsheetToken)}/sheets/query`,
    { headers: authHeaders(tok) },
  );
  if (sheetsBody?.code !== 0) throw new Error(`sheets query error: ${sheetsBody?.msg || JSON.stringify(sheetsBody)}`);
  const sheets = sheetsBody.data?.sheets || [];
  if (!sheets.length) return "(empty spreadsheet)";

  const maxRows = 200;
  const maxCols = 30;
  const renderTable = (rows) => {
    const cleaned = (rows || []).map((row) => (Array.isArray(row) ? row.map((cell) => String(cell == null ? "" : cell)) : []));
    if (!cleaned.length) return "";
    const width = Math.min(maxCols, cleaned.reduce((m, row) => Math.max(m, row.length), 0));
    const header = cleaned[0].slice(0, width);
    const body = cleaned.slice(1);
    const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
    const out = [];
    out.push(`| ${header.map(esc).join(" | ")} |`);
    out.push(`| ${header.map(() => "---").join(" | ")} |`);
    for (const row of body) {
      const cells = row.slice(0, width);
      while (cells.length < width) cells.push("");
      out.push(`| ${cells.map(esc).join(" | ")} |`);
    }
    return out.join("\n");
  };

  const sections = [];
  for (const sheet of sheets.slice(0, 5)) {
    if (!sheet?.sheet_id) continue;
    const rows = [];
    for (let start = 1; start <= maxRows; start += 50) {
      const end = Math.min(maxRows, start + 49);
      const range = `${sheet.sheet_id}!A${start}:AD${end}`;
      const { body: valuesBody } = await fetchJson(
        `${API_BASE}/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheetToken)}/values_batch_get?ranges=${encodeURIComponent(range)}&valueRenderOption=ToString`,
        { headers: authHeaders(tok) },
      );
      if (valuesBody?.code !== 0) throw new Error(`sheet values error: ${valuesBody?.msg || JSON.stringify(valuesBody)}`);
      const vr = valuesBody.data?.valueRanges?.[0];
      const grid = vr?.values || [];
      if (!grid.length) break;
      for (const row of grid) rows.push(Array.isArray(row) ? row.slice(0, maxCols) : []);
      if (grid.length < 50) break;
    }
    sections.push(`## ${sheet.title || sheet.sheet_id}\n${renderTable(rows) || "(empty sheet)"}`);
  }

  return sections.join("\n\n");
}

function pickFirstText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(pickFirstText).filter(Boolean).join(" ");
  if (typeof value !== "object") return String(value);
  for (const key of ["text", "name", "title", "content", "value", "label", "desc", "description"]) {
    if (value[key]) return pickFirstText(value[key]);
  }
  if (value.rich_text) return pickFirstText(value.rich_text);
  if (value.elements) return pickFirstText(value.elements);
  if (value.children) return pickFirstText(value.children);
  if (value.node_text) return pickFirstText(value.node_text);
  return "";
}

function formatWhiteboardNode(node, depth = 0) {
  const indent = "  ".repeat(depth);
  const id = node.id || node.node_id || node.block_id || node.uuid || "";
  const type = node.type || node.node_type || node.kind || node.block_type || "node";
  const text = pickFirstText(node.text || node.content || node.name || node.title || node.data || node.props || node).trim();
  const meta = [];
  if (id) meta.push(`id=${id}`);
  if (node.position) meta.push(`pos=${pickFirstText(node.position)}`);
  if (node.size) meta.push(`size=${pickFirstText(node.size)}`);
  const head = `${indent}- ${type}${meta.length ? ` (${meta.join(", ")})` : ""}${text ? `: ${text}` : ""}`;
  const children = Array.isArray(node.children) ? node.children : [];
  if (!children.length) return head;
  return [head, ...children.slice(0, 20).map((child) => formatWhiteboardNode(child, depth + 1))].join("\n");
}

function renderWhiteboardNodeList(nodes) {
  if (!Array.isArray(nodes) || !nodes.length) return "";
  return nodes.slice(0, 200).map((node) => formatWhiteboardNode(node)).join("\n");
}

async function downloadWhiteboardImage(whiteboardToken) {
  const tok = await getAuthToken();
  const url = `${API_BASE}/board/v1/whiteboards/${encodeURIComponent(whiteboardToken)}/download_as_image`;
  const res = await fetch(url, { headers: authHeaders(tok), redirect: "follow" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`whiteboard download_as_image error: ${text || res.status}`);
  }
  const contentType = res.headers.get("content-type") || "";
  const buffer = Buffer.from(await res.arrayBuffer());
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const filePath = path.join(
    os.tmpdir(),
    `feishu-whiteboard-${whiteboardToken}-${Date.now()}.${contentType.includes("png") ? "png" : "bin"}`
  );
  fs.writeFileSync(filePath, buffer);
  return { filePath, contentType, size: buffer.length };
}

async function getWhiteboardContent(whiteboardToken) {
  const tok = await getAuthToken();
  const titleRes = await fetchJson(
    `${API_BASE}/board/v1/whiteboards/${encodeURIComponent(whiteboardToken)}/theme`,
    { headers: authHeaders(tok) },
  );
  const title =
    titleRes.body?.data?.theme?.title ||
    titleRes.body?.data?.title ||
    whiteboardToken;

  const nodesRes = await fetchJson(
    `${API_BASE}/board/v1/whiteboards/${encodeURIComponent(whiteboardToken)}/nodes`,
    { headers: authHeaders(tok) },
  );
  if (nodesRes.body?.code === 0) {
    const data = nodesRes.body.data || {};
    const nodes = data.nodes || data.items || data.node_list || data.whiteboard_nodes || data.children || [];
    const rendered = renderWhiteboardNodeList(nodes);
    if (rendered) return `# ${title}\n\n## 节点结构\n${rendered}`;
  }

  const img = await downloadWhiteboardImage(whiteboardToken);
  return `# ${title}\n\n## 节点结构\n(未获取到可解析节点，已降级为图片导出)\n\n## 图片结果\n${img.filePath}`;
}

// --- MCP Server ---

const server = new McpServer({ name: "lark-doc-mcp", version: "1.0.0" });

server.tool(
  "read_lark_doc",
  "Read a Lark Suite (Feishu) wiki or document. Accepts a full URL (e.g. https://xxx.larksuite.com/wiki/TOKEN) or a raw wiki/doc token. Returns plain text content.",
  {
    url_or_token: z.string().min(1).describe("Lark Suite wiki/doc URL or token"),
  },
  async ({ url_or_token }) => {
    try {
      const parsed = parseWikiToken(url_or_token);

      if (typeof parsed === "object" && parsed.docToken) {
        const content = await getDocxContent(parsed.docToken);
        return {
          content: [{ type: "text", text: content || "(empty document)" }],
        };
      }

      const wikiToken = typeof parsed === "string" ? parsed : parsed;
      const node = await getWikiNode(wikiToken);
      if (!node) throw new Error("Wiki node not found");

      const objType = node.obj_type || "unknown";
      const objToken = node.obj_token || "";
      const title = node.title || "";

      const content = await getDocContent(objType, objToken);
      const header = title ? `# ${title}\n\n` : "";
      const result = (header + (content || "")).trim();
      return {
        content: [{ type: "text", text: result || "(empty document)" }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: String(e.message || e) }) }],
      };
    }
  },
);

server.tool(
  "read_lark_sheet",
  "Read a Lark Suite (Feishu) spreadsheet. Accepts a full URL (e.g. https://xxx.larksuite.com/sheets/TOKEN) or a raw spreadsheet token. Returns a markdown summary of the first few sheets and rows.",
  {
    url_or_token: z.string().min(1).describe("Lark Suite spreadsheet URL or token"),
  },
  async ({ url_or_token }) => {
    try {
      const spreadsheetToken = parseSpreadsheetToken(url_or_token);
      const content = await getSpreadsheetContent(spreadsheetToken);
      return {
        content: [{ type: "text", text: content || "(empty spreadsheet)" }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: String(e.message || e) }) }],
      };
    }
  },
);

server.tool(
  "read_lark_whiteboard",
  "Read a Lark Suite (Feishu) whiteboard. Accepts a full URL or raw whiteboard token. Tries whiteboard nodes first and falls back to download_as_image.",
  {
    url_or_token: z.string().min(1).describe("Lark Suite whiteboard URL or token"),
  },
  async ({ url_or_token }) => {
    try {
      const whiteboardToken = parseWhiteboardToken(url_or_token);
      const content = await getWhiteboardContent(whiteboardToken);
      return {
        content: [{ type: "text", text: content || "(empty whiteboard)" }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: String(e.message || e) }) }],
      };
    }
  },
);

server.tool(
  "read_lark_resource_graph",
  "Read a Lark Suite (Feishu) document, wiki page, or whiteboard, and automatically discover and expand embedded whiteboards. Returns the main content plus any discovered child resources with success/failure stats. Preferred over read_lark_doc for comprehensive reading.",
  {
    url_or_token: z.string().min(1).describe("Lark Suite document/wiki/whiteboard URL or token"),
    max_children: z.number().optional().describe("Max embedded child resources to expand (default 5)"),
  },
  async ({ url_or_token, max_children }) => {
    try {
      const graph = await readFeishuResourceGraph(url_or_token, {
        enabled: true,
        maxChildren: max_children || 5,
      });
      const reply = formatFeishuResourceGraphReply(graph, url_or_token);
      return {
        content: [{ type: "text", text: reply || "(empty resource)" }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: String(e.message || e) }) }],
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
