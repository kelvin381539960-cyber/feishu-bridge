"use strict";

/**
 * 飞书回复底部一行：编排侧模型·token · 执行侧模型·token（无标签；缺省用占位符）。
 * 数据来自 OpenClaw 网关 RPC 返回的 structuredResult / waitPayload 等，字段名因版本可能不同，做宽松解析。
 * Token 默认按「万」（÷1e4）；`FEISHU_REPLY_USAGE_TOKENS_UNIT=k` 恢复千分位 k。
 */

const DEFAULT_PLACEHOLDER = "\u2014"; // —

function trimStr(v) {
  return String(v == null ? "" : v).trim();
}

function usagePlaceholder() {
  const s = trimStr(process.env.FEISHU_REPLY_USAGE_PLACEHOLDER);
  return s || DEFAULT_PLACEHOLDER;
}

function configuredHeavyAgentId() {
  return trimStr(process.env.OPENCLAW_HEAVY_AGENT_ID || "cursor") || "cursor";
}

function isCursorRouteActive(input) {
  const heavy = configuredHeavyAgentId();
  const routeAgentId = trimStr(input && input.routeAgentId);
  if (routeAgentId) return routeAgentId === heavy;
  return false;
}

/** 网关 history 常把整条链路标成同一 `model`（如豆包）；右侧「Cursor/执行」用本机配置的 CLI 模型名纠偏。 */
function cursorExecutorModelHint() {
  return trimStr(
    process.env.FEISHU_REPLY_USAGE_EXECUTOR_MODEL ||
      process.env.CURSOR_AGENT_FULL_MODEL ||
      ""
  );
}

/**
 * OpenClaw 若未在 payload 里区分 executor 的 model，history 里 gw/ex 会变成同一串（如两个 doubao）。
 * 此时用 CURSOR_AGENT_FULL_MODEL（或 FEISHU_REPLY_USAGE_EXECUTOR_MODEL）只替换右侧模型名；token 仍用 history 里**最后一条 assistant** 自带的用量（若与网侧拆不开则可能与左侧同源）。
 */
function applyExecutorModelHintWhenExecutorMatchesGateway(state) {
  if (!state || typeof state !== "object") return;
  const hint = cursorExecutorModelHint();
  if (!hint) return;
  const gw = trimStr(state.gwM);
  const ex = trimStr(state.exM);
  if (!gw || !ex) return;
  if (ex !== gw) return;
  if (hint === gw) return;
  state.exM = hint;
}

function footerEnabled() {
  return String(process.env.FEISHU_REPLY_USAGE_FOOTER || "1").trim() !== "0";
}

/** 为 1 时：解析不到任何 model/token 则不追加用量行 */
function skipFooterWhenEmpty() {
  return String(process.env.FEISHU_REPLY_USAGE_SKIP_WHEN_EMPTY || "").trim() === "1";
}

/** 为 1 时 token 显示原始整数 */
function tokensAsRawInteger() {
  return String(process.env.FEISHU_REPLY_USAGE_TOKENS_RAW || "").trim() === "1";
}

/** 未设或非 `k`：按「万」（÷1e4）；设为 `k` 时按千（÷1e3，与旧版一致） */
function tokensAbbrevUnit() {
  const u = trimStr(process.env.FEISHU_REPLY_USAGE_TOKENS_UNIT).toLowerCase();
  return u === "k" || u === "thousand" ? "k" : "wan";
}

function stripTrailingZerosInDecimal(s) {
  let out = String(s);
  if (out.includes(".")) out = out.replace(/\.?0+$/, "");
  return out;
}

/**
 * 将整数 token 缩写展示：默认「万」（如 1555000 → 155.5万）；`FEISHU_REPLY_USAGE_TOKENS_UNIT=k` 时为 k。
 * @param {string} rawStr
 * @returns {string} 空字符串表示无法格式化（由上层决定是否用占位符）
 */
