# Workflow Governance Implementation Roadmap

> 本文档定义从当前 `feishu-bridge` 演进到可治理 AI 工作流系统的实施路线。目标是避免一上来大规模改代码，而是先建立上下文、任务、门禁、追踪，再逐步接入 Harness 与多 Agent 执行。

---

## 1. Roadmap Goal

目标不是一次性做完整平台，而是建立一个可验证、可迭代、可回滚的工作流治理闭环：

```text
AI Context
  -> Task List
  -> Context Pack
  -> Execution Policy
  -> Gate
  -> Run Trace
  -> Result Policy
  -> Harness-controlled execution
```

最终希望达到：

1. 用户提出复杂任务时，系统能先生成任务计划。
2. 每个任务步骤都有明确输入、输出、Owner、状态、完成标准。
3. 每个 Agent 只拿到对应 Context Pack，不读取无关上下文。
4. 代码、文档、调研、PRD、方案都有不同 Gate。
5. 每次执行可以追踪、审查、回滚。
6. Harness 作为执行边界，而不是替代 PM Agent。

---

## 2. Phase Overview

| Phase | 名称 | 目标 | 主要产物 | 是否改运行代码 |
|---:|---|---|---|---|
| 0 | Context Stabilization | 稳定 AI 阅读入口和仓库地图 | `docs/ai-context/*` | 否 |
| 1 | Current-State Audit | 梳理现有工作流与代码现状 | 现状审计文档 | 否 |
| 2 | Governance Schema | 定义任务、上下文、追踪、门禁数据结构 | schema / gate 文档 | 少量 |
| 3 | PM Planning Loop | 引入 PM Agent 计划与 Task List | 任务计划闭环 | 是 |
| 4 | Context Pack Execution | 为执行者提供最小上下文 | Context Pack Builder | 是 |
| 5 | Gate & Trace | 加入审核门禁和执行轨迹 | Gate runner / trace recorder | 是 |
| 6 | Harness Boundary | 引入执行边界、命令白名单、目录约束 | Harness policy | 是 |
| 7 | Multi-Agent Expansion | 扩展 PRD/Research/Solution/Code/Review 多角色 | 多 Agent routing | 是 |

---

## 3. Phase 0 — Context Stabilization

### 目标

先让 GPT / Codex / Cursor / Agent 读仓库时有稳定入口，不再随机读历史文件、导出文件或实验代码。

### 已完成 / 计划产物

| 文件 | 状态 | 说明 |
|---|---|---|
| `docs/ai-context/README.md` | done | AI 阅读入口 |
| `docs/ai-context/workflow-governance-map.md` | done | 工作流治理地图 |
| `docs/ai-context/implementation-roadmap.md` | current | 实施路线图 |
| `docs/ai-context/task-entrypoints.md` | todo | 不同任务类型的读取入口 |

### 验收标准

- AI 能知道优先读哪些文件。
- AI 能知道默认跳过哪些文件。
- AI 能区分当前源文档、历史备份、导出产物、实验文件。
- AI 能理解 PM Agent / Harness / Gate / Trace 的关系。

### 不做

- 不改运行代码。
- 不引入复杂 Agent 调度。
- 不直接删除核心源文档。

---

## 4. Phase 1 — Current-State Audit

### 目标

梳理当前系统实际状态，避免基于想象改造。

### 需要读取

```text
AGENTS.md
package.json
feishu-ws-cursor.js
lib/feishu-channel/bridge-host.js
lib/feishu-cursor/pipeline-v2.js
lib/openclaw-gateway-adhoc.js
lib/openclaw-control-plane/
docs/cursor-architecture/
test/
scripts/*selfcheck*
```

### 产物

```text
docs/ai-context/workflow-current-state.md
```

建议内容：

1. 当前飞书消息入口链路。
2. 当前 pipeline 编排方式。
3. 当前 OpenClaw Gateway 调用方式。
4. 当前已有 workflow / multi-agent / gate 设计。
5. 当前已有测试覆盖。
6. 当前缺口。
7. 不建议改动的高风险点。

### 验收标准

- 能画出当前实际调用链路。
- 能指出现有治理文档与代码实现是否一致。
- 能列出最小可改造切入点。
- 不进行代码改动。

---

## 5. Phase 2 — Governance Schema

### 目标

先定义治理对象的数据结构，再接运行逻辑。

### 建议新增目录

