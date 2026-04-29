/**
 * 飞书在线文档链接识别与读取。
 * 目标：从聊天文本中自动识别 docx / wiki / sheet / bitable 链接，并尽量返回可读内容。
 *
 * 不变量：凡可能交给 Playwright（feishu-browser-read.py）或写回结果的飞书 URL，须先经
 * normalizeFeishuPasteUrl（飞书常粘贴成 url(url)，不剥掉会导致 browser_page_unreadable）。
 * classifyFeishuUrl 内已 normalize；readFeishuOnlineDocWithFallback / readFeishuResourceGraph
 * 使用规范化后的 input 贯穿 API 与浏览器子进程。
 */
const axios = require("axios");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { getFeishuApiBase, getTenantAccessToken } = require("./feishu-tenant");

const execFileAsync = promisify(execFile);
const FEISHU_URL_RE = /https?:\/\/[^\s]+/gi;
const MAX_SHEET_ROWS = 200;
const MAX_SHEET_COLS = 30;
const MAX_BITABLE_RECORDS = 200;
const MAX_WHITEBOARD_NODES = 200;
const BROWSER_READ_SCRIPT = path.join(__dirname, "..", "scripts", "feishu-browser-read.py");

/**
 * 飞书客户端有时会把同一链接粘成「url(url)」或「url(https://…」；原样交给浏览器会 goto 失败，
 * execFile 只看到 “Command failed” 而拿不到 JSON，表现为 browser_page_unreadable。
 */