function formatTokensAsK(rawStr) {
  const raw = trimStr(rawStr);
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return "";
  if (tokensAsRawInteger()) return String(Math.round(n));

  const unit = tokensAbbrevUnit();
  const divisor = unit === "k" ? 1000 : 10000;
  const suffix = unit === "k" ? "k" : "\u4e07"; // 万

  if (n === 0) return `0${suffix}`;
  const x = n / divisor;
  let v;
  if (x >= 10) {
    v = Math.round(x * 10) / 10;
  } else if (x >= 1) {
    v = Math.round(x * 100) / 100;
  } else if (x >= 0.01) {
    v = Math.round(x * 100) / 100;
  } else {
    v = Math.round(x * 10000) / 10000;
  }
  const s = stripTrailingZerosInDecimal(String(v));
  return `${s}${suffix}`;
}

function tokenTotalFromUsage(u) {
  if (!u || typeof u !== "object") return "";
  const p =
    u.prompt_tokens ??
    u.input_tokens ??
    u.promptTokens ??
    u.input ??
    u.cache_creation_input_tokens;
  const c =
    u.completion_tokens ??
    u.output_tokens ??
    u.completionTokens ??
    u.output ??
    u.cache_read_input_tokens;
  const cr = u.cacheRead ?? u.cache_read ?? u.cache_read_input_tokens ?? u.cached_tokens;
  const cw = u.cacheWrite ?? u.cache_write ?? u.cache_creation_input_tokens;
  const pn = p != null ? Number(p) : NaN;
  const cn = c != null ? Number(c) : NaN;
  const crn = cr != null ? Number(cr) : NaN;
  const cwn = cw != null ? Number(cw) : NaN;
  // Prefer per-turn incremental usage and exclude cacheRead from displayed spend.
  if (Number.isFinite(pn) || Number.isFinite(cn) || Number.isFinite(cwn)) {
    return String(
      Math.round(
        (Number.isFinite(pn) ? pn : 0) +
          (Number.isFinite(cn) ? cn : 0) +
          (Number.isFinite(cwn) ? cwn : 0)
      )
    );
  }
  const tot =
    u.total_tokens ??
    u.totalTokens ??
    u.tokenCount ??
    u.tokens_total ??
    u.total;
  if (tot != null && Number.isFinite(Number(tot)) && Number(tot) >= 0) {
    return String(Math.round(Number(tot)));
  }
  if (Number.isFinite(crn)) {
    return String(Math.round(crn));
  }
  return "";
}

function modelFromObj(o) {
  if (!o || typeof o !== "object") return "";
  return trimStr(
    o.model ||
      o.modelId ||
      o.model_id ||
      o.modelName ||
      (o.metadata && trimStr(o.metadata.model)) ||
      (o.meta && typeof o.meta === "object" && trimStr(o.meta.model)) ||
      ""
  );
}

function pairFromObj(o) {
  if (!o || typeof o !== "object") return { model: "", tokens: "" };
  const meta =
    o.meta && typeof o.meta === "object" && o.meta.agentMeta && typeof o.meta.agentMeta === "object"
      ? o.meta.agentMeta
      : o.agentMeta && typeof o.agentMeta === "object"
        ? o.agentMeta
        : null;
  const u = o.usage || o.tokenUsage || o.tokens || o.token_usage || (meta && meta.usage);
  let tokens = tokenTotalFromUsage(u) || tokenTotalFromUsage(o);
  let model = modelFromObj(o);
  if (meta) {
    if (!tokens) tokens = tokenTotalFromUsage(meta.usage) || tokenTotalFromUsage(meta);
    if (!model) model = modelFromObj(meta);
  }
  return { model, tokens };
}

function pickNamedBranch(raw, names) {
  for (const n of names) {
    const v = raw && raw[n];
    if (v && typeof v === "object") return v;
  }
  return null;
}

/** OpenClaw chat.history：每条 assistant 可有 model + usage（input/output/total 等）。 */
function assistantUsagePairsFromHistory(historyPayload) {
  const messages =
    historyPayload && Array.isArray(historyPayload.messages) ? historyPayload.messages : [];
  const pairs = [];
  for (const m of messages) {
    if (!m || m.role !== "assistant") continue;
    const p = pairFromObj(m);
    if (p.model || p.tokens) pairs.push(p);
  }
  return pairs;
}