```text
workflow/
  schemas/
    task-list.schema.json
    context-pack.schema.json
    run-trace.schema.json
  gates/
    intake-gate.md
    context-gate.md
    output-gate.md
    code-gate.md
    cleanup-gate.md
    review-gate.md
```

### 核心对象

| 对象 | 作用 |
|---|---|
| Task List | 记录任务图、状态、Owner、输入、输出、依赖 |
| Context Pack | 为执行单元提供最小上下文 |
| Run Trace | 记录执行过程、工具、文件、结果、错误 |
| Gate | 判断是否允许进入下一阶段 |
| Result Policy | 决定回复、写文档、提交代码、继续或停止 |

### 验收标准

- schema 可以描述最小任务闭环。
- gate 文档可以被人和 AI 共同理解。
- 不强制引入数据库。
- 第一版可以用 markdown / json 文件承载。

### 不做

- 不做复杂 UI。
- 不做长期存储平台。
- 不引入过早抽象。

---

## 6. Phase 3 — PM Planning Loop

### 目标

让复杂任务先经过 PM Agent / Planner 拆解，而不是直接进入执行。

### 目标链路

```text
User Request
  -> classify task
  -> create plan
  -> create task list
  -> define gates
  -> wait / execute according to risk
```

### 可能涉及文件

```text
lib/openclaw-control-plane/request-planner.js
lib/openclaw-control-plane/workflow-execution-policy.js
lib/openclaw-control-plane/intent-router.js
lib/feishu-cursor/policies/task-classifier.js
lib/feishu-cursor/models/task-context.js
```

### 产物

1. Planner 输出结构定义。
2. Task List 生成逻辑。
3. 风险等级判断规则。
4. 用户可读计划摘要。

### 验收标准

- 简单任务不强制进入复杂工作流。
- 复杂任务能生成结构化 Task List。
- Task List 至少包含 task_id、title、type、status、owner、input、expected_output、gate。
- 高风险任务默认先输出计划，不直接改代码。

---

## 7. Phase 4 — Context Pack Execution

### 目标

每个 Executor Agent 不再读取全仓库，而是只读取 PM Agent 指定的 Context Pack。

### 目标链路

```text
Task List Item
  -> Context Pack Builder
  -> Executor Agent
  -> Output Artifact
```

### 可能涉及文件

```text
lib/feishu-cursor/task-builders/task-context-builder.js
lib/feishu-cursor/models/task-context.js
lib/feishu-cursor/runner/runner-selector.js
lib/feishu-cursor/runtime/specialized-solo-runner.js
```

### 产物

1. Context Pack schema。
2. Context Pack Builder。
3. 不同任务类型的 must_read / may_read / skip 规则。
4. Context Gate。

### 验收标准

- 每个任务有独立 Context Pack。
- Context Pack 明确 must_read、may_read、skip、constraints、expected_output。
- Executor 不应自行扩大读取范围，除非回到 PM Agent 请求扩展。
- 能减少历史文档、导出文件、实验文件对结果的污染。

---

## 8. Phase 5 — Gate & Trace

### 目标

把“是否完成”和“执行过程”显式化。

### Gate 类型

| Gate | 作用 |
|---|---|
| Intake Gate | 判断目标、风险、是否需要计划 |
| Context Gate | 判断 Context Pack 是否足够且干净 |
| Output Gate | 判断输出是否满足任务要求 |
| Code Gate | 判断代码修改范围、测试建议、安全性 |
| Cleanup Gate | 判断删除/归档是否安全 |
| Review Gate | 交付前复核 |

### Trace 最小字段

```json
{
  "run_id": "run-xxx",
  "task_id": "task-xxx",
  "actor": "code-agent",
  "input_summary": "...",
  "files_read": [],
  "files_written": [],
  "tools_used": [],
  "output_summary": "...",
  "gate_result": "passed",
  "error": null
}
```

### 可能涉及文件

```text
lib/feishu-cursor/runtime/run-trace-recorder.js
lib/feishu-cursor/runtime/pipeline-gate-adapter.js
lib/feishu-cursor/runtime/multi-agent-runtime-guards.js
scripts/verify-workflow-gates.py
scripts/code-gate.py
scripts/research-gate.py
scripts/solution-gate.py
```

### 验收标准

- 每次复杂任务至少有一条 run trace。
- Gate 失败必须停止或回到 PM Agent。
- 输出能说明失败原因。
- 不允许 Gate 失败后继续隐式推进。