function normalizeFeishuPasteUrl(url) {
  const s = String(url || "").trim();
  if (!s) return s;
  const dupParen = s.match(/^(https?:\/\/[^\s()]+)\((https?:\/\/[^)\s]+)\)\s*$/);
  if (dupParen) {
    const a = dupParen[1].replace(/\/+$/, "");
    const b = dupParen[2].replace(/\/+$/, "");
    if (a === b) return dupParen[1];
  }
  const idx = s.search(/\(\s*https?:\/\//);
  if (idx > 0) {
    const head = s.slice(0, idx).trim();
    let tail = s.slice(idx + 1);
    if (tail.startsWith("(")) tail = tail.slice(1);
    const closeIdx = tail.indexOf(")");
    const inner = (closeIdx >= 0 ? tail.slice(0, closeIdx) : tail).trim();
    try {
      const uHead = new URL(head);
      const uInner = new URL(inner);
      if (uHead.origin === uInner.origin && uHead.pathname === uInner.pathname) return head;
    } catch {
      /* ignore */
    }
    if (head.startsWith("http") && inner.startsWith("http") && head === inner) return head;
    if (head.startsWith("http")) return head;
  }
  // 剥离尾部不匹配的闭括号（post a 标签渲染：锚文字(url) → URL 末尾带 ")"）
  if (s.startsWith("http") && s.endsWith(")")) {
    let opens = 0;
    for (const c of s) { if (c === "(") opens++; else if (c === ")") opens--; }
    if (opens < 0) {
      let cleaned = s;
      let deficit = -opens;
      while (deficit > 0 && cleaned.endsWith(")")) { cleaned = cleaned.slice(0, -1); deficit--; }
      if (cleaned !== s) return cleaned;
    }
  }
  return s;
}

function extractUrls(text) {
  const raw = String(text || "");
  const matches = raw.match(FEISHU_URL_RE) || [];
  return matches.map((u) => normalizeFeishuPasteUrl(u));
}

function classifyFeishuUrl(url) {
  const s = normalizeFeishuPasteUrl(String(url || "").trim());
  const docx = s.match(/\/docx\/([A-Za-z0-9]+)/);
  if (docx) return { type: "docx", token: docx[1] };
  const wiki = s.match(/\/wiki\/([A-Za-z0-9]+)/);
  if (wiki) return { type: "wiki", token: wiki[1] };
  const sheet = s.match(/\/sheets?\/([A-Za-z0-9]+)/) || s.match(/\/spreadsheet\/([A-Za-z0-9]+)/);
  if (sheet) return { type: "sheet", token: sheet[1] };
  const bitable = s.match(/\/base\/([A-Za-z0-9]+)/);
  if (bitable) return { type: "bitable", token: bitable[1] };
  const whiteboard = s.match(/\/whiteboards?\/([A-Za-z0-9_-]+)/) || s.match(/\/board\/([A-Za-z0-9_-]+)/);
  if (whiteboard) return { type: "whiteboard", token: whiteboard[1] };
  return null;
}

async function readDocx(token) {
  const tok = await getTenantAccessToken();
  if (!tok) return { ok: false, error: "no_token" };
  const r = await axios.get(
    `${getFeishuApiBase()}/docx/v1/documents/${encodeURIComponent(token)}/raw_content`,
    { headers: { Authorization: `Bearer ${tok}` }, timeout: 30000, validateStatus: () => true }
  );
  if (r.status >= 400 || !r.data || r.data.code !== 0) {
    return { ok: false, status: r.status, code: r.data && r.data.code, msg: r.data && r.data.msg };
  }
  return { ok: true, type: "docx", content: String((r.data.data && r.data.data.content) || "") };
}

async function readDocxBlocks(token) {
  try {
    const tok = await getTenantAccessToken();
    if (!tok) return { ok: false, error: "no_token" };
    const blocks = [];
    let pageToken = "";
    for (let page = 0; page < 20; page++) {
      const qs = pageToken ? `?page_size=500&page_token=${pageToken}` : "?page_size=500";
      const r = await axios.get(
        `${getFeishuApiBase()}/docx/v1/documents/${encodeURIComponent(token)}/blocks${qs}`,
        { headers: { Authorization: `Bearer ${tok}` }, timeout: 30000, validateStatus: () => true }
      );
      if (r.status >= 400 || !r.data || r.data.code !== 0) {
        return { ok: false, status: r.status, code: r.data && r.data.code, msg: r.data && r.data.msg };
      }
      const items = (r.data.data && r.data.data.items) || [];
      blocks.push(...items);
      if (!r.data.data || !r.data.data.has_more) break;
      pageToken = (r.data.data && r.data.data.page_token) || "";
    }
    return { ok: true, blocks };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

async function resolveWikiToDocToken(token) {
  const tok = await getTenantAccessToken();
  if (!tok) return { ok: false, error: "no_token" };
  // Wiki 链接里的 token 是「知识库节点 token」，不是 space_id。必须用 get_node，不能写成 spaces/{token}/nodes/{token}。
  const r = await axios.get(
    `${getFeishuApiBase()}/wiki/v2/spaces/get_node?token=${encodeURIComponent(token)}`,
    { headers: { Authorization: `Bearer ${tok}` }, timeout: 30000, validateStatus: () => true }
  );
  if (r.status >= 400 || !r.data || r.data.code !== 0) {
    return { ok: false, status: r.status, code: r.data && r.data.code, msg: r.data && r.data.msg };
  }
  const node = (r.data.data && r.data.data.node) || {};
  return { ok: true, objType: node.obj_type, objToken: node.obj_token };
}

async function readFirstSheet(spreadsheetToken) {
  const tok = await getTenantAccessToken();
  if (!tok) return { ok: false, error: "no_token" };
  const sheetsRes = await axios.get(
    `${getFeishuApiBase()}/sheets/v3/spreadsheets/${encodeURIComponent(spreadsheetToken)}/sheets/query`,
    { headers: { Authorization: `Bearer ${tok}` }, timeout: 30000, validateStatus: () => true }
  );
  if (sheetsRes.status >= 400 || !sheetsRes.data || sheetsRes.data.code !== 0) {
    return { ok: false, status: sheetsRes.status, code: sheetsRes.data && sheetsRes.data.code, msg: sheetsRes.data && sheetsRes.data.msg };
  }
  const sheets = (sheetsRes.data.data && sheetsRes.data.data.sheets) || [];
  const first = sheets.find((s) => s && !s.hidden) || sheets[0];
  if (!first || !first.sheet_id) return { ok: false, error: "no_sheet" };
  const rows = [];
  for (let start = 1; start <= MAX_SHEET_ROWS; start += 50) {
    const end = Math.min(MAX_SHEET_ROWS, start + 49);
    const range = `${first.sheet_id}!A${start}:AD${end}`;
    const valuesRes = await axios.get(
      `${getFeishuApiBase()}/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheetToken)}/values_batch_get`,
      {
        headers: { Authorization: `Bearer ${tok}` },
        params: { ranges: range, valueRenderOption: "ToString" },
        timeout: 30000,
        validateStatus: () => true,
      }
    );
    if (valuesRes.status >= 400 || !valuesRes.data || valuesRes.data.code !== 0) {
      return { ok: false, status: valuesRes.status, code: valuesRes.data && valuesRes.data.code, msg: valuesRes.data && valuesRes.data.msg };
    }
    const vr = valuesRes.data.data && valuesRes.data.data.valueRanges && valuesRes.data.data.valueRanges[0];
    const grid = (vr && vr.values) || [];
    if (!grid.length) break;
    const batchAllEmpty = grid.every((r) => !Array.isArray(r) || r.every((c) => c == null || c === ""));
    if (batchAllEmpty) break;
    for (const row of grid) rows.push(Array.isArray(row) ? row.slice(0, MAX_SHEET_COLS) : []);
    if (grid.length < 50) break;
  }
  const md = renderMarkdownTable(rows);
  return { ok: true, type: "sheet", content: md, title: first.title || first.sheet_id };
}

async function readFeishuSpreadsheet(spreadsheetToken) {
  const tok = await getTenantAccessToken();
  if (!tok) return { ok: false, error: "no_token" };

  const sheetsRes = await axios.get(
    `${getFeishuApiBase()}/sheets/v3/spreadsheets/${encodeURIComponent(spreadsheetToken)}/sheets/query`,
    { headers: { Authorization: `Bearer ${tok}` }, timeout: 30000, validateStatus: () => true }
  );
  if (sheetsRes.status >= 400 || !sheetsRes.data || sheetsRes.data.code !== 0) {
    return { ok: false, status: sheetsRes.status, code: sheetsRes.data && sheetsRes.data.code, msg: sheetsRes.data && sheetsRes.data.msg };
  }

  const sheets = (sheetsRes.data.data && sheetsRes.data.data.sheets) || [];
  if (!sheets.length) return { ok: false, error: "no_sheet" };

  const rendered = [];
  for (const sheet of sheets.slice(0, 5)) {
    if (!sheet || !sheet.sheet_id) continue;
    const rows = [];
    for (let start = 1; start <= MAX_SHEET_ROWS; start += 50) {
      const end = Math.min(MAX_SHEET_ROWS, start + 49);
      const range = `${sheet.sheet_id}!A${start}:AD${end}`;
      const valuesRes = await axios.get(
        `${getFeishuApiBase()}/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheetToken)}/values_batch_get`,
        {
          headers: { Authorization: `Bearer ${tok}` },
          params: { ranges: range, valueRenderOption: "ToString" },
          timeout: 30000,
          validateStatus: () => true,
        }
      );
      if (valuesRes.status >= 400 || !valuesRes.data || valuesRes.data.code !== 0) {
        return { ok: false, status: valuesRes.status, code: valuesRes.data && valuesRes.data.code, msg: valuesRes.data && valuesRes.data.msg };
      }
      const vr = valuesRes.data.data && valuesRes.data.data.valueRanges && valuesRes.data.data.valueRanges[0];
      const grid = (vr && vr.values) || [];
      if (!grid.length) break;
      const batchAllEmpty = grid.every((r) => !Array.isArray(r) || r.every((c) => c == null || c === ""));
      if (batchAllEmpty) break;
      for (const row of grid) rows.push(Array.isArray(row) ? row.slice(0, MAX_SHEET_COLS) : []);
      if (grid.length < 50) break;
    }
    rendered.push(`## ${sheet.title || sheet.sheet_id}\n${renderMarkdownTable(rows) || "(empty sheet)"}`);
  }

  return {
    ok: true,
    type: "spreadsheet",
    title: sheets.find((s) => s && s.title)?.title || spreadsheetToken,
    content: rendered.join("\n\n"),
  };
}

async function readFirstBitableTable(appToken) {
  const tok = await getTenantAccessToken();
  if (!tok) return { ok: false, error: "no_token" };
  const tablesRes = await axios.get(
    `${getFeishuApiBase()}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables`,
    { headers: { Authorization: `Bearer ${tok}` }, timeout: 30000, validateStatus: () => true }
  );
  if (tablesRes.status >= 400 || !tablesRes.data || tablesRes.data.code !== 0) {
    return { ok: false, status: tablesRes.status, code: tablesRes.data && tablesRes.data.code, msg: tablesRes.data && tablesRes.data.msg };
  }
  const tables = (tablesRes.data.data && tablesRes.data.data.items) || [];
  const first = tables[0];
  if (!first || !first.table_id) return { ok: false, error: "no_table" };
  const items = [];
  let pageToken = "";
  for (;;) {
    const recRes = await axios.post(
      `${getFeishuApiBase()}/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(first.table_id)}/records/search`,
      { page_size: 50, page_token: pageToken || undefined },
      { headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, timeout: 30000, validateStatus: () => true }
    );
    if (recRes.status >= 400 || !recRes.data || recRes.data.code !== 0) {
      return { ok: false, status: recRes.status, code: recRes.data && recRes.data.code, msg: recRes.data && recRes.data.msg };
    }
    const data = recRes.data.data || {};
    const batch = data.items || [];
    items.push(...batch);
    if (!data.has_more || items.length >= MAX_BITABLE_RECORDS) break;
    pageToken = data.page_token || "";
    if (!pageToken) break;
  }
  const table = renderBitableTable(items.slice(0, MAX_BITABLE_RECORDS));
  return { ok: true, type: "bitable", content: table, title: first.name || first.table_id };
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
  const text = pickFirstText(
    node.text || node.content || node.name || node.title || node.data || node.props || node
  ).trim();
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
  return nodes.slice(0, MAX_WHITEBOARD_NODES).map((node) => formatWhiteboardNode(node)).join("\n");
}

async function fetchWhiteboardJson(path) {
  const tok = await getTenantAccessToken();
  if (!tok) return { ok: false, error: "no_token" };
  const r = await fetchJson(`${API_BASE}${path}`, { headers: authHeaders(tok) });
  if (r.status >= 400 || !r.body || r.body.code !== 0) {
    return { ok: false, status: r.status, code: r.body && r.body.code, msg: r.body && r.body.msg, body: r.body };
  }
  return { ok: true, body: r.body };
}

async function downloadWhiteboardAsImage(whiteboardId, outPath = "") {
  const tok = await getTenantToken();
  if (!tok) return { ok: false, error: "no_token" };
  const url = `${API_BASE}/board/v1/whiteboards/${encodeURIComponent(whiteboardId)}/download_as_image`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` }, redirect: "follow" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: text || `http_${res.status}` };
  }
  const ct = res.headers.get("content-type") || "";
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const filePath =
    outPath ||
    path.join(os.tmpdir(), `feishu-whiteboard-${whiteboardId}-${Date.now()}.${ct.includes("png") ? "png" : "bin"}`);
  fs.writeFileSync(filePath, buf);
  return { ok: true, filePath, contentType: ct, size: buf.length };
}

async function readFeishuWhiteboard(whiteboardId) {
  const titleRes = await fetchWhiteboardJson(`/board/v1/whiteboards/${encodeURIComponent(whiteboardId)}/theme`);
  const title =
    (titleRes.ok && pickFirstText(titleRes.body?.data?.theme?.title)) ||
    (titleRes.ok && pickFirstText(titleRes.body?.data?.title)) ||
    whiteboardId;

  const nodesRes = await fetchWhiteboardJson(`/board/v1/whiteboards/${encodeURIComponent(whiteboardId)}/nodes`);
  if (nodesRes.ok) {
    const data = nodesRes.body?.data || {};
    const nodes =
      data.nodes ||
      data.items ||
      data.node_list ||
      data.whiteboard_nodes ||
      data.children ||
      [];
    const rendered = renderWhiteboardNodeList(nodes);
    if (rendered) {
      return {
        ok: true,
        type: "whiteboard",
        title,
        content: `# ${title}\n\n## 节点结构\n${rendered}`,
        image: null,
      };
    }
  }

  const imageRes = await downloadWhiteboardAsImage(whiteboardId);
  if (!imageRes.ok) {
    return {
      ok: false,
      status: imageRes.status,
      error: imageRes.error || "whiteboard_image_failed",
      title,
    };
  }
  return {
    ok: true,
    type: "whiteboard",
    title,
    content: `# ${title}\n\n## 节点结构\n(未获取到可解析节点，已降级为图片导出)\n\n## 图片结果\n${imageRes.filePath}`,
    image: imageRes.filePath,
  };
}