function mergeHistoryIntoQuadruple(i, state) {
  const hp = i && i.historyPayload;
  if (!hp || typeof hp !== "object") return;
  const pairs = assistantUsagePairsFromHistory(hp);
  if (!pairs.length) return;
  const cursorActive = isCursorRouteActive(i);
  const hasGw = !!(state.gwM || state.gwT);
  const hasEx = !!(state.exM || state.exT);
  if (!hasGw && !hasEx) {
    if (pairs.length >= 2 && cursorActive) {
      const gw = pairs[pairs.length - 2];
      const ex = pairs[pairs.length - 1];
      state.gwM = gw.model;
      state.gwT = gw.tokens;
      state.exM = ex.model;
      state.exT = ex.tokens;
    } else {
      const one = pairs[0];
      state.gwM = one.model;
      state.gwT = one.tokens;
      const hint = cursorExecutorModelHint();
      if (cursorActive && hint && trimStr(one.model) && hint !== trimStr(one.model)) {
        state.exM = hint;
        // 仅一条 assistant：usage 整包属于网侧模型，不能把同一数值复制成「执行侧」用量（会误显示与左侧一致）。
        state.exT = "";
      } else if (cursorActive) {
        state.exM = one.model;
        state.exT = one.tokens;
      }
    }
    return;
  }
  if (!hasEx && cursorActive) {
    const last = pairs[pairs.length - 1];
    state.exM = last.model;
    state.exT = last.tokens;
  }
  if (!hasGw && pairs.length >= 2) {
    const prev = pairs[pairs.length - 2];
    state.gwM = prev.model;
    state.gwT = prev.tokens;
  }
}

/**
 * 从网关候选对象与 RPC payload 中抽取两侧 (model, tokens)。
 * 顺序：[编排, 执行] 对应飞书行内前两格 / 后两格。
 */
function digestUsageQuadruple(input) {
  const i = input || {};
  const candidate = i.candidate && typeof i.candidate === "object" ? i.candidate : null;
  const raw = candidate;

  let gwM = "";
  let gwT = "";
  let exM = "";
  let exT = "";

  if (raw) {
    const oc = pickNamedBranch(raw, ["openclaw", "openClaw", "gateway", "orchestrator", "router"]);
    const cu = pickNamedBranch(raw, ["cursor", "executor", "worker", "runtime"]);
    if (oc || cu) {
      if (oc) {
        const p = pairFromObj(oc);
        gwM = p.model;
        gwT = p.tokens;
      }
      if (cu) {
        const p = pairFromObj(cu);
        exM = p.model;
        exT = p.tokens;
      }
    }

    if (!(gwM || gwT || exM || exT) && Array.isArray(raw.usageBreakdown)) {
      const arr = raw.usageBreakdown.filter((x) => x && typeof x === "object");
      if (arr.length >= 1) {
        const p0 = pairFromObj(arr[0]);
        gwM = p0.model;
        gwT = p0.tokens;
      }
      if (arr.length >= 2) {
        const p1 = pairFromObj(arr[1]);
        exM = p1.model;
        exT = p1.tokens;
      }
    }

    if (!(gwM || gwT || exM || exT)) {
      const top = pairFromObj(raw);
      const ex = trimStr(raw.executor || raw.backend || "").toLowerCase();
      if (top.model || top.tokens) {
        if (ex.includes("cursor") || ex.includes("acp") || ex.includes("claude")) {
          exM = top.model;
          exT = top.tokens;
        } else {
          gwM = top.model;
          gwT = top.tokens;
        }
      }
    }
  }

  for (const p of [i.waitPayload, i.sendPayload]) {
    if (!p || typeof p !== "object") continue;
    const nested =
      firstStructuredNested(p) ||
      (p.result && typeof p.result === "object" ? p.result : null) ||
      null;
    const tryMerge = (src) => {
      if (!src || typeof src !== "object") return;
      const pair = pairFromObj(src);
      if (!(pair.model || pair.tokens)) return;
      if (!(gwM || gwT)) {
        gwM = pair.model || gwM;
        gwT = pair.tokens || gwT;
      } else if (!(exM || exT)) {
        exM = pair.model || exM;
        exT = pair.tokens || exT;
      }
    };
    tryMerge(nested || p);
    tryMerge(p);
    for (const k of ["metrics", "cost", "billing", "tokenUsage", "llm"]) {
      const sub = p[k];
      if (sub && typeof sub === "object") tryMerge(sub);
    }
  }

  const quad = { gwM, gwT, exM, exT };
  mergeHistoryIntoQuadruple(i, quad);
  if (!trimStr(quad.exM)) {
    quad.exM = cursorExecutorModelHint();
  }
  if (!isCursorRouteActive(i) && !(exM || exT)) {
    quad.exT = "";
  }
  applyExecutorModelHintWhenExecutorMatchesGateway(quad);
  return { gwM: quad.gwM, gwT: quad.gwT, exM: quad.exM, exT: quad.exT };
}

