"use strict";

function parseBool(v, fallback) {
  if (v === undefined || v === null || v === "") return fallback;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return fallback;
}

function parsePositiveInt(v, fallback, min) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i < min) return fallback;
  return i;
}

function loadFeishuCursorConfig(envLike) {
  const env = envLike || process.env;
  const domainRaw = String(env.FEISHU_LARK_DOMAIN || "feishu")
    .trim()
    .toLowerCase();
  const modeRaw = String(env.FEISHU_CURSOR_MODE || "prefix")
    .trim()
    .toLowerCase();
  const mode = modeRaw === "direct" ? "direct" : "prefix";
  const prefix = String(env.FEISHU_CURSOR_TRIGGER_PREFIX || "/figma").trim() || "/figma";
  const fullPrefixesRaw = String(env.CURSOR_FULL_TASK_PREFIXES || "/code,/编程");
  const fullTaskPrefixes = fullPrefixesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const channelRuntimeModeRaw = String(env.FEISHU_CHANNEL_RUNTIME_MODE || "legacy-bridge")
    .trim()
    .toLowerCase();
  const channelRuntimeMode =
    channelRuntimeModeRaw === "plugin-native" ? "plugin-native" : "legacy-bridge";
  const prefixMissHintEnabled = parseBool(env.FEISHU_PREFIX_MISS_HINT, true);

  return {
    appId: String(env.FEISHU_APP_ID || "").trim(),
    appSecretFile: String(env.FEISHU_APP_SECRET_FILE || "/etc/feishu-ws-cursor-bot.secret").trim(),
    larkDomain: domainRaw === "lark" ? "lark" : "feishu",
    triggerEnabled: parseBool(env.FEISHU_CURSOR_TRIGGER_ENABLED, false),
    mode,
    prefix,
    direct: mode === "direct",
    enforceAllowedChatIds: String(env.FEISHU_CURSOR_ENFORCE_ALLOWED_CHAT_IDS || "").trim() === "1",
    allowedChatIdsRaw: String(env.FEISHU_CURSOR_ALLOWED_CHAT_IDS || "").trim(),
    groupRequireAtBot:
      String(env.FEISHU_CURSOR_GROUP_REQUIRE_AT_BOT || "1").trim() !== "0",
    dedupTtlMs: parsePositiveInt(env.FEISHU_WS_DEDUP_TTL_MS, 120000, 10000),
    credentialPollMs: parsePositiveInt(env.FEISHU_WS_CREDENTIAL_POLL_MS, 60000, 5000),
    relayPolicyMode: String(env.FEISHU_CURSOR_RELAY_POLICY_MODE || "shadow")
      .trim()
      .toLowerCase(),
    queueMode: String(env.FEISHU_CURSOR_QUEUE_MODE || "inline").trim().toLowerCase(),
    telemetryFile: String(env.FEISHU_CURSOR_TELEMETRY_FILE || "").trim(),
    stateStoreFile: String(env.FEISHU_CURSOR_STATE_STORE_FILE || "").trim(),
    fullTaskPrefixes,
    channelRuntimeMode,
    gatewayHeavyAgentId: String(env.OPENCLAW_HEAVY_AGENT_ID || "cursor").trim() || "cursor",
    gatewayLightAgentId: String(env.OPENCLAW_LIGHT_AGENT_ID || "main").trim() || "main",
    /** Optional segment in OpenClaw sessionKey / idempotency so Feishu bridge is isolated on shared gateways. */
    openclawFeishuSessionNamespace: String(env.OPENCLAW_FEISHU_SESSION_NAMESPACE || "").trim(),
    directLegacyFast:
      String(env.FEISHU_CURSOR_DIRECT_PROFILE || "").trim().toLowerCase() === "fast",
    prefixMissHintEnabled,
    /** 调研：首轮强制澄清；用户下一条消息视为澄清回答后再执行 */
    researchClarifyFirst: parseBool(env.FEISHU_RESEARCH_CLARIFY_FIRST, true),
    /** 调研 V2：澄清完成后串行 crawler + analyst 两次 gateway 调用 */
    researchWorkflowV2: parseBool(env.FEISHU_RESEARCH_WORKFLOW_V2, false),
    researchCrawlerAgentId: String(env.OPENCLAW_RESEARCH_CRAWLER_AGENT_ID || "").trim(),
    researchAnalystAgentId: String(env.OPENCLAW_RESEARCH_ANALYST_AGENT_ID || "").trim(),
    researchQualityRepair: parseBool(env.FEISHU_RESEARCH_QUALITY_REPAIR, true),
  };
}

module.exports = {
  loadFeishuCursorConfig,
};
