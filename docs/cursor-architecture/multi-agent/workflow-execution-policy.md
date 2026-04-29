# Workflow execution policy

> 实现：`lib/openclaw-control-plane/workflow-execution-policy.js#resolveWorkflowExecutionPolicy`  
> 消费：`lib/feishu-cursor/pipeline-v2.js`（Research V2 开关、`forcedRuntimeV2`、solo trace 输入）

## 位置

在 **classify** 之后、**execution-broker / enqueue** 之前解析一次，不修改 `classification`，只产出执行侧结构化策略对象，供：

- Research：`research-workflow-runner` 多 Agent 路径与 `runtimeRunTrace` 初始化；
- 全体 specialized 单 Agent：`specialized-solo-runner` 写 `skippedAgents` / `decisionReason`；
- `multiAgentRequired` 与 `payload.multiAgentRequired`（Gate 分支）。

## 输出字段（摘要）

| 字段 | 说明 |
|------|------|
| `workflow` / `taskType` | 与 registry 一致 |
| `taskSize` | `S` \| `M` \| `L` \| `XL` |
| `multiAgentRequired` | Research execute 可为 `true`；PRD/Code/Solution 本期恒 `false` |
| `agentsPlanned` | 多 Agent 时非空；clarify / pending 可为空数组 |
| `mustRunAgents` | 子集约束（与 runner 对齐） |
| `skippedAgents` | `{ agentRole, skipReason, ... }[]` |
| `skipReason` | 顶层摘要（与 `skippedAgents` 互补） |
| `decisionReason` | **任何路径必填**，机器可读片段 + 人类可读 |
| `reasonCodes` | 结构化原因码列表 |
| `forcedRuntimeV2` | 仅 Research：policy 要求多 Agent 但环境未开 V2 时由 pipeline 置位并打 telemetry |

## taskSize 规则（Research）

- **XL**：任务文本命中「正式报告 / 调研报告 / 面向决策…」等模式，或 `qaContext` 长度 ≥ 500。
- **L**：任务 > 120 字符，或 URL ≥ 2，或命中竞品/市场等行业强关键词。
- **M**：30–120 字符或含 1 个 URL。
- **S**：更短、无 URL、无上述强关键词。

（实现细节以 `workflow-execution-policy.js` 为准。）

## Research execute：多 Agent 必跑

任一命中则 `multiAgentRequired=true`，`agentsPlanned = ["Researcher_Crawler","Researcher_Analyst"]`：

- 关键词：`竞品|市场|行业|对比分析|调研报告|正式报告|生产落地`（见源码正则）；
- `taskSize` 为 `L` 或 `XL`；
- `qaContext` ≥ 500 字符；
- 任务含 ≥ 2 个 `http(s)` URL。

## Research execute：单 Agent 放行

同时满足：未触发多 Agent 条件，且 `taskSize ∈ {S,M}`。

- `decisionReason`：`research_focused_scope_size_s_or_m`（及实现内拼接的说明段）；
- `skippedAgents`：两角色均 `skipReason: single_agent_focused_scope`（或 clarify/pending 的专用 reason）。

## Research clarify

- `multiAgentRequired=false`；
- `skippedAgents` 两角色标记 `research_clarify_stage_only`；
- `decisionReason`：`research_clarify_stage|no_parallel_gather`。

## PRD / Code / Solution（本期）

- `multiAgentRequired=false`；
- `decisionReason`：`multi_agent_runtime_pending_<workflow>`；
- `skippedAgents`：`skipReason: multi_agent_runner_not_implemented_pending_phase2`（与 registry `multiAgentPolicy=conditional` 对齐）。

## Telemetry（pipeline）

- `policy_decision`：workflow / taskSize / multiAgentRequired / decisionReason；
- `research_v2_forced_by_policy`：环境未开 V2 但 policy 要求多 Agent 时强制走 V2；
- `specialized_trace_missing`：Gate 前校验失败（见 `gate-rules.md`）。