async function readFeishuOnlineDoc(url) {
  const meta = classifyFeishuUrl(url);
  if (!meta) return { ok: false, error: "not_feishu_doc" };
  if (meta.type === "docx") return readDocx(meta.token);
  if (meta.type === "wiki") {
    const wiki = await resolveWikiToDocToken(meta.token);
    if (!wiki.ok) return wiki;
    if (wiki.objType === "docx" && wiki.objToken) return readDocx(wiki.objToken);
    return { ok: false, error: `unsupported_wiki_obj:${wiki.objType || "unknown"}` };
  }
  if (meta.type === "sheet") return readFirstSheet(meta.token);
  if (meta.type === "bitable") return readFirstBitableTable(meta.token);
  return { ok: false, error: `unsupported_type:${meta.type}` };
}

async function readFeishuOnlineDocViaApi(url) {
  const result = await readFeishuOnlineDoc(url);
  if (result && result.ok) {
    return { ...result, source: "api" };
  }
  return normalizeApiError(result);
}

async function readFeishuOnlineDocViaBrowser(url) {
  const target = normalizeFeishuPasteUrl(String(url || "").trim());
  try {
    const { stdout } = await execFileAsync(
      "python3",
      [BROWSER_READ_SCRIPT, target],
      {
        timeout: 45000,
        maxBuffer: 5 * 1024 * 1024,
      }
    );
    return normalizeBrowserPayload(stdout);
  } catch (error) {
    if (error && error.stdout) {
      try {
        return normalizeBrowserPayload(error.stdout);
      } catch {}
    }
    return {
      ok: false,
      error: "browser_page_unreadable",
      detail: String((error && error.message) || error || "unknown"),
      source: "browser_fallback",
    };
  }
}

