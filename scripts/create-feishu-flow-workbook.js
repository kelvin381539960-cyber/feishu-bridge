#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");

const { getTenantAccessToken, getFeishuApiBase } = require(path.join(
  __dirname,
  "..",
  "lib",
  "feishu-tenant"
));

const REPO_ROOT = path.join(__dirname, "..");

function portalBase() {
  const explicit = (process.env.FEISHU_DOC_PORTAL_ORIGIN || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const domain = (process.env.FEISHU_LARK_DOMAIN || "feishu").trim().toLowerCase();
  return domain === "lark" ? "https://larksuite.com" : "https://feishu.cn";
}

function spreadsheetUrl(token) {
  return `${portalBase()}/sheets/${encodeURIComponent(token)}`;
}

function mustReadFile(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`file not found: ${relPath}`);
  }
  return fs.readFileSync(abs, "utf8");
}

function sanitizeSheetTitle(raw, index) {
  const cleaned = String(raw || "")
    .replace(/[\\\/\?\*\[\]:]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const prefix = String(index + 2).padStart(2, "0") + "_";
  const maxLen = 31;
  const allowed = Math.max(1, maxLen - prefix.length);
  const sliced = (cleaned || `Sheet${index + 2}`).slice(0, allowed);
  return prefix + sliced;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function feishuRequest(method, url, token, data, params) {
  const res = await axios({
    method,
    url,
    data,
    params,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    timeout: 60000,
    validateStatus: () => true,
  });
  if (res.status >= 400 || !res.data || res.data.code !== 0) {
    throw new Error(
      `Feishu API failed: ${method} ${url} status=${res.status} code=${res.data && res.data.code} msg=${res.data && res.data.msg}`
    );
  }
  return res.data;
}

async function createSpreadsheet(accessToken, title) {
  const base = getFeishuApiBase();
  const data = await feishuRequest(
    "post",
    `${base}/sheets/v3/spreadsheets`,
    accessToken,
    { title: String(title || "AI Workflow File Map") }
  );
  const s = data.data && data.data.spreadsheet;
  const token =
    (s && (s.spreadsheet_token || s.spreadsheetToken || s.token)) ||
    (data.data && (data.data.spreadsheet_token || data.data.spreadsheetToken));
  if (!token) throw new Error("create spreadsheet succeeded but token missing");
  return token;
}

async function querySheets(accessToken, spreadsheetToken) {
  const base = getFeishuApiBase();
  const data = await feishuRequest(
    "get",
    `${base}/sheets/v3/spreadsheets/${encodeURIComponent(spreadsheetToken)}/sheets/query`,
    accessToken
  );
  return (data.data && data.data.sheets) || [];
}

async function addSheet(accessToken, spreadsheetToken, title) {
  const base = getFeishuApiBase();
  await feishuRequest(
    "post",
    `${base}/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheetToken)}/sheets_batch_update`,
    accessToken,
    {
      requests: [
        {
          addSheet: {
            properties: {
              title: String(title),
            },
          },
        },
      ],
    }
  );
}

async function writeValues(accessToken, spreadsheetToken, range, values) {
  const base = getFeishuApiBase();
  await feishuRequest(
    "put",
    `${base}/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheetToken)}/values`,
    accessToken,
    {
      valueRange: {
        range,
        values,
      },
    }
  );
}

async function bestEffortSetTenantReadable(accessToken, fileToken) {
  const base = getFeishuApiBase();
  try {
    await feishuRequest(
      "patch",
      `${base}/drive/v1/permissions/${encodeURIComponent(fileToken)}/public`,
      accessToken,
      {
        external_access: false,
        security_entity: "anyone_can_view",
        comment_entity: "anyone",
        share_entity: "tenant",
        link_share_entity: "tenant_view",
      }
    );
  } catch (_) {
    // ignore permission setting failures
  }
}

function buildRows() {
  return [
    {
      flow: "PRD",
      layer: "规则治理",
      file: "prd-workflow.mdc",
      path: ".cursor/rules/prd-workflow.mdc",
      desc: "PRD 状态机、门禁、子 Agent 约束",
    },
    {
      flow: "PRD",
      layer: "流程说明",
      file: "prd-workflow.md",
      path: "docs/cursor-architecture/prd-workflow.md",
      desc: "PRD 流程说明文档",
    },
    {
      flow: "PRD",
      layer: "分类治理",
      file: "task-classifier.js",
      path: "lib/feishu-cursor/policies/task-classifier.js",
      desc: "识别 PRD/调研等任务意图",
    },
    {
      flow: "PRD",
      layer: "主编排",
      file: "pipeline-v2.js",
      path: "lib/feishu-cursor/pipeline-v2.js",
      desc: "端到端工作流编排",
    },
    {
      flow: "PRD",
      layer: "控制平面",
      file: "request-planner.js",
      path: "lib/openclaw-control-plane/request-planner.js",
      desc: "意图+策略+执行规划门面",
    },
    {
      flow: "PRD",
      layer: "Prompt 策略",
      file: "prompt-policy.js",
      path: "lib/feishu-cursor/policies/prompt-policy.js",
      desc: "Prompt 组装治理",
    },
    {
      flow: "PRD",
      layer: "门禁校验",
      file: "verify-prd-gates.py",
      path: "scripts/verify-prd-gates.py",
      desc: "PRD 门禁脚本",
    },
    {
      flow: "PRD",
      layer: "校验入口",
      file: "package.json",
      path: "package.json",
      desc: "verify:prd-gates / verify:prd-brief 命令",
    },
    {
      flow: "PRD",
      layer: "状态真源",
      file: "_state-user-registration.md",
      path: "docs/prd/_state-user-registration.md",
      desc: "PRD 状态文件示例",
    },
    {
      flow: "PRD",
      layer: "流程产物",
      file: "_brief-user-registration.md",
      path: "docs/prd/_brief-user-registration.md",
      desc: "Brief 产物示例",
    },
    {
      flow: "PRD",
      layer: "流程产物",
      file: "user-registration-prd.md",
      path: "docs/prd/user-registration-prd.md",
      desc: "PRD 正文示例",
    },
    {
      flow: "PRD",
      layer: "流程产物",
      file: "_review-user-registration.md",
      path: "docs/prd/_review-user-registration.md",
      desc: "PRD 评审产物示例",
    },
    {
      flow: "Research",
      layer: "专用执行",
      file: "research-workflow-runner.js",
      path: "lib/openclaw-control-plane/research-workflow-runner.js",
      desc: "调研 flow 专用 runner",
    },
    {
      flow: "Research",
      layer: "意图路由",
      file: "intent-router.js",
      path: "lib/openclaw-control-plane/intent-router.js",
      desc: "意图路由到 research 分支",
    },
    {
      flow: "Research",
      layer: "路由策略",
      file: "route-policy.js",
      path: "lib/openclaw-control-plane/route-policy.js",
      desc: "决定 research/通用执行路径",
    },
    {
      flow: "Research",
      layer: "结果治理",
      file: "result-policy.js",
      path: "lib/openclaw-control-plane/result-policy.js",
      desc: "调研结果后处理与导出判定",
    },
    {
      flow: "Research",
      layer: "状态模型",
      file: "research-workflow-state.js",
      path: "lib/feishu-cursor/research-workflow-state.js",
      desc: "调研流程状态迁移",
    },
    {
      flow: "Research",
      layer: "输出治理",
      file: "feishu-docx-export.js",
      path: "lib/feishu-docx-export.js",
      desc: "调研结果导出飞书文档",
    },
    {
      flow: "Research",
      layer: "规则辅助",
      file: "feishu-cursor-route.js",
      path: "lib/feishu-cursor-route.js",
      desc: "isResearchLikeTask 等规则入口",
    },
    {
      flow: "Research",
      layer: "调研产物",
      file: "_research-login.md",
      path: "docs/prd/_research-login.md",
      desc: "调研中间稿示例",
    },
    {
      flow: "Common",
      layer: "接入入口",
      file: "feishu-ws-cursor.js",
      path: "feishu-ws-cursor.js",
      desc: "飞书 WS 入口",
    },
    {
      flow: "Common",
      layer: "渠道宿主",
      file: "bridge-host.js",
      path: "lib/feishu-channel/bridge-host.js",
      desc: "渠道运行时装配",
    },
    {
      flow: "Common",
      layer: "控制平面",
      file: "policy-engine.js",
      path: "lib/openclaw-control-plane/policy-engine.js",
      desc: "策略引擎核心",
    },
    {
      flow: "Common",
      layer: "安全规则",
      file: "safety-policy.js",
      path: "lib/feishu-cursor/policies/safety-policy.js",
      desc: "安全门禁治理",
    },
    {
      flow: "Common",
      layer: "路由规则",
      file: "routing-policy.js",
      path: "lib/feishu-cursor/policies/routing-policy.js",
      desc: "任务路由策略",
    },
    {
      flow: "Common",
      layer: "Relay 规则",
      file: "relay-policy.js",
      path: "lib/feishu-cursor/policies/relay-policy.js",
      desc: "确定性短路回复",
    },
    {
      flow: "Common",
      layer: "执行队列",
      file: "task-queue.js",
      path: "lib/feishu-cursor/runner/task-queue.js",
      desc: "串并行与背压治理",
    },
    {
      flow: "Common",
      layer: "Runner 选择",
      file: "runner-selector.js",
      path: "lib/feishu-cursor/runner/runner-selector.js",
      desc: "执行器选择策略",
    },
    {
      flow: "Common",
      layer: "网关适配",
      file: "openclaw-gateway-adhoc.js",
      path: "lib/openclaw-gateway-adhoc.js",
      desc: "OpenClaw gateway 调用",
    },
    {
      flow: "Common",
      layer: "结果归一",
      file: "structured-result.js",
      path: "lib/openclaw-control-plane/structured-result.js",
      desc: "统一执行结果结构",
    },
    {
      flow: "Common",
      layer: "配置治理",
      file: "load-feishu-cursor-config.js",
      path: "lib/feishu-cursor/config/load-feishu-cursor-config.js",
      desc: "运行配置加载",
    },
    {
      flow: "Common",
      layer: "运维部署",
      file: "feishu-ws-cursor-bot.service",
      path: "deploy/feishu-ws-cursor-bot.service",
      desc: "systemd 服务定义",
    },
    {
      flow: "Common",
      layer: "环境模板",
      file: "feishu-ws-cursor-bot.env.example",
      path: "deploy/feishu-ws-cursor-bot.env.example",
      desc: "环境变量模板",
    },
  ];
}

async function main() {
  const rows = buildRows();
  const token = await getTenantAccessToken();
  if (!token) throw new Error("no tenant token; please source env first");

  const title = `AI工作流运行治理文件表-${new Date().toISOString().slice(0, 10)}`;
  const spreadsheetToken = await createSpreadsheet(token, title);

  const initialSheets = await querySheets(token, spreadsheetToken);
  if (!initialSheets.length) throw new Error("spreadsheet created but no sheet found");
  const indexSheet = initialSheets[0];
  const indexSheetId = indexSheet.sheet_id;

  const header = [["Flow", "分层", "文件名", "文件位置", "作用简单解释"]];
  const body = rows.map((r) => [r.flow, r.layer, r.file, r.path, r.desc]);
  await writeValues(token, spreadsheetToken, `${indexSheetId}!A1:E${body.length + 1}`, header.concat(body));

  const usedTitles = new Set();
  const sheetTitles = [];
  for (let i = 0; i < rows.length; i++) {
    let t = sanitizeSheetTitle(rows[i].file, i);
    while (usedTitles.has(t)) t = sanitizeSheetTitle(`${rows[i].file}_${i + 1}`, i);
    usedTitles.add(t);
    sheetTitles.push(t);
    await addSheet(token, spreadsheetToken, t);
  }

  const allSheets = await querySheets(token, spreadsheetToken);
  const titleToId = new Map(allSheets.map((s) => [s.title, s.sheet_id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const title = sheetTitles[i];
    const sheetId = titleToId.get(title);
    if (!sheetId) throw new Error(`sheet id not found for title=${title}`);

    const content = mustReadFile(row.path);
    const lines = content.split(/\r?\n/);
    const meta = [
      [`文件名: ${row.file}`],
      [`路径: ${row.path}`],
      [`Flow/分层: ${row.flow} / ${row.layer}`],
      [""],
      ["内容如下（逐行）:"],
    ];
    await writeValues(token, spreadsheetToken, `${sheetId}!A1:A${meta.length}`, meta);

    const renderedLines = lines.map((line, idx) => [`${String(idx + 1).padStart(4, "0")} | ${line}`]);
    const batches = chunk(renderedLines, 500);
    let start = meta.length + 1;
    for (const b of batches) {
      const end = start + b.length - 1;
      await writeValues(token, spreadsheetToken, `${sheetId}!A${start}:A${end}`, b);
      start = end + 1;
    }
  }

  await bestEffortSetTenantReadable(token, spreadsheetToken);

  const result = {
    ok: true,
    spreadsheetToken,
    url: spreadsheetUrl(spreadsheetToken),
    sheetsCount: allSheets.length,
    generatedAt: new Date().toISOString(),
  };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
