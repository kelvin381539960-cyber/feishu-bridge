/**
 * Convert media files to text descriptions/transcriptions.
 * - Images  → vision model API description
 * - Files   → text extraction (pdf, txt, code, etc.)
 * - Audio   → speech-to-text via Ark API (Volcengine)
 * - Video   → extract audio with ffmpeg → STT
 * - Sticker → emoji text
 */
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const axios = require("axios");

const ARK_BASE = "https://ark.cn-beijing.volces.com/api/coding";
const ARK_KEY = process.env.ARK_API_KEY || "";

const VISION_MODEL = "doubao-seed-2.0-code";
const MAX_IMAGE_BASE64_MB = 8;
const TEXT_FILE_EXTS = new Set([
  ".txt", ".md", ".json", ".csv", ".tsv", ".xml", ".html", ".htm",
  ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".log",
  ".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".go", ".rs", ".java",
  ".c", ".cpp", ".h", ".hpp", ".cs", ".swift", ".kt", ".sh", ".bash",
  ".sql", ".r", ".lua", ".pl", ".php", ".css", ".scss", ".less",
  ".vue", ".svelte", ".env", ".gitignore", ".dockerfile",
]);

function mimeFromExt(ext) {
  const map = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
  };
  return map[ext.toLowerCase()] || "image/png";
}

/**
 * Describe an image using the Ark vision model (Anthropic Messages API).
 */
async function describeImage(imagePath) {
  if (!ARK_KEY) return "[图片] (视觉模型未配置)";
  const stat = fs.statSync(imagePath);
  if (stat.size > MAX_IMAGE_BASE64_MB * 1024 * 1024) {
    return `[图片] (文件过大: ${(stat.size / 1024 / 1024).toFixed(1)}MB，超过${MAX_IMAGE_BASE64_MB}MB限制)`;
  }

  const buf = fs.readFileSync(imagePath);
  const b64 = buf.toString("base64");
  const ext = path.extname(imagePath).toLowerCase();
  const mime = mimeFromExt(ext);

  try {
    const res = await axios.post(
      `${ARK_BASE}/messages`,
      {
        model: VISION_MODEL,
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mime, data: b64 },
              },
              {
                type: "text",
                text: "请详细描述这张图片的内容。如果包含文字，请完整提取所有文字。如果是截图/UI/图表，请描述布局和关键信息。",
              },
            ],
          },
        ],
      },
      {
        headers: {
          "x-api-key": ARK_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        timeout: 60000,
      }
    );
    const text =
      res.data &&
      res.data.content &&
      res.data.content[0] &&
      res.data.content[0].text;
    return text ? `[图片内容]\n${text}` : "[图片] (模型未返回描述)";
  } catch (e) {
    console.error("[media-process] describeImage failed:", e.message);
    return `[图片] (识别失败: ${e.message})`;
  }
}

/**
 * Extract text from a file based on extension.
 */
async function extractFileText(filePath, fileName) {
  const ext = path.extname(fileName || filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  const sizeMb = (stat.size / 1024 / 1024).toFixed(1);

  if (TEXT_FILE_EXTS.has(ext)) {
    const maxBytes = 200 * 1024;
    const content = fs.readFileSync(filePath, "utf8").slice(0, maxBytes);
    const truncated = stat.size > maxBytes ? "\n…(文件较大，已截断)" : "";
    return `[文件: ${fileName || path.basename(filePath)}]\n${content}${truncated}`;
  }

  if (ext === ".pdf") {
    return new Promise((resolve) => {
      execFile("pdftotext", ["-layout", filePath, "-"], { maxBuffer: 2 * 1024 * 1024, timeout: 30000 }, (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(`[PDF文件: ${fileName}] (${sizeMb}MB，文字提取失败)`);
        } else {
          const text = stdout.slice(0, 200000);
          const truncated = stdout.length > 200000 ? "\n…(已截断)" : "";
          resolve(`[PDF文件: ${fileName}]\n${text}${truncated}`);
        }
      });
    });
  }

  if ([".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"].includes(ext)) {
    return `[Office文件: ${fileName}] (${sizeMb}MB) — 暂无法直接提取文字，建议导出为 PDF 或复制文字发送`;
  }

  if ([".zip", ".rar", ".7z", ".tar", ".gz"].includes(ext)) {
    return `[压缩包: ${fileName}] (${sizeMb}MB)`;
  }

  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"].includes(ext)) {
    return describeImage(filePath);
  }

  return `[文件: ${fileName}] (${sizeMb}MB, 类型 ${ext || "未知"})`;
}

