"use strict";

const fs = require("fs");
const lark = require("@larksuiteoapi/node-sdk");
const {
  loadFeishuCursorConfig,
} = require("../feishu-cursor/config/load-feishu-cursor-config");
const { createFeishuChannelRunner } = require("./channel-runner");

function resolveAppSecret(secretFile) {
  let s = (process.env.FEISHU_APP_SECRET || "").trim();
  if (s) return s;
  try {
    if (secretFile && fs.existsSync(secretFile)) {
      s = fs.readFileSync(secretFile, "utf8").trim();
    }
  } catch (e) {
    console.error("[feishu-ws-cursor] 读密钥文件失败:", secretFile, e.message);
  }
  return s;
}

function createFeishuBridgeHost() {
  const runtimeConfig = loadFeishuCursorConfig(process.env);
  const appId = runtimeConfig.appId;
  const secretFile = runtimeConfig.appSecretFile;
  const credentialPollMs = runtimeConfig.credentialPollMs;

  if (!appId) {
    throw new Error("需要 FEISHU_APP_ID（飞书应用）");
  }
  if (!runtimeConfig.triggerEnabled) {
    throw new Error("请设置 FEISHU_CURSOR_TRIGGER_ENABLED=1，否则不会处理消息");
  }
  if (!String(process.env.OPENCLAW_GATEWAY_URL || "").trim()) {
    throw new Error("需要 OPENCLAW_GATEWAY_URL（例 ws://内网IP:31721）");
  }

  const domain =
    runtimeConfig.larkDomain === "lark" ? lark.Domain.Lark : lark.Domain.Feishu;
  const runner = createFeishuChannelRunner();
  const routing = runner.routing;
  const channelPlugin = runner.channelPlugin;

  let wsClient = null;
  let aliveTimer = null;
  let started = false;

  function handleImMessageReceiveV1(data) {
    setImmediate(() => {
      runner.handleEvent(data).catch((e) => {
        console.error("[feishu-ws-cursor] pipeline error", e);
      });
    });
    return Promise.resolve();
  }

  const dispatcher = new lark.EventDispatcher({
    loggerLevel: lark.LoggerLevel.warn,
  }).register({
    "im.message.receive_v1": handleImMessageReceiveV1,
  });

  function shutdown(signal) {
    console.log(`[feishu-ws-cursor] ${signal}, closing WebSocket...`);
    if (aliveTimer) {
      try {
        clearInterval(aliveTimer);
      } catch (_) {}
    }
    try {
      if (wsClient) wsClient.close({ force: true });
    } catch (_) {}
    process.exit(0);
  }

  function startWsClient(appSecret) {
    if (started) return;
    started = true;

    wsClient = new lark.WSClient({
      appId,
      appSecret,
      domain,
      loggerLevel: lark.LoggerLevel.info,
      autoReconnect: true,
    });

    const aliveSec = Math.max(60, Number(process.env.FEISHU_WS_ALIVE_LOG_SEC) || 300);
    aliveTimer = setInterval(() => {
      const info = wsClient.getReconnectInfo && wsClient.getReconnectInfo();
      console.log(
        "[feishu-ws-cursor] alive",
        new Date().toISOString(),
        info ? JSON.stringify(info) : ""
      );
    }, aliveSec * 1000);
    aliveTimer.unref();

    wsClient.start({ eventDispatcher: dispatcher });
    console.log(
      "[feishu-ws-cursor] pipeline=v2 routing=%s agent=openclaw channel=%s",
      routing.direct ? "direct" : "prefix",
      runtimeConfig.channelRuntimeMode
    );
    console.log(
      "[feishu-ws-cursor] Feishu WS → OpenClaw 已启动；domain=%s direct=%s",
      runtimeConfig.larkDomain,
      String(routing.direct)
    );

    channelPlugin
      .getBotSelfOpenId()
      .then((oid) => {
        if (oid) {
          const reqAt =
            (process.env.FEISHU_CURSOR_GROUP_REQUIRE_AT_BOT || "1").trim() !== "0";
          console.log(
            reqAt
              ? "[feishu-ws-cursor] bot open_id 已缓存，群聊将校验 @mentions"
              : "[feishu-ws-cursor] bot open_id 已缓存，群聊不要求 @（FEISHU_CURSOR_GROUP_REQUIRE_AT_BOT=0）"
          );
        } else {
          console.error(
            "[feishu-ws-cursor] 无法获取 bot open_id，群聊消息可能被全部跳过（请检查 bot/v3/info）"
          );
        }
      })
      .catch((e) => console.error("[feishu-ws-cursor] getBotSelfOpenId", e));

    const mode = (process.env.FEISHU_CURSOR_MODE || "prefix").trim().toLowerCase();
    const hasAllow = Boolean(
      process.env.FEISHU_CURSOR_ALLOWED_CHAT_IDS &&
        String(process.env.FEISHU_CURSOR_ALLOWED_CHAT_IDS).trim()
    );
    if (mode === "direct" && !hasAllow) {
      const reqAt =
        (process.env.FEISHU_CURSOR_GROUP_REQUIRE_AT_BOT || "1").trim() !== "0";
      console.warn(
        reqAt
          ? "[feishu-ws-cursor] FEISHU_CURSOR_MODE=direct 且无会话白名单：私聊任意触发；群聊需 @ 本机器人（设 FEISHU_CURSOR_GROUP_REQUIRE_AT_BOT=0 则群内任意消息也触发）"
          : "[feishu-ws-cursor] FEISHU_CURSOR_MODE=direct 但未配置 FEISHU_CURSOR_ALLOWED_CHAT_IDS，任意会话可触发 Cursor"
      );
    }
  }

  function tryStartOrWait() {
    const appSecret = resolveAppSecret(secretFile);
    if (!appSecret) {
      console.warn(
        "[feishu-ws-cursor] 等待 App Secret：写入",
        secretFile,
        "（单行、无引号）或设置 FEISHU_APP_SECRET；",
        credentialPollMs / 1000,
        "s 后重试；进程保持运行不占失败重启"
      );
      setTimeout(tryStartOrWait, credentialPollMs);
      return;
    }
    startWsClient(appSecret);
  }

  return {
    runtimeConfig,
    routing,
    tryStartOrWait,
    shutdown,
  };
}

function startFeishuBridgeHost() {
  const host = createFeishuBridgeHost();
  process.on("SIGINT", () => host.shutdown("SIGINT"));
  process.on("SIGTERM", () => host.shutdown("SIGTERM"));
  process.on("unhandledRejection", (r) =>
    console.error("[feishu-ws-cursor] unhandledRejection", r)
  );
  host.tryStartOrWait();
  return host;
}

module.exports = {
  createFeishuBridgeHost,
  startFeishuBridgeHost,
};
