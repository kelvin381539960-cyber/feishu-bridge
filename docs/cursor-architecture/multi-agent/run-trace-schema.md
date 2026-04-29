# runtimeRunTrace schema

> 真源：`lib/feishu-cursor/runtime/run-trace-recorder.js`  
> 约束：`source` 必须为 **`runtime`**；不得由模型自述伪造。

## 顶层对象

| 字段 | 类型 | 说明 |
|------|------|------|
| `requestId` | string | UUID |
| `source` | `"runtime"` | 固定 |
| `workflow` | string | 如 `research` / `code` |
| `taskType` | string | 与 classification 对齐 |
| `mode` | string | 如 `execute` / `clarify` |
| `multiAgentRequired` | boolean | 与 policy / 实际 runner 一致 |
| `taskSize` | string | `S` \| `M` \| `L` \| `XL` |
| `decisionReason` | string | **Gate 必填**：策略与放行原因 |
| `skipReason` | string | 可选顶层摘要 |
| `forcedRuntimeV2` | boolean | Research：policy 强制 V2 |
| `agentsPlanned` | string[] | 计划角色 id |
| `agentsExecuted` | object[] | 见下 |
| `skippedAgents` | object[] | 见下 |
| `handoffRecords` | object[] | 多 Agent 时至少一条完整 handoff |
| `reviewerRecords` | object[] | 可选 |
| `gateResult` | object \| null | `setGateResult` 写入 |
| `createdAt` / `updatedAt` | ISO string | 维护时间戳 |

## agentsExecuted[]

| 字段 | 说明 |
|------|------|
| `agentRole` | 如 `Researcher_Crawler`、`Researcher_Analyst`、`<workflow>_Solo` |
| `status` | 如 `completed` |
| `startedAt` / `completedAt` | ISO |
| `outputRef` / `summary` | 可选 |

## skippedAgents[]

| 字段 | 说明 |
|------|------|
| `agentRole` | 与 planned 对齐 |
| `status` | 如 `skipped` |
| `skipReason` | **solo Gate 必填** |
| `fallbackAgent` / `fallbackReason` | 可选 |

## handoffRecords[]（多 Agent）

必填字段（见 `REQUIRED_HANDOFF_FIELDS`）：`fromAgent`, `toAgent`, `inputRef`, `outputRef`, `handoffSummary`, `status`。

终端失败态需带 `requiredFixes`；`status==="skipped"` 需 `skipReason`。

## Research 角色名册

| 角色 | 含义 |
|------|------|
| `Researcher_Crawler` | 抓取 / 素材聚合 |
| `Researcher_Analyst` | 分析与成文 |

单 Agent specialized（非 Research 多 Agent）使用约定角色名 **`<workflow>_Solo`**（如 `code_Solo`），与 `agentsPlanned` 中 policy 注入的 planned 角色一致。

## 失败语义

- Crawler/Analyst 失败：**不**静默降级单 Agent；trace 中记录 `recordSkippedAgent` 或失败 handoff，由上层返回错误与 telemetry（与 `research-workflow-runner` 实现一致）。
- PRD/Code/Solution：仅记录 pending skip，真实多 Agent runner 待二期。
