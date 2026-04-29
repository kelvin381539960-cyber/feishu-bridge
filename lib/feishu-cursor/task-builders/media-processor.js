"use strict";

const { extractTextFromFetchedMessageData } = require("../../feishu-im-parse");

function createMediaProcessor(deps) {
  const d = deps || {};
  const {
    downloadImage,
    downloadResource,
    fetchMessage,
    cleanupFile,
    describeImage,
    extractFileText,
    transcribeAudio,
    processVideo,
    processSticker,
  } = d;

  return async function processMedia(media) {
    if (!media) return null;
    const files = [];
    try {
      switch (media.type) {
        case "image": {
          const dl = await downloadImage(media.imageKey);
          if (!dl) return "[图片] (下载失败)";
          files.push(dl.path);
          return await describeImage(dl.path);
        }
        case "file": {
          const dl = await downloadResource(
            media.messageId,
            media.fileKey,
            media.fileName
          );
          if (!dl) return `[文件: ${media.fileName}] (下载失败)`;
          files.push(dl.path);
          return await extractFileText(dl.path, media.fileName);
        }
        case "audio": {
          const dl = await downloadResource(
            media.messageId,
            media.fileKey,
            media.fileName
          );
          if (!dl) return "[语音] (下载失败)";
          files.push(dl.path);
          return await transcribeAudio(dl.path, media.fileName);
        }
        case "video": {
          const dl = await downloadResource(
            media.messageId,
            media.fileKey,
            media.fileName
          );
          if (!dl) return "[视频] (下载失败)";
          files.push(dl.path);
          return await processVideo(dl.path, media.fileName);
        }
        case "sticker":
          return processSticker(media.emojiType);
        case "merge_forward": {
          if (!media.messageId) return "[合并转发] (无法获取内容)";
          const msgData = await fetchMessage(media.messageId);
          const body = extractTextFromFetchedMessageData(msgData);
          if (!body) return "[合并转发] (内容为空)";
          return `[合并转发内容]\n${body}`;
        }
        case "share_chat":
          return `[群分享: ${media.chatName || media.chatId || "未知群组"}]`;
        case "share_user":
          return `[名片分享: ${media.userId || "未知用户"}]`;
        default:
          return `[${media.type}]`;
      }
    } finally {
      for (const f of files) cleanupFile(f);
    }
  };
}

module.exports = {
  createMediaProcessor,
};