async function readFeishuOnlineDocWithFallback(url) {
  const input = normalizeFeishuPasteUrl(String(url || "").trim());
  const meta = classifyFeishuUrl(input);
  if (!meta) return { ok: false, error: "not_feishu_doc" };

  const apiResult = await readFeishuOnlineDocViaApi(input);
  if (apiResult.ok || !shouldUseBrowserFallback(apiResult, meta)) {
    return apiResult;
  }

  const browserResult = await readFeishuOnlineDocViaBrowser(input);
  if (browserResult.ok) {
    return {
      ...browserResult,
      fallbackFrom: apiResult.error || "api_failed",
    };
  }
  return {
    ...browserResult,
    fallbackFrom: apiResult.error || "api_failed",
    apiError: apiResult.error || apiResult.msg || apiResult.code || "unknown",
  };
}

// ── T2a: 从正文内容中发现嵌入白板 URL ──

function extractEmbeddedResourcesFromContent(content, options = {}) {
  if (!content) return [];
  const urls = extractUrls(content).filter((u) => /feishu|larksuite/i.test(u));
  const seen = new Set();
  const results = [];
  for (const url of urls) {
    const meta = classifyFeishuUrl(url);
    if (!meta || meta.type !== "whiteboard") continue;
    if (seen.has(meta.token)) continue;
    seen.add(meta.token);
    results.push({
      type: "whiteboard",
      token: meta.token,
      url,
      relation: "embedded_whiteboard",
      origin: "content_url",
    });
  }
  return results;
}

