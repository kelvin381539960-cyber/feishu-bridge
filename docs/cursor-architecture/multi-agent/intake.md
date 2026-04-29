# Intake / 进入闸

> 角色：Workflow Agent（pipeline-v2 主会话）
> 唯一入口：`lib/feishu-cursor/pipeline-v2.js` → `lib/openclaw-control-plane/request-planner.js#planOpenclawExecution`

## 1. 处理顺序（强制）

```
WS payload
  ─► parse / dedup / routing
  ─► media + task extraction
  ─► classifyOpenclawIntent           ← 唯一一次 task-classifier 调用
        │
        ├─ workflowKey ∈ {prd, research, code, solution, general}
        └─ taskSubtype ∈ {interactive_card, sheet_write, sheet_read,
                          resource_read, workflow_audit, relay,
                          report_export, none}
  ─► resolveWorkflowExecutionPolicy     ← taskSize / multiAgentRequired / decisionReason（specialized）
  ─► resolveOpenclawPolicies (relay / safety / prompt)
  ─► planExecutionBroker (runner / dispatch)
  ─► pipeline-gate-adapter            ← 只读校验，不二次分类
        │
        ├─ ok=true  → 写入 telemetry: pipeline_gate_passed:<workflowKey>
        └─ ok=false → 兜底 general + telemetry: pipeline_gate_violation
  ─► taskQueue.enqueue → OpenClaw Gateway
```

## 2. 双轨分类的产出

`task-classifier` 对每条入站消息固定产出：

```js
{
  taskType: "<legacy alias>",
  workflowKey: "<5 类之一>",
  taskSubtype: "<8 子类之一>",
  role: "specialized" | "fallback",
  fallbackReason: "<仅 fallback 时填>",
  confidence: 0..1,
  requiresTooling: bool,
  requiresFullRunner: bool,
  needsClarification: bool,
  reasons: [...]
}
```

下游的查表方向：

| 消费方 | 读哪个字段 |
|---|---|
| `lib/feishu-cursor/contracts/index.js#getContract` | `workflowKey` |
| `lib/feishu-cursor/workflows/workflow-registry.js#getWorkflowByTaskType` | `workflowKey` |
| `lib/feishu-cursor/policies/prompt-policy.js#buildPromptText` | 主路 `workflowKey`，子类 `taskSubtype`（relay / report_export） |
| `lib/openclaw-control-plane/route-policy.js#resolveGatewayRoute` | `workflowKey` 决定 heavy / light，`taskSubtype` 兜底 |
| `lib/feishu-cursor/runner/runner-selector.js` | `taskSubtype === "interactive_card"` 强制 `fast` profile |
| `lib/feishu-docx-export.js#resolveFeishuDocExportKind` | `workflowKey === "research"` 或 `taskSubtype === "report_export"` |
| `lib/feishu-cursor/pipeline-v2.js` | `taskSubtype === "sheet_write"` 标记 `sheetTaskDetected`；合并 execution policy 与 `runtimeRunTrace` |
| `lib/openclaw-control-plane/workflow-execution-policy.js` | broker 前：`taskSize`、`multiAgentRequired`、`skippedAgents`、`forcedRuntimeV2` |

## 3. Gate Adapter

`lib/feishu-cursor/runtime/pipeline-gate-adapter.js` 只做结构性校验，**不允许任何二次分类**：

- 校验 `workflowKey` ∈ 白名单。
- 校验 `taskSubtype` ∈ 白名单。
- 校验 `role` ∈ `{specialized, fallback}` 且与 `workflowKey` 一致（`specialized` 必须非 `general`，`fallback` 必须 `general`）。
- 命中任何 `qa / debug / P0 / P2 / custom_mode / legacy_mode` 字面值 → 视为 residue。
- fail-closed：把 classification 替换成 `general` fallback，并在 `dispatch.route.reasonCodes` 中追加 `pipeline_gate_failed` 与 `gate:<violation>`。

## 4. 与 Brief / PRD 工作流脚本的关系

PRD 类需求由 `.cursor/rules/prd-workflow.mdc` 定义的子 Agent 产线（Brief / Outline / Writer / Review）拼装；Workflow Agent 只负责落盘 + 跑 `verify:prd-gates`。两类 Gate 互不冲突：

- `verify-prd-gates.py` 校验 `_brief-*.md` / `*-prd.md` / `_state-*.md` 等文件级一致性。
- `verify-workflow-gates.py` 校验运行时 classification + 多 Agent 留痕，按 `workflowKey` 分发到 research / code / solution gate。
