"use strict";

const { extractTextFromFetchedMessageData } = require("./feishu-im-parse");

/**
 * 将飞书「引用回复」对应的父消息正文拉取后拼入 task，供 Cursor 理解上文。
 *
 * @param {string} task 用户当前消息的指令文本（已去前缀、非空）
 * @param {string|undefined|null} parentId data.message.parent_id
 * @param {(messageId: string) => Promise<unknown>} fetchMessage 与 lib/feishu-media.fetchMessage 同形
 * @returns {Promise<{ task: string, injected: boolean }>}
 */
async function augmentTaskWithQuotedParent(task, parentId, fetchMessage) {
  let injected = false;
  if (!task || !parentId) {
    return { task, injected };
  }
  let out = task;
  try {
    const parentMsg = await fetchMessage(parentId);
    if (!parentMsg) {
      console.warn(
        "[feishu-ws-cursor] quoted parent fetchMessage returned null:",
        parentId
      );
    } else {
      const parentText = extractTextFromFetchedMessageData(parentMsg);
      if (parentText) {
        out = `[引用消息内容]\n${parentText}\n\n[用户指令]\n${task}`;
        injected = true;
      } else if (parentMsg.items && parentMsg.items.length) {
        console.warn(
          "[feishu-ws-cursor] quoted parent has items but no extractable text:",
          parentId,
          "types=",
          parentMsg.items.map((i) => i && i.msg_type).join(",")
        );
      }
    }
  } catch (e) {
    // 与 feishu-ws-cursor 原逻辑一致：失败则不回填，仅打日志
    console.error(
      "[feishu-ws-cursor] fetchParentMessage error:",
      parentId,
      e && e.message
    );
  }
  return { task: out, injected };
}

module.exports = { augmentTaskWithQuotedParent };