// ── T2b: 从文档 blocks 结构中发现嵌入白板 ──

function extractWhiteboardUrlsFromValue(value, hits, depth = 0) {
  if (depth > 10 || !value) return;
  if (typeof value === "string") {
    const urls = value.match(FEISHU_URL_RE) || [];
    for (const u of urls) {
      if (!/feishu|larksuite/i.test(u)) continue;
      hits.push(normalizeFeishuPasteUrl(u));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) {
      extractWhiteboardUrlsFromValue(item, hits, depth + 1);
    }
    return;
  }
  if (typeof value === "object") {
    for (const key of ["url", "link", "href", "content", "text", "elements", "text_run",
      "text_element_style", "style", "embed", "children", "block_content"]) {
      if (value[key] != null) {
        extractWhiteboardUrlsFromValue(value[key], hits, depth + 1);
      }
    }
  }
}

function extractEmbeddedResourcesFromDocBlocks(blocks, options = {}) {
  if (!Array.isArray(blocks) || !blocks.length) return [];
  const allUrls = [];
  try {
    for (const block of blocks.slice(0, 500)) {
      extractWhiteboardUrlsFromValue(block, allUrls, 0);
    }
  } catch {
    return [];
  }
  const seen = new Set();
  const results = [];
  for (const url of allUrls) {
    const clean = normalizeFeishuPasteUrl(url);
    const meta = classifyFeishuUrl(clean);
    if (!meta || meta.type !== "whiteboard") continue;
    if (seen.has(meta.token)) continue;
    seen.add(meta.token);
    const origin = clean.includes("embed") ? "doc_block_embed" : "doc_block_link";
    results.push({
      type: "whiteboard",
      token: meta.token,
      url: clean,
      relation: "embedded_whiteboard",
      origin,
    });
  }
  return results;
}

// ── T2c: 统一嵌入资源发现 ──

function extractEmbeddedResources(resource, options = {}) {
  if (!resource || !resource.ok) return { discovered: [], discoveryCapability: "none" };
  const resourceType = resource.type || "";
  if (!["docx", "wiki", "webpage"].includes(resourceType) && resource.source !== "browser_fallback") {
    return { discovered: [], discoveryCapability: "none" };
  }

  const fromBlocks = (resource.blocks && resource.blocks.length)
    ? extractEmbeddedResourcesFromDocBlocks(resource.blocks, options)
    : [];
  const fromContent = extractEmbeddedResourcesFromContent(resource.content, options);

  const seen = new Set();
  const merged = [];
  for (const item of [...fromBlocks, ...fromContent]) {
    if (seen.has(item.token)) continue;
    seen.add(item.token);
    merged.push(item);
  }

  const discoveryCapability = (resource.blocks && resource.blocks.length) ? "full" : (resource.content ? "content_only" : "none");
  return { discovered: merged, discoveryCapability };
}

// ── T3: 子资源递归加载 ──