function firstStructuredNested(payload) {
  if (!payload || typeof payload !== "object") return null;
  const keys = ["structuredResult", "result", "output", "finalResult", "reply"];
  for (const k of keys) {
    const v = payload[k];
    if (v && typeof v === "object") return v;
  }
  return null;
}

function slot(v, ph) {
  const s = trimStr(v);
  return s ? s : ph;
}

function compactModel(name) {
  const s = trimStr(name);
  if (!s) return "";
  const max = Math.max(8, Math.min(48, Number(process.env.FEISHU_REPLY_USAGE_MODEL_MAX) || 36));
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "\u2026";
}

/**
 * @param {{ waitPayload?: object, sendPayload?: object, candidate?: object|null }} sources
 */
function buildUsageDigest(sources) {
  return digestUsageQuadruple(sources);
}

function buildUsageFooterLine(digest) {
  const ph = usagePlaceholder();
  const d = digest || {};
  const tok = (t) => {
    const f = formatTokensAsK(t);
    return f ? f : ph;
  };
  const parts = [
    slot(compactModel(d.gwM), ph),
    tok(d.gwT),
    slot(compactModel(d.exM), ph),
    tok(d.exT),
  ];
  return parts.join(" \u00b7 "); // ·
}

function digestFromStructuredResult(structuredResult) {
  const sr = structuredResult || {};
  return digestUsageQuadruple({
    candidate: sr.raw && typeof sr.raw === "object" ? sr.raw : null,
    waitPayload: sr.waitPayload,
    sendPayload: sr.sendPayload,
    historyPayload: sr.historyPayload,
  });
}

/**
 * @param {string} body
 * @param {{ code?: number, structuredResult?: object|null }} executionResult
 * @returns {string}
 */
function appendLlmUsageFooterToReply(body, executionResult) {
  if (!footerEnabled()) return body;
  const r = executionResult || {};
  if (typeof body !== "string") return body;
  if (Number(r.code) !== 0) return body;

  const digest = r.structuredResult
    ? digestUsageQuadruple({
        candidate: r.structuredResult.raw && typeof r.structuredResult.raw === "object"
          ? r.structuredResult.raw
          : null,
        waitPayload: r.structuredResult.waitPayload,
        sendPayload: r.structuredResult.sendPayload,
        historyPayload: r.structuredResult.historyPayload,
        routeAgentId: r.routeAgentId,
      })
    : { gwM: "", gwT: "", exM: "", exT: "" };
  const line = buildUsageFooterLine(digest);
  const ph = usagePlaceholder();
  const emptyLine = [ph, ph, ph, ph].join(" \u00b7 ");
  const hasSignal = !!(digest.gwM || digest.gwT || digest.exM || digest.exT);
  if (line === emptyLine && skipFooterWhenEmpty() && !hasSignal) {
    return body;
  }
  const trimmed = body.replace(/\s+$/, "");
  return `${trimmed}\n${line}\n`;
}

module.exports = {
  appendLlmUsageFooterToReply,
  buildUsageDigest,
  buildUsageFooterLine,
  digestUsageQuadruple,
  formatTokensAsK,
};
