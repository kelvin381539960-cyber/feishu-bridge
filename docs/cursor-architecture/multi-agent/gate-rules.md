# Gate rules（runtime trace）

> 统一入口：`scripts/verify-workflow-gates.py`（stdin JSON payload）  
> 模型输出子 Gate：`research-gate.py` / `code-gate.py` / `solution-gate.py` / `verify-prd-gates.py`  
> **顺序**：先 `validate_classification` → **`validate_runtime_trace`** → `general` 或 `dispatch_subgate`。

`verify-workflow-gates.py` 在 specialized（`taskType ∈ {prd,research,code,solution}` 且 `role=specialized`）时 **始终** 校验 `runtimeRunTrace`（不必等 `multiAgentRequired`）。

## 错误码与含义

| Code | 条件 | 修复指引 |
|------|------|----------|
| `SPECIALIZED_TRACE_REQUIRED` | specialized 但无 `runtimeRunTrace` 或非 object；或 `source !== "runtime"` | pipeline 必须为 specialized 写入 trace；检查 `specialized-solo-runner` / Research runner |
| `SPECIALIZED_DECISION_REASON_REQUIRED` | `decisionReason` 空 | policy + recorder 写入 |
| `SOLO_TRACE_INCOMPLETE` | `multiAgentRequired=false`：`agentsExecuted` 为空；或某 `skippedAgents` 缺 `skipReason` | solo 路径补全 `recordAgentExecuted` 与 `recordSkippedAgent` |
| `AGENTS_PLAN_NOT_FULFILLED` | `multiAgentRequired=true`：`agentsPlanned` 中某角色既未 `completed` 也未出现在 `skippedAgents` | 跑满计划或显式 skip |
| `RUNTIME_TRACE_INVALID` | 多 Agent 形态：缺 `agentsPlanned`、缺 `agentsExecuted`（且非「全部 planned 已 skip」）、缺 `handoffRecords` 等 | 对齐 `run-trace-recorder` API |
| `CLASSIFICATION_SCHEMA_*` | classification 缺字段或 fallback 无 `fallbackReason` | 修 classifier 或 adapter |

## multiAgentRequired 分支（verify-workflow-gates）

- **`true`**：调用 `_validate_multi_agent_trace_shape` + `_validate_plan_fulfillment`（`planned ⊆ completed ∪ skipped`）。
- **`false`（solo）**：至少一条 `agentsExecuted`；每条 `skippedAgents` 必有 `skipReason`。

## Node 侧预检

`lib/feishu-cursor/runtime/multi-agent-runtime-guards.js`：

- `validateSpecializedRuntime`：specialized 交付前强制 trace + `decisionReason`；
- `validateMultiAgentRuntime`：多 Agent 严检；全 planned 已 skip 的边界与 Python 对齐。

## General

`taskType=general` 且 `role=fallback`：不校验 `runtimeRunTrace`（维持原行为）。