async function loadChildResources(discovered, options = {}) {
  const maxChildren = options.maxChildren || 5;
  const seen = options.seen || new Set();
  const children = [];
  const failures = [];
  const warnings = [];

  const toLoad = discovered.slice(0, maxChildren);
  if (discovered.length > maxChildren) {
    warnings.push(`child_limit_reached: discovered ${discovered.length}, loading ${maxChildren}`);
  }

  for (const item of toLoad) {
    if (seen.has(item.token)) continue;
    seen.add(item.token);
    try {
      const result = await readFeishuWhiteboard(item.token);
      if (result && result.ok) {
        children.push({
          type: item.type,
          token: item.token,
          url: item.url,
          relation: item.relation,
          origin: item.origin,
          result: {
            ok: true,
            type: result.type,
            title: result.title || item.token,
            content: result.content || "",
            summary: summarizeWhiteboardResult(result),
          },
        });
      } else {
        failures.push({
          type: item.type,
          token: item.token,
          url: item.url,
          error: (result && result.error) || "unknown",
        });
      }
    } catch (err) {
      failures.push({
        type: item.type,
        token: item.token,
        url: item.url,
        error: String((err && err.message) || err),
      });
    }
  }

  return { children, failures, warnings };
}

// ── T4: 摘要函数 ──

function summarizeContent(content, maxChars = 4000) {
  const text = String(content || "");
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n...(内容已截断，共 ${text.length} 字)`;
}

function summarizeWhiteboardResult(result, maxChars = 2500) {
  if (!result || !result.content) return "";
  const content = String(result.content);
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + `\n...(白板内容已截断，共 ${content.length} 字)`;
}

// ── T5: 统一资源图读取器（核心） ──

async function readFeishuResourceGraph(url, options = {}) {
  const input = normalizeFeishuPasteUrl(String(url || "").trim());
  if (options.enabled === false) {
    return readFeishuOnlineDocWithFallback(input);
  }

  const meta = classifyFeishuUrl(input);
  if (!meta) return { ok: false, error: "not_feishu_doc", url: input, stats: {}, warnings: [] };

  if (meta.type === "whiteboard") {
    const result = await readFeishuWhiteboard(meta.token);
    return {
      ...result,
      url: input,
      token: meta.token,
      summary: result.ok ? summarizeWhiteboardResult(result) : "",
      discovered: [],
      children: [],
      failures: [],
      stats: { discoveredResources: 0, discoveredWhiteboards: 0, loadedChildren: 0, failedChildren: 0 },
      discoveryCapability: "none",
      warnings: [],
    };
  }

  const primary = await readFeishuOnlineDocWithFallback(input);
  if (!primary || !primary.ok) {
    return {
      ...primary,
      url: input,
      token: meta.token,
      discovered: [],
      children: [],
      failures: [],
      stats: { discoveredResources: 0, discoveredWhiteboards: 0, loadedChildren: 0, failedChildren: 0 },
      discoveryCapability: "none",
      warnings: [],
    };
  }

  let resolvedDocToken = meta.token;
  if (meta.type === "wiki") {
    try {
      const wiki = await resolveWikiToDocToken(meta.token);
      if (wiki.ok && wiki.objType === "docx" && wiki.objToken) {
        resolvedDocToken = wiki.objToken;
      }
    } catch {}
  }

  let blocks = null;
  if (["docx", "wiki"].includes(meta.type) || (primary.type === "docx")) {
    const blocksResult = await readDocxBlocks(resolvedDocToken);
    if (blocksResult.ok && blocksResult.blocks) {
      blocks = blocksResult.blocks;
    }
  }

  const resourceWithBlocks = { ...primary, blocks };
  const { discovered, discoveryCapability } = extractEmbeddedResources(resourceWithBlocks, options);

  let children = [];
  let failures = [];
  let childWarnings = [];
  const whiteboards = discovered.filter((d) => d.type === "whiteboard");

  if (whiteboards.length > 0) {
    const loaded = await loadChildResources(whiteboards, {
      maxChildren: options.maxChildren || 5,
      seen: new Set(),
    });
    children = loaded.children;
    failures = loaded.failures;
    childWarnings = loaded.warnings;
  }

  const warnings = [...childWarnings];
  if (discoveryCapability === "content_only") {
    warnings.push("browser_fallback_discovery_limited: 主文档通过浏览器兜底读取，内嵌白板发现能力受限（仅基于正文链接）");
  }

  return {
    ok: true,
    url: input,
    type: primary.type || meta.type,
    token: meta.token,
    title: primary.title || "",
    source: primary.source || "api",
    discoveryCapability,
    content: primary.content || "",
    summary: summarizeContent(primary.content),
    discovered,
    children,
    failures,
    stats: {
      discoveredResources: discovered.length,
      discoveredWhiteboards: whiteboards.length,
      loadedChildren: children.length,
      failedChildren: failures.length,
    },
    warnings,
  };
}

// ── T6: 统一回复格式化 ──

function formatFeishuResourceGraphReply(graph, url) {
  if (!graph || !graph.ok) {
    return formatFeishuDocReply(graph, url || (graph && graph.url) || "");
  }

  const parts = [];
  const title = graph.title || graph.token || "";
  parts.push(`已读取飞书资源：${title}`);
  parts.push(`类型：${graph.type || "unknown"}`);
  if (graph.source && graph.source !== "api") {
    parts.push(`来源：${graph.source}`);
  }

  const stats = graph.stats || {};
  if (graph.discoveryCapability && graph.discoveryCapability !== "none") {
    parts.push(`内嵌发现能力：${graph.discoveryCapability}`);
    parts.push(`发现内嵌白板：${stats.discoveredWhiteboards || 0}`);
    if (stats.discoveredWhiteboards > 0) {
      parts.push(`成功读取：${stats.loadedChildren || 0}`);
      if (stats.failedChildren > 0) {
        parts.push(`失败：${stats.failedChildren}`);
      }
    }
  }

  parts.push("");
  parts.push("## 主文档摘要");
  parts.push(graph.summary || graph.content || "(空)");

  if (graph.children && graph.children.length > 0) {
    parts.push("");
    parts.push("## 已读取白板");
    for (let i = 0; i < graph.children.length; i++) {
      const child = graph.children[i];
      const childTitle = (child.result && child.result.title) || child.token || `白板 ${i + 1}`;
      parts.push(`### ${i + 1}. ${childTitle}`);
      parts.push((child.result && child.result.summary) || "(无内容)");
    }
  }

  if (graph.failures && graph.failures.length > 0) {
    parts.push("");
    parts.push("## 未成功读取白板");
    for (const f of graph.failures) {
      parts.push(`- ${f.url || f.token}：${f.error}`);
    }
  }

  if (graph.warnings && graph.warnings.length > 0) {
    parts.push("");
    parts.push("## 说明");
    for (const w of graph.warnings) {
      parts.push(`- ${w}`);
    }
  }

  const MAX_GRAPH_REPLY = 8000;
  const out = parts.join("\n");
  if (out.length > MAX_GRAPH_REPLY)
    return out.slice(0, MAX_GRAPH_REPLY) + `\n...(内容已截断，共 ${out.length} 字)`;
  return out;
}

