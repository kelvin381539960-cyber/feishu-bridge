"use strict";

const axios = require("axios");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { describeImage } = require("./media-process");
const { getTenantAccessToken, getFeishuApiBase } = require("./feishu-tenant");

const IMAGE_BLOCK_TYPE = 27;
const DEFAULT_SERVER_ORIGIN = "http://127.0.0.1:17654";
const DEFAULT_MAX_IMAGES = 3;
const DEFAULT_CAPTURE_TIMEOUT_MS = 45000;
const DEFAULT_VIEWPORT = { width: 1440, height: 960 };
const MAX_CAPTION_CHARS = 220;

function envBool(name, fallback) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function screenshotsEnabled() {
  return envBool("FEISHU_DOC_EXPORT_SCREENSHOTS", true);
}

function screenshotServerOrigin() {
  return String(process.env.FEISHU_DOC_EXPORT_SCREENSHOT_SERVER || DEFAULT_SERVER_ORIGIN)
    .trim()
    .replace(/\/$/, "");
}

function screenshotMaxImages() {
  const n = Number(process.env.FEISHU_DOC_EXPORT_SCREENSHOT_MAX_IMAGES || DEFAULT_MAX_IMAGES);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_IMAGES;
  return Math.min(Math.floor(n), 8);
}

function screenshotTimeoutMs() {
  const n = Number(process.env.FEISHU_DOC_EXPORT_SCREENSHOT_CAPTURE_TIMEOUT_MS || DEFAULT_CAPTURE_TIMEOUT_MS);
  if (!Number.isFinite(n) || n < 5000) return DEFAULT_CAPTURE_TIMEOUT_MS;
  return Math.min(Math.floor(n), 180000);
}

function randomBlockId() {
  return crypto.randomBytes(8).toString("hex");
}

function textBlock(content) {
  return {
    block_id: randomBlockId(),
    block_type: 2,
    text: {
      elements: [{ text_run: { content: String(content || " ") } }],
    },
  };
}

function headingBlock(level, text) {
  const lv = Math.min(Math.max(Number(level) || 1, 1), 9);
  const blockType = lv + 2;
  const key = `heading${lv}`;
  return {
    block_id: randomBlockId(),
    block_type: blockType,
    [key]: {
      elements: [{ text_run: { content: String(text || "") } }],
    },
  };
}

function dividerBlock() {
  return {
    block_id: randomBlockId(),
    block_type: 22,
    divider: {},
    children: [],
  };
}

function imagePlaceholderBlock(blockId) {
  return {
    block_id: String(blockId || randomBlockId()),
    block_type: IMAGE_BLOCK_TYPE,
    image: {},
    children: [],
  };
}

function normalizeUrl(raw) {
  const v = String(raw || "").trim();
  if (!/^https?:\/\//i.test(v)) return "";
  try {
    const u = new URL(v);
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

function markdownLinks(line) {
  const out = [];
  const s = String(line || "");
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let m;
  while ((m = linkRe.exec(s))) {
    out.push({ label: String(m[1] || "").trim(), url: String(m[2] || "").trim() });
  }
  const urlRe = /https?:\/\/[^\s)>\]]+/g;
  while ((m = urlRe.exec(s))) {
    const url = String(m[0] || "").trim();
    if (!out.some((item) => item.url === url)) out.push({ label: "", url });
  }
  return out;
}

function scoreCandidate(url, section, label, line) {
  const hay = `${url} ${section} ${label} ${line}`.toLowerCase();
  let score = 0;
  if (/(pricing|price|plan|compare|comparison|feature|product|landing|home|hero|dashboard|workflow|ui|界面|产品|功能|页面|落地页)/.test(hay)) score += 4;
  if (/(apple\.com|apps\.apple\.com|play\.google\.com|www\.|app\.)/.test(hay)) score += 2;
  if (/(help|support|docs|open\.feishu|larksuite|feishu\.cn\/docx)/.test(hay)) score -= 3;
  if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/.test(hay)) score -= 4;
  return score;
}

