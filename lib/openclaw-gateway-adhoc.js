"use strict";

/**
 * 飞书 WS → OpenClaw Gateway：通过本机 `openclaw gateway call` 调网关 RPC（chat.send → agent.wait → chat.history）。
 * 需配置 OPENCLAW_GATEWAY_URL、OPENCLAW_GATEWAY_TOKEN（若网关要求）；systemd 下建议设 OPENCLAW_BIN 且 PATH 含 Node 22+。
 */

const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const {
  normalizeStructuredResult,
  selectReplyTextFromStructuredResult,
} = require("./openclaw-control-plane/structured-result");

const execFileAsync = promisify(execFile);

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function resolveOpenclawBin() {
  const b = trimStr(process.env.OPENCLAW_BIN);
  if (b) return b;
  return "openclaw";
}

function gatewayUrl() {
  return trimStr(process.env.OPENCLAW_GATEWAY_URL);
}

function gatewayToken() {
  return trimStr(
    process.env.OPENCLAW_GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_AUTH_TOKEN
  );
}

function timeoutMsFromEnv() {
  const sec = Number(process.env.CURSOR_ADHOC_TIMEOUT_SEC || 600);
  const s = Number.isFinite(sec) && sec > 0 ? sec : 600;
  return Math.min(Math.floor(s * 1000), 3_600_000);
}

function execTimeoutMs() {
  return timeoutMsFromEnv() + 120_000;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGatewayConnectError(msg) {
  const t = String(msg || "").toLowerCase();
  return (
    t.includes("gateway not connected") ||
    t.includes("connect challenge timeout") ||
    t.includes("gateway closed (1008)") ||
    t.includes("connect: failed - timeout") ||
    t.includes("invalid json")
  );
}

function parseJsonObject(stdout, label) {
  const raw = trimStr(stdout);
  if (!raw) {
    throw new Error(`${label}: empty stdout`);
  }

  // Some OpenClaw/plugin setups print log lines before JSON.
  // Try strict parse first, then fall back to extracting the last JSON object.
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === "object") return o;
  } catch (e) {
    const recovered = extractLastJsonObject(raw);
    if (recovered) return recovered;
    throw new Error(`${label}: invalid JSON: ${e.message}`);
  }
  throw new Error(`${label}: JSON is not an object`);
}

function extractLastJsonObject(text) {
  if (!text) return null;
  const lines = String(text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

  // Common case: OpenClaw prints a few log lines, then a single pretty-printed
  // JSON object. Try parsing from the first "{" onward before using brace scans,
  // because message text may itself contain many "{" / "}" characters.
  const fullText = String(text);
  const firstBrace = fullText.indexOf("{");
  if (firstBrace >= 0) {
    const candidate = fullText.slice(firstBrace).trim();
    try {
      const o = JSON.parse(candidate);
      if (o && typeof o === "object") return o;
    } catch (_) {
      // fall through
    }
  }

  // Fast path: parse last JSON-looking line.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const ln = lines[i];
    if (!(ln.startsWith("{") && ln.endsWith("}"))) continue;
    try {
      const o = JSON.parse(ln);
      if (o && typeof o === "object") return o;
    } catch (_) {
      // keep trying
    }
  }

  // Fallback: parse the last balanced {...} block from the full text.
  let depth = 0;
  let end = -1;
  for (let i = text.length - 1; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === "}") {
      if (end < 0) end = i;
      depth += 1;
      continue;
    }
    if (ch === "{") {
      depth -= 1;
      if (depth === 0 && end > i) {
        const candidate = text.slice(i, end + 1).trim();
        try {
          const o = JSON.parse(candidate);
          if (o && typeof o === "object") return o;
        } catch (_) {
          // continue scanning for previous block
        }
      }
    }
  }

  return null;
}

function extractAssistantFromHistory(payload) {
  const messages = payload && Array.isArray(payload.messages) ? payload.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m || m.role !== "assistant") continue;
    const parts = [];
    const c = m.content;
    if (typeof c === "string") {
      parts.push(c);
    } else if (Array.isArray(c)) {
      for (const block of c) {
        if (!block || typeof block !== "object") continue;
        if (block.type === "text" && typeof block.text === "string") {
          parts.push(block.text);
        }
      }
    }
    const t = parts.join("").trim();
    if (t) return t;
  }
  return "";
}

