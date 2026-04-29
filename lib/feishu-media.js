/**
 * Download media files from Feishu/Lark API.
 * Requires FEISHU_APP_ID + secret configured (same as feishu-tenant.js).
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { getTenantAccessToken, getFeishuApiBase } = require("./feishu-tenant");
const axios = require("axios");

const MEDIA_DIR = path.join(os.tmpdir(), "feishu-media");

function ensureMediaDir() {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
  return MEDIA_DIR;
}

function tempPath(prefix, ext) {
  ensureMediaDir();
  return path.join(MEDIA_DIR, `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
}

/**
 * Download an image by image_key.
 * GET /im/v1/images/:image_key?image_type=message
 * Returns { path, mimeType } or null.
 */
async function downloadImage(imageKey) {
  const token = await getTenantAccessToken();
  if (!token) return null;
  const base = getFeishuApiBase();
  const url = `${base}/im/v1/images/${imageKey}`;
  try {
    const res = await axios.get(url, {
      params: { image_type: "message" },
      headers: { Authorization: `Bearer ${token}` },
      responseType: "arraybuffer",
      timeout: 30000,
    });
    const ct = res.headers["content-type"] || "image/png";
    const ext = ct.includes("jpeg") || ct.includes("jpg") ? ".jpg"
      : ct.includes("gif") ? ".gif"
      : ct.includes("webp") ? ".webp"
      : ".png";
    const p = tempPath("img", ext);
    fs.writeFileSync(p, res.data);
    return { path: p, mimeType: ct, size: res.data.length };
  } catch (e) {
    console.error("[feishu-media] downloadImage failed:", imageKey, e.message);
    return null;
  }
}

/**
 * Download a file/audio/video resource by message_id + file_key.
 * GET /im/v1/messages/:message_id/resources/:file_key?type=<type>
 * type: "file" | "image"
 * Returns { path, mimeType, size } or null.
 */
async function downloadResource(messageId, fileKey, fileName) {
  const token = await getTenantAccessToken();
  if (!token) return null;
  const base = getFeishuApiBase();
  const url = `${base}/im/v1/messages/${messageId}/resources/${fileKey}`;
  try {
    const res = await axios.get(url, {
      params: { type: "file" },
      headers: { Authorization: `Bearer ${token}` },
      responseType: "arraybuffer",
      timeout: 60000,
    });
    const ext = fileName ? path.extname(fileName) : "";
    const p = tempPath("file", ext || ".bin");
    fs.writeFileSync(p, res.data);
    return {
      path: p,
      mimeType: res.headers["content-type"] || "application/octet-stream",
      size: res.data.length,
      fileName: fileName || path.basename(p),
    };
  } catch (e) {
    console.error("[feishu-media] downloadResource failed:", messageId, fileKey, e.message);
    return null;
  }
}

/**
 * Fetch a message and its child messages (for merge_forward).
 * GET /im/v1/messages/:message_id
 * Returns the response body or null.
 */
async function fetchMessage(messageId) {
  const token = await getTenantAccessToken();
  if (!token) return null;
  const base = getFeishuApiBase();
  try {
    const res = await axios.get(`${base}/im/v1/messages/${messageId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    if (res.data && res.data.code === 0) return res.data.data;
    console.error("[feishu-media] fetchMessage failed:", messageId, res.data && res.data.code, res.data && res.data.msg);
    return null;
  } catch (e) {
    console.error("[feishu-media] fetchMessage error:", messageId, e.message);
    return null;
  }
}

/**
 * Clean up a temp file (best-effort).
 */
function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

module.exports = { downloadImage, downloadResource, fetchMessage, cleanupFile, MEDIA_DIR };