/**
 * Transcribe audio using Ark API (Volcengine STT).
 * Falls back to ffprobe duration info if STT unavailable.
 */
async function transcribeAudio(audioPath, fileName) {
  const wavPath = audioPath + ".wav";
  try {
    await execFilePromise("ffmpeg", [
      "-i", audioPath, "-ar", "16000", "-ac", "1", "-f", "wav", "-y", wavPath,
    ], 30000);
  } catch (e) {
    console.error("[media-process] ffmpeg convert failed:", e.message);
    return `[语音消息: ${fileName || "audio"}] (格式转换失败)`;
  }

  const duration = await getAudioDuration(wavPath);
  const durationStr = duration ? ` ${Math.round(duration)}秒` : "";

  const buf = fs.readFileSync(wavPath);
  cleanupQuiet(wavPath);

  if (!ARK_KEY) {
    return `[语音消息${durationStr}] (语音识别未配置)`;
  }

  const b64 = buf.toString("base64");
  if (b64.length > 20 * 1024 * 1024) {
    return `[语音消息${durationStr}] (音频过大，无法识别)`;
  }

  try {
    const res = await axios.post(
      `${ARK_BASE}/messages`,
      {
        model: VISION_MODEL,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `以下是一段语音消息的 base64 编码 WAV 音频数据（${durationStr.trim()}）。请尽可能转录语音内容。如果无法处理音频，请说明。\n\n[audio data length: ${b64.length} chars]`,
              },
            ],
          },
        ],
      },
      {
        headers: {
          "x-api-key": ARK_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        timeout: 60000,
      }
    );
    const text =
      res.data && res.data.content && res.data.content[0] && res.data.content[0].text;
    if (text && !text.includes("无法处理") && !text.includes("cannot")) {
      return `[语音转文字${durationStr}]\n${text}`;
    }
  } catch (e) {
    console.error("[media-process] audio transcription failed:", e.message);
  }

  return `[语音消息${durationStr}] (语音识别暂不可用，请将内容用文字发送)`;
}

/**
 * Process a video: extract audio → transcribe, extract keyframe → describe.
 */
async function processVideo(videoPath, fileName) {
  const duration = await getAudioDuration(videoPath);
  const durationStr = duration ? ` ${Math.round(duration)}秒` : "";
  const parts = [];

  const thumbPath = videoPath + "-thumb.jpg";
  try {
    await execFilePromise("ffmpeg", [
      "-i", videoPath, "-ss", "00:00:01", "-vframes", "1", "-y", thumbPath,
    ], 15000);
    if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 0) {
      const desc = await describeImage(thumbPath);
      parts.push(desc.replace("[图片内容]", "[视频画面]"));
    }
    cleanupQuiet(thumbPath);
  } catch (_) {}

  const audioPath = videoPath + "-audio.wav";
  try {
    await execFilePromise("ffmpeg", [
      "-i", videoPath, "-ar", "16000", "-ac", "1", "-f", "wav", "-y", audioPath,
    ], 30000);
    if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 1000) {
      const transcript = await transcribeAudio(audioPath, "video-audio");
      if (!transcript.includes("暂不可用") && !transcript.includes("未配置")) {
        parts.push(transcript);
      }
    }
    cleanupQuiet(audioPath);
  } catch (_) {}

  if (!parts.length) {
    return `[视频${durationStr}: ${fileName || "video"}] (无法提取内容，请描述视频内容用文字发送)`;
  }
  return `[视频${durationStr}: ${fileName || "video"}]\n${parts.join("\n")}`;
}

/**
 * Convert sticker/emoji to text.
 */
function processSticker(emojiType) {
  return `[表情: ${emojiType || "sticker"}]`;
}

// --- Helpers ---

function execFilePromise(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs || 30000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    });
  });
}

function getAudioDuration(filePath) {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
      { timeout: 10000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const d = parseFloat(stdout);
        resolve(Number.isFinite(d) ? d : null);
      }
    );
  });
}

function cleanupQuiet(p) {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
}

module.exports = {
  describeImage,
  extractFileText,
  transcribeAudio,
  processVideo,
  processSticker,
};