function buildGatewayChatSendParams(task, opts) {
  const o = opts || {};
  const taskStr = String(task || "");
  const gatewayRequest =
    o.gatewayRequest && typeof o.gatewayRequest === "object" ? o.gatewayRequest : {};
  const sessionKey =
    trimStr(gatewayRequest.sessionKey) || trimStr(o.sessionId) || "feishu:default";
  const messageId = trimStr(o.messageId);
  const idempotencyKey =
    trimStr(gatewayRequest.idempotencyKey) ||
    (messageId && messageId.length > 0
      ? `feishu-msg:${messageId}`
      : `feishu-adhoc:${crypto.randomUUID()}`);
  const waitMs =
    typeof gatewayRequest.timeoutMs === "number" && Number.isFinite(gatewayRequest.timeoutMs)
      ? Math.min(Math.max(Math.floor(gatewayRequest.timeoutMs), 1), 3_600_000)
      : timeoutMsFromEnv();
  const channelRuntimeMode =
    trimStr(gatewayRequest.channelRuntimeMode) === "plugin-native"
      ? "plugin-native"
      : "legacy-bridge";

  return {
    sessionKey,
    taskStr,
    idempotencyKey,
    waitMs,
    channelRuntimeMode,
  };
}

function buildFallbackGatewayRequest(gatewayRequest, routeHint) {
  const request =
    gatewayRequest && typeof gatewayRequest === "object" ? { ...gatewayRequest } : null;
  const route = routeHint && typeof routeHint === "object" ? routeHint : null;
  const fallbackAgentId = trimStr(route && route.fallbackAgentId);
  if (!request || !fallbackAgentId) return null;
  const currentSessionKey = trimStr(request.sessionKey);
  if (!/^agent:[^:]+:.+/.test(currentSessionKey)) return null;
  const fallbackSessionKey = currentSessionKey.replace(/^agent:[^:]+:/, `agent:${fallbackAgentId}:`);
  let fallbackIdempotencyKey = trimStr(request.idempotencyKey);
  if (fallbackIdempotencyKey) {
    const next = fallbackIdempotencyKey.replace(
      /^(feishu(?:-plugin)?-msg:)[^:]+:/,
      `$1${fallbackAgentId}:`
    );
    fallbackIdempotencyKey =
      next === fallbackIdempotencyKey
        ? `${fallbackIdempotencyKey}:fallback:${fallbackAgentId}`
        : next;
  }
  return {
    ...request,
    sessionKey: fallbackSessionKey,
    idempotencyKey: fallbackIdempotencyKey,
  };
}

function shouldRetryWithFallbackAgent(opts, err) {
  const route = opts && opts.routeHint && typeof opts.routeHint === "object" ? opts.routeHint : null;
  const fallbackAgentId = trimStr(route && route.fallbackAgentId);
  const agentId = trimStr(route && route.agentId);
  if (!route || route.routeClass !== "heavy" || !fallbackAgentId || fallbackAgentId === agentId) {
    return false;
  }
  const msg = trimStr(err && err.message ? err.message : err).toLowerCase();
  return /unknown agent id|acp|backend|dispatch|runtime backend|transport|unsupported/.test(
    msg
  );
}

async function runGatewayPromptOnce(task, opts) {
  const o = opts || {};
  const { taskStr, sessionKey, idempotencyKey, waitMs } = buildGatewayChatSendParams(task, o);
  const sendParams = {
    sessionKey,
    message: taskStr,
    idempotencyKey,
    timeoutMs: waitMs,
  };
  const sendPayload = await gatewayCallJson("chat.send", sendParams);
  const runId =
    sendPayload &&
    typeof sendPayload.runId === "string" &&
    sendPayload.runId.trim()
      ? sendPayload.runId.trim()
      : "";
  if (!runId) {
    return {
      code: 2,
      stdout: "",
      stderr: "openclaw: chat.send response missing runId",
      error: new Error("openclaw_missing_run_id"),
      structuredResult: normalizeStructuredResult({
        code: 2,
        runId: "",
        sendPayload,
        waitPayload: null,
        historyPayload: null,
        fallbackText: "",
      }),
    };
  }

  const waitPayload = await gatewayCallJson("agent.wait", {
    runId,
    timeoutMs: waitMs,
  });

  const hist = await gatewayCallJson("chat.history", {
    sessionKey,
    limit: 40,
  });
  const fallbackReply = extractAssistantFromHistory(hist);
  const structuredResult = normalizeStructuredResult({
    code: 0,
    runId,
    sendPayload,
    waitPayload,
    historyPayload: hist,
    fallbackText: fallbackReply,
  });
  const reply = selectReplyTextFromStructuredResult(structuredResult, fallbackReply);
  if (!reply) {
    return {
      code: 1,
      stdout: "",
      stderr: "openclaw: no assistant text in chat.history",
      error: new Error("openclaw_empty_reply"),
      structuredResult,
    };
  }
  return {
    code: 0,
    stdout: reply,
    stderr: "",
    error: null,
    structuredResult,
  };
}