function normalizeApiError(result) {
  const error = result || { ok: false, error: "unknown" };
  const msg = String(error.msg || "");
  if (isBitableScopeDenied(error)) {
    return {
      ...error,
      error: "api_scope_denied",
      source: "api",
    };
  }
  if (error.error === "no_token") {
    return {
      ...error,
      error: "no_token",
      source: "api",
    };
  }
  if ((error.status >= 400 && error.status < 500) || /permission|access denied/i.test(msg)) {
    return {
      ...error,
      error: "api_permission_denied",
      source: "api",
    };
  }
  return {
    ...error,
    source: "api",
  };
}

function isBitableScopeDenied(result) {
  const msg = String(result && result.msg || "");
  return result && (
    result.code === 99991672 ||
    /bitable:app|bitable:app:readonly|base:record:retrieve/i.test(msg)
  );
}

function shouldUseBrowserFallback(result, meta) {
  if (!result || result.ok || !meta) return false;
  if (result.error === "no_token") return true;
  if (result.error === "api_scope_denied") return true;
  if (typeof result.error === "string" && result.error.startsWith("unsupported_")) return true;
  if (result.error === "api_permission_denied") return true;
  if (meta.type === "bitable" && (result.status >= 400 || result.code)) return true;
  return false;
}

function normalizeBrowserPayload(raw) {
  const payload = JSON.parse(String(raw || "").trim() || "{}");
  if (payload.ok) {
    return {
      ok: true,
      type: "webpage",
      title: payload.title || "",
      content: String(payload.text || "").trim(),
      source: "browser_fallback",
      url: payload.url || "",
    };
  }
  const stateMap = {
    login_required: "browser_login_required",
    permission_denied: "browser_permission_denied",
    not_found: "browser_page_unreadable",
    empty: "browser_page_unreadable",
  };
  return {
    ok: false,
    error: stateMap[payload.state] || "browser_page_unreadable",
    title: payload.title || "",
    detail: payload.error || payload.state || "unknown",
    source: "browser_fallback",
    url: payload.url || "",
  };
}

function formatFeishuDocReply(result, url) {
  if (!result || !result.ok) {
    const detail = result && (result.detail || result.msg || result.code || "unknown");
    const source = result && result.source === "browser_fallback" ? "来源：browser_fallback\n" : "";
    return `飞书在线文档读取失败：${result && (result.error || "unknown")}\n${source}详情：${detail}\n${url}`;
  }
  const content = String(result.content || "").trim();
  if (!content) return `飞书在线文档内容为空：${url}`;
  const title = result.title ? `标题：${result.title}\n` : "";
  const source = result.source && result.source !== "api" ? `来源：${result.source}\n` : "";
  const MAX_DOC_REPLY = 6000;
  const reply = `飞书在线文档（${result.type}）\n${source}${title}${content}`;
  if (reply.length > MAX_DOC_REPLY)
    return reply.slice(0, MAX_DOC_REPLY) + `\n...(内容已截断，共 ${reply.length} 字)`;
  return reply;
}

