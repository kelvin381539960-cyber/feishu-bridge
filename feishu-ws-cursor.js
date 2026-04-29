#!/usr/bin/env node
/**
 * 飞书长连接 → OpenClaw Gateway（独立进程；建议使用专用飞书应用，勿与其它通道共用凭证）。
 */
const { startFeishuBridgeHost } = require("./lib/feishu-channel/bridge-host");

try {
  startFeishuBridgeHost();
} catch (error) {
  console.error("[feishu-ws-cursor]", error && error.message ? error.message : String(error));
  process.exit(1);
}