---

## 9. Phase 6 — Harness Boundary

### 目标

在已有计划、任务、上下文、门禁后，再加入 Harness 作为执行边界。

### Harness 应控制

1. 可访问目录。
2. 可运行命令。
3. 可写文件范围。
4. 是否允许联网。
5. 是否允许提交 commit。
6. 超时策略。
7. 失败处理。
8. 输出格式。

### Harness 不应控制

1. 用户真正目标。
2. 产品优先级。
3. 任务拆解。
4. Agent 角色设计。
5. 业务完成标准。

### 产物

```text
workflow/harness-policy.md
workflow/tool-allowlist.md
workflow/write-scope.md
```

### 验收标准

- Executor 只能在授权目录和命令范围内执行。
- 危险操作需要更高 Gate。
- Harness 失败能被 Trace 记录。
- 不把 Harness 当成 PM Agent。

---

## 10. Phase 7 — Multi-Agent Expansion

### 目标

在最小闭环稳定后，再扩展多 Agent，而不是一开始就多 Agent 化。

### 建议角色

| Agent | 主要职责 |
|---|---|
| PM Agent | 拆任务、定计划、控进度、汇总结果 |
| Research Agent | 调研、事实收集、竞品/资料分析 |
| PRD Agent | 需求文档、用户故事、验收标准 |
| Solution Agent | 系统方案、流程、架构、边界 |
| Code Agent | 代码实现、局部重构 |
| Review Agent | 评审输出、风险、缺口、测试建议 |
| Cleanup Agent | 文档/文件清理、归档建议 |

### 验收标准

- 每个 Agent 有明确输入和输出。
- Agent 之间通过 Task List 和 Context Pack 协作，而不是共享无限上下文。
- PM Agent 能看到所有任务状态。
- Review Agent 能否决或打回。

---

## 11. Recommended Immediate Next Steps

当前最合理的下一步：

```text
1. 创建 task-entrypoints.md
2. 做 workflow-current-state.md 现状审计
3. 定义 workflow/schemas/*.json
4. 定义 workflow/gates/*.md
5. 再开始改 Planner / Task List 代码
```

不建议下一步直接做：

```text
- 大规模改 pipeline
- 直接引入复杂 Harness
- 一次性多 Agent 化
- 自动提交大范围代码重构
```

---

## 12. Rollback Principle

每一阶段都必须可回滚。

| 阶段 | 回滚方式 |
|---|---|
| 文档阶段 | revert docs commit |
| schema 阶段 | 保留旧逻辑，不接运行链路 |
| planner 阶段 | feature flag 关闭 |
| context pack 阶段 | fallback 到旧 task context |
| gate 阶段 | gate 只 warning，不阻断，逐步升级 |
| harness 阶段 | fallback 到人工审批执行 |
| multi-agent 阶段 | fallback 到 single-agent execution |

---

## 13. Definition of Done

整个治理改造完成的判断标准：

1. 用户提出复杂任务后，系统不会直接黑盒执行。
2. PM Agent 能生成结构化任务计划。
3. 每个任务有独立 Context Pack。
4. Executor 执行有边界。
5. Gate 能拦截明显不合格输出。
6. Trace 能说明执行过程。
7. 用户能看到任务如何推进。
8. 出错后能定位、回滚、重试。

---

## 14. Relation to Existing Documents

本文档与现有文档关系：

| 文件 | 关系 |
|---|---|
| `docs/ai-context/README.md` | AI 阅读入口 |
| `docs/ai-context/workflow-governance-map.md` | 治理结构地图 |
| `docs/ai-context/implementation-roadmap.md` | 分阶段实施路线 |
| `docs/cursor-architecture/generic-workflow.md` | 可作为具体 workflow 设计来源 |
| `docs/cursor-architecture/workflow-evolution-policy.md` | 可作为演进策略来源 |
| `docs/cursor-architecture/workflow-governance-overview.md` | 可作为治理概览来源 |
| `docs/cursor-architecture/multi-agent/` | 可作为 Agent 角色和 gate 规则来源 |

如果存在冲突，当前优先级：

```text
docs/ai-context/README.md
> docs/ai-context/workflow-governance-map.md
> docs/ai-context/implementation-roadmap.md
> docs/cursor-architecture/*
> historical / backup / archived
```