async function gatewayCallJson(method, params) {
  const url = gatewayUrl();
  const token = gatewayToken();
  if (!url) {
    throw new Error("OPENCLAW_GATEWAY_URL is not set");
  }
  const bin = resolveOpenclawBin();
  const args = [
    "gateway",
    "call",
    method,
    "--url",
    url,
    "--params",
    JSON.stringify(params),
    "--timeout",
    String(Math.min(execTimeoutMs(), 3_700_000)),
    "--json",
  ];
  if (token) {
    args.push("--token", token);
  }
  const attempts = 4;
  const delays = [400, 900, 1600];
  let lastErr = null;

  for (let i = 0; i < attempts; i += 1) {
    try {
      const { stdout, stderr } = await execFileAsync(bin, args, {
        maxBuffer: 48 * 1024 * 1024,
        timeout: execTimeoutMs(),
        env: { ...process.env },
      });
      const errText = trimStr(stderr);
      if (errText && !trimStr(stdout)) {
        throw new Error(errText);
      }
      return parseJsonObject(stdout, method);
    } catch (e) {
      const stdout = trimStr(e && e.stdout ? e.stdout : "");
      const stderr = trimStr(e && e.stderr ? e.stderr : "");
      const msg = trimStr(e && e.message ? e.message : String(e));

      // Non-zero exit can still carry valid JSON in stdout.
      if (stdout) {
        try {
          return parseJsonObject(stdout, method);
        } catch (_) {
          // continue to retry/error handling
        }
      }

      lastErr = new Error(stderr || msg || "gateway call failed");
      if (i < attempts - 1 && isTransientGatewayConnectError(`${msg}\n${stderr}`)) {
        await sleep(delays[i] || 2000);
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr || new Error("gateway call failed");
}

/**
 * @param {string} task
 * @param {{ agentProfile?: string, sessionId?: string, permissionMode?: string, cleanCwd?: boolean, chatId?: string, messageId?: string, routeHint?: { routeClass?: string, agentId?: string, fallbackAgentId?: string }, gatewayRequest?: { sessionKey?: string, idempotencyKey?: string, timeoutMs?: number } }} [opts]
 * @returns {Promise<{ code: number, stdout: string, stderr: string, error: Error|null }>}
 */
async function runOpenclawGatewayPrompt(task, opts) {
  const o = opts || {};

  try {
    return await runGatewayPromptOnce(task, o);
  } catch (e) {
    if (shouldRetryWithFallbackAgent(o, e)) {
      const fallbackGatewayRequest = buildFallbackGatewayRequest(o.gatewayRequest, o.routeHint);
      if (fallbackGatewayRequest) {
        try {
          return await runGatewayPromptOnce(task, {
            ...o,
            sessionId: fallbackGatewayRequest.sessionKey,
            gatewayRequest: fallbackGatewayRequest,
          });
        } catch (retryErr) {
          e = retryErr;
        }
      }
    }
    const msg = e && e.message ? String(e.message) : String(e);
    return {
      code: 1,
      stdout: "",
      stderr: `openclaw gateway: ${msg}`,
      error: e instanceof Error ? e : new Error(msg),
      structuredResult: normalizeStructuredResult({
        code: 1,
        runId: "",
        sendPayload: null,
        waitPayload: null,
        historyPayload: null,
        fallbackText: "",
      }),
    };
  }
}

module.exports = {
  buildGatewayChatSendParams,
  buildFallbackGatewayRequest,
  runOpenclawGatewayPrompt,
};