function extractScreenshotCandidates(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const items = [];
  let currentSection = "";
  for (const raw of lines) {
    const trim = raw.trim();
    const hm = trim.match(/^##+\s+(.+)$/);
    if (hm) {
      currentSection = String(hm[1] || "").trim();
      continue;
    }
    const links = markdownLinks(raw);
    for (const entry of links) {
      const url = normalizeUrl(entry.url);
      if (!url) continue;
      items.push({
        url,
        label: String(entry.label || "").trim(),
        section: currentSection,
        line: trim,
        score: scoreCandidate(url, currentSection, entry.label, trim),
      });
    }
  }

  const dedup = new Map();
  for (const item of items) {
    const prev = dedup.get(item.url);
    if (!prev || item.score > prev.score) dedup.set(item.url, item);
  }

  return Array.from(dedup.values())
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
    .slice(0, screenshotMaxImages() * 2);
}

function buildCaptureSelectors(candidate) {
  const hay = `${candidate.section || ""} ${candidate.label || ""} ${candidate.url || ""}`.toLowerCase();
  const selectors = [];
  if (/(pricing|price|plan|compare)/.test(hay)) {
    selectors.push(
      "[data-testid*=pricing]",
      "[class*=pricing]",
      "section[id*=pricing]",
      "section[class*=plan]"
    );
  }
  if (/(feature|capability|功能|特点)/.test(hay)) {
    selectors.push("[class*=feature]", "section[id*=feature]", "section[class*=feature]");
  }
  if (/(hero|landing|home|首页|主页面)/.test(hay)) {
    selectors.push("[class*=hero]", "main section:first-of-type", "header + *");
  }
  if (/(dashboard|workspace|console|控制台)/.test(hay)) {
    selectors.push("[class*=dashboard]", "[role=main]", "main");
  }
  selectors.push("main", "article", "[role=main]", "body");
  return Array.from(new Set(selectors));
}

function fileNameFromUrl(url, idx) {
  try {
    const u = new URL(url);
    const last = (u.pathname.split("/").filter(Boolean).pop() || `capture-${idx + 1}`).replace(/[^A-Za-z0-9._-]/g, "-");
    return last.endsWith(".png") ? last : `${last}.png`;
  } catch {
    return `capture-${idx + 1}.png`;
  }
}

async function callScreenshotServer(candidates) {
  const targets = candidates.map((candidate, index) => ({
    url: candidate.url,
    selectors: buildCaptureSelectors(candidate),
    viewport: DEFAULT_VIEWPORT,
    waitMs: 2200,
    fileName: fileNameFromUrl(candidate.url, index),
  }));
  const endpoint = `${screenshotServerOrigin()}/capture`;
  const r = await axios.post(
    endpoint,
    { targets, viewport: DEFAULT_VIEWPORT, timeoutMs: screenshotTimeoutMs() },
    {
      timeout: screenshotTimeoutMs() + 5000,
      validateStatus: () => true,
    }
  );
  if (r.status >= 400 || !r.data || r.data.ok !== true || !Array.isArray(r.data.results)) {
    const detail = r.data && (r.data.error || r.data.msg);
    throw new Error(`screenshot_server_failed:${r.status}:${detail || "invalid_response"}`);
  }
  return r.data.results;
}

function tempImagePath(idx) {
  return path.join(os.tmpdir(), `feishu-docx-shot-${Date.now()}-${idx}-${crypto.randomBytes(4).toString("hex")}.png`);
}

function clipCaption(text) {
  const v = String(text || "").replace(/\s+/g, " ").trim();
  if (!v) return "";
  if (v.length <= MAX_CAPTION_CHARS) return v;
  return `${v.slice(0, MAX_CAPTION_CHARS - 1)}…`;
}

async function enrichCaptureResult(result, candidate, idx) {
  if (!result || result.ok !== true || !result.pngBase64) return null;
  const buffer = Buffer.from(String(result.pngBase64), "base64");
  if (!buffer.length) return null;
  const tempPath = tempImagePath(idx);
  fs.writeFileSync(tempPath, buffer);
  let caption = "";
  try {
    caption = clipCaption(await describeImage(tempPath));
  } catch {
    caption = "";
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  }
  const fallbackCaption = clipCaption(`${candidate.section || candidate.label || "竞品界面截图"}。来源页面：${candidate.url}`);
  return {
    title: clipCaption(candidate.section || candidate.label || candidate.url),
    sourceUrl: candidate.url,
    captureMode: String(result.captureMode || "full_page"),
    selectorUsed: String(result.selectorUsed || "").trim(),
    buffer,
    caption: caption || fallbackCaption,
  };
}

function pngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  const sig = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== sig) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

function scaledDimensions(dim) {
  if (!dim || !dim.width || !dim.height) return {};
  const maxWidth = 1200;
  if (dim.width <= maxWidth) return dim;
  const ratio = maxWidth / dim.width;
  return { width: Math.round(dim.width * ratio), height: Math.round(dim.height * ratio) };
}