function renderMarkdownTable(rows) {
  const all = (rows || []).map((row) =>
    (Array.isArray(row) ? row.map(cell => String(cell == null ? "" : cell)) : [])
  );
  if (!all.length) return "";

  // 找出真正有内容的最右列（跳过全空列），避免 30 列宽的空表头
  let effectiveWidth = 0;
  for (const row of all) {
    for (let i = row.length - 1; i >= 0; i--) {
      if (row[i] && row[i].trim()) { if (i + 1 > effectiveWidth) effectiveWidth = i + 1; break; }
    }
  }
  const width = Math.min(MAX_SHEET_COLS, Math.max(effectiveWidth, 1));

  // 去掉尾部全空行（飞书 API 会把整个网格都返回，末尾大量空行）
  let lastDataRow = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    const row = all[i].slice(0, width);
    if (row.some((c) => c && c.trim())) { lastDataRow = i; break; }
  }
  const cleaned = all.slice(0, lastDataRow + 1);

  const header = cleaned[0].slice(0, width);
  while (header.length < width) header.push("");
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
}

function renderBitableTable(items) {
  if (!items || !items.length) return "";
  const fieldSet = new Set();
  for (const item of items) {
    const fields = item && item.fields ? item.fields : {};
    for (const k of Object.keys(fields).slice(0, 12)) fieldSet.add(k);
    if (fieldSet.size >= 8) break;
  }
  const headers = Array.from(fieldSet).slice(0, 8);
  if (!headers.length) return items.map((item, idx) => `- 记录 ${idx + 1}`).join("\n");
  const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
  const out = [];
  out.push(`| ${headers.map(esc).join(" | ")} |`);
  out.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const item of items) {
    const fields = item && item.fields ? item.fields : {};
    out.push(`| ${headers.map((k) => esc(formatBitableCellValue(fields[k]))).join(" | ")} |`);
  }
  return out.join("\n");
}

const MAX_CELL_VALUE_CHARS = 300;
function formatBitableCellValue(value, depth = 0) {
  if (value == null) return "";
  if (typeof value === "string") {
    if (depth === 0 && value.length > MAX_CELL_VALUE_CHARS)
      return value.slice(0, MAX_CELL_VALUE_CHARS - 1) + "…";
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (depth >= 3) return "";

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => formatBitableCellValue(item, depth + 1))
      .filter(Boolean);
    return uniqJoin(parts);
  }

  if (typeof value === "object") {
    const preferredKeys = [
      "text",
      "name",
      "title",
      "content",
      "value",
      "label",
      "desc",
      "description",
      "email",
      "url",
      "link",
    ];
    const parts = [];
    for (const key of preferredKeys) {
      if (value[key] == null) continue;
      const formatted = formatBitableCellValue(value[key], depth + 1);
      if (formatted) parts.push(formatted);
    }
    if (parts.length) return uniqJoin(parts);

    const direct = pickFirstText(value).trim();
    if (direct && direct !== "[object Object]") return direct;

    const fallback = Object.values(value)
      .slice(0, 8)
      .map((item) => formatBitableCellValue(item, depth + 1))
      .filter(Boolean);
    if (fallback.length) return uniqJoin(fallback);

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  const raw = String(value);
  if (depth === 0 && raw.length > MAX_CELL_VALUE_CHARS) return raw.slice(0, MAX_CELL_VALUE_CHARS - 1) + "…";
  return raw;
}

function uniqJoin(parts) {
  return Array.from(new Set(parts.map((s) => String(s).trim()).filter(Boolean))).join(", ");
}

module.exports = {
  extractUrls,
  normalizeFeishuPasteUrl,
  classifyFeishuUrl,
  readFeishuOnlineDoc,
  readFeishuOnlineDocViaApi,
  readFeishuOnlineDocViaBrowser,
  readFeishuOnlineDocWithFallback,
  readFeishuSpreadsheet,
  readFeishuWhiteboard,
  shouldUseBrowserFallback,
  formatFeishuDocReply,
  renderBitableTable,
  formatBitableCellValue,
  readDocxBlocks,
  extractEmbeddedResourcesFromContent,
  extractEmbeddedResourcesFromDocBlocks,
  extractEmbeddedResources,
  loadChildResources,
  summarizeContent,
  summarizeWhiteboardResult,
  readFeishuResourceGraph,
  formatFeishuResourceGraphReply,
};