function buildAppendixBlocks(images) {
  if (!Array.isArray(images) || !images.length) return { blocks: [], pendingImages: [] };
  const blocks = [dividerBlock(), headingBlock(2, "竞品界面截图")];
  const pendingImages = [];
  images.forEach((item, idx) => {
    blocks.push(textBlock(`${idx + 1}. ${item.title || "竞品界面截图"}`));
    const imageBlockId = randomBlockId();
    blocks.push(imagePlaceholderBlock(imageBlockId));
    blocks.push(
      textBlock(
        `来源：${item.sourceUrl}${item.captureMode ? `\n截图方式：${item.captureMode}` : ""}${item.selectorUsed ? `\n区域选择器：${item.selectorUsed}` : ""}`
      )
    );
    pendingImages.push({
      blockId: imageBlockId,
      buffer: item.buffer,
      fileName: fileNameFromUrl(item.sourceUrl, idx),
      caption: item.caption,
      dimensions: scaledDimensions(pngDimensions(item.buffer)),
    });
  });
  return { blocks, pendingImages };
}

async function buildResearchImageAppendix(markdown, logger) {
  const lg = logger || console;
  if (!screenshotsEnabled()) return { blocks: [], pendingImages: [] };
  const candidates = extractScreenshotCandidates(markdown).slice(0, screenshotMaxImages());
  if (!candidates.length) return { blocks: [], pendingImages: [] };
  let results;
  try {
    results = await callScreenshotServer(candidates);
  } catch (e) {
    (lg.log || console.log).call(lg, "[feishu-docx-image] screenshot skip", String(e && e.message ? e.message : e));
    return { blocks: [], pendingImages: [] };
  }
  const enriched = [];
  for (let i = 0; i < results.length; i += 1) {
    const item = await enrichCaptureResult(results[i], candidates[i], i);
    if (item) enriched.push(item);
  }
  return buildAppendixBlocks(enriched.slice(0, screenshotMaxImages()));
}

async function uploadDocxImage(blockId, fileName, buffer) {
  const tok = await getTenantAccessToken();
  if (!tok) return { ok: false, error: "no_token" };
  const form = new FormData();
  form.append("file_name", String(fileName || "capture.png"));
  form.append("parent_type", "docx_image");
  form.append("parent_node", String(blockId || ""));
  form.append("size", String(buffer.length || 0));
  form.append("file", new Blob([buffer], { type: "image/png" }), String(fileName || "capture.png"));
  const res = await fetch(`${getFeishuApiBase()}/drive/v1/medias/upload_all`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tok}`,
    },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data || data.code !== 0 || !(data.data && data.data.file_token)) {
    return {
      ok: false,
      error: "upload_image_failed",
      status: res.status,
      code: data && data.code,
      msg: data && data.msg,
    };
  }
  return { ok: true, fileToken: data.data.file_token };
}

async function bindDocxImage(documentId, blockId, fileToken, caption, dimensions) {
  const tok = await getTenantAccessToken();
  if (!tok) return { ok: false, error: "no_token" };
  const payload = {
    replace_image: {
      token: String(fileToken || ""),
    },
  };
  if (caption) payload.replace_image.caption = { content: String(caption) };
  if (dimensions && dimensions.width && dimensions.height) {
    payload.replace_image.width = dimensions.width;
    payload.replace_image.height = dimensions.height;
  }
  const r = await axios.patch(
    `${getFeishuApiBase()}/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(blockId)}`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${tok}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      timeout: 30000,
      validateStatus: () => true,
    }
  );
  if (r.status >= 400 || !r.data || r.data.code !== 0) {
    return {
      ok: false,
      error: "bind_image_failed",
      status: r.status,
      code: r.data && r.data.code,
      msg: r.data && r.data.msg,
    };
  }
  return { ok: true };
}

async function bindPendingImages(documentId, pendingImages, logger) {
  const lg = logger || console;
  const list = Array.isArray(pendingImages) ? pendingImages : [];
  for (const item of list) {
    const up = await uploadDocxImage(item.blockId, item.fileName, item.buffer);
    if (!up.ok) {
      (lg.error || console.error).call(lg, "[feishu-docx-image] upload failed", up);
      continue;
    }
    const br = await bindDocxImage(documentId, item.blockId, up.fileToken, item.caption, item.dimensions);
    if (!br.ok) {
      (lg.error || console.error).call(lg, "[feishu-docx-image] bind failed", br);
      continue;
    }
  }
}

module.exports = {
  buildResearchImageAppendix,
  bindPendingImages,
  _test: {
    extractScreenshotCandidates,
    buildCaptureSelectors,
    buildAppendixBlocks,
    clipCaption,
    pngDimensions,
    scaledDimensions,
  },
};
