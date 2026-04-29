# Workflow Current State Audit

> Phase 1 审计文档。本文只记录当前事实、缺口和下一步切入点，不改运行代码。

---

## 1. Audit Scope

本次审计读取并参考了以下关键文件：

```text
AGENTS.md
package.json
feishu-ws-cursor.js
lib/feishu-channel/bridge-host.js
lib/feishu-cursor/pipeline-v2.js
lib/openclaw-control-plane/request-planner.js
lib/openclaw-control-plane/workflow-execution-policy.js
lib/feishu-cursor/task-builders/task-context-builder.js
lib/feishu-cursor/runtime/run-trace-recorder.js
docs/cursor-architecture/README.md
docs/cursor-architecture/workflow-governance-overview.md
```

结论：当前仓库不是从零开始，已经有比较完整的 workflow / gate / trace / specialized workflow 雏形。下一步不应重造大框架，而应补齐 **Task List / Context Pack / Gate Runtime / Harness Boundary** 的实际闭环。

---

## 2. Current Runtime Chain

当前主链路如下：

```text
Feishu Message
  -> @larksuiteoapi WSClient
  -> feishu-ws-cursor.js
  -> lib/feishu-channel/bridge-host.js
  -> createFeishuChannelRunner()
  -> lib/feishu-cursor/pipeline-v2.js
  -> lib/openclaw-control-plane/request-planner.js
  -> policy / broker / dispatch
  -> OpenClaw Gateway
  -> normalized execution result
  -> reply / doc export / memory / chain-next
```

### 事实

1. `feishu-ws-cursor.js` 是极薄入口，只负责启动 `startFeishuBridgeHost()`。
2. `bridge-host.js` 负责读取配置、启动飞书 WSClient、注册 `im.message.receive_v1` 事件，并将事件交给 runner。
3. `pipeline-v2.js` 是当前实际主编排，承担解析、路由、媒体处理、引用上下文、@ 上下文、计划、执行、回复等大量职责。
4. `request-planner.js` 已经是控制平面门面，但当前还比较薄：classification -> policy -> broker。
5. `workflow-execution-policy.js` 已经能输出 `taskSize`、`multiAgentRequired`、`agentsPlanned`、`skippedAgents`、`decisionReason`。
6. `run-trace-recorder.js` 已经存在 runtime trace 对象，且明确只信 runtime，不信 LLM 自称执行。

---

## 3. Existing Governance Baseline

现有治理文档已经定义了较强约束：

```text
docs/cursor-architecture/README.md
docs/cursor-architecture/workflow-governance-overview.md
docs/cursor-architecture/multi-agent/*
```

### 已有设计事实

1. Cursor 原生任务编排被设计为五层：规则层、入口定向层、技能层、持久化层、工具层。
2. Workflow 白名单已经收敛为 5 类：

```text
prd
research
code
solution
general
```

3. 现有治理要求包括：

```text
- workflowKey 白名单
- workflowKey + taskSubtype 双轨字段
- pipeline gate 无条件执行
- solution L/XL 需要 reviewer 留痕
- code.execute 需要 executionAuthorization
- multi-agent runtime guards 防止子 Agent 越权
```

4. `package.json` 已经包含多类 gate / verification 脚本：

```text
npm test
npm run verify:workflow
npm run verify:research
npm run verify:code
npm run verify:solution
npm run smoke:runtime
npm run scan:residue
```

### 判断

现有文档和代码已经具备“治理化”方向，但还不是完整的 PM Agent / Task List / Context Pack 执行系统。

---

## 4. What Already Exists

| 能力 | 当前状态 | 说明 |
|---|---|---|
| Feishu WS 入口 | exists | `feishu-ws-cursor.js` + `bridge-host.js` |
| Pipeline v2 | exists | 当前主编排，职责较重 |
| Control Plane Facade | partial | `request-planner.js` 已存在，但较薄 |
| Workflow Classification | exists | 已有 workflowKey / taskSubtype 设计 |
| Workflow Execution Policy | partial | 已能判断 taskSize / multiAgentRequired |
| Gate Adapter | exists | pipeline 已调用 `applyPipelineGate()` |
| Specialized Workflow | partial | research V2 已有特殊处理；prd/code/solution multi-agent 仍 pending |
| Runtime Trace | partial | trace 对象已存在，但尚未形成完整 run log 持久化闭环 |
| Task Context | exists | 有 `task-context-builder.js`，但不是 Context Pack |
| Tests / Gates | exists | npm scripts 已挂多类测试与 gate |
| Harness | not yet | 尚未看到独立 harness policy / allowlist / write scope |
| Task List | not yet | 尚未作为一等对象落地 |
| Context Pack | not yet | 尚未作为一等对象落地 |

---

## 5. Main Gap Analysis

### Gap 1: Pipeline v2 过重

`pipeline-v2.js` 同时承担：

```text
parse
routing
media
memory
classification
planning
gate
execution
reply
doc export
research clarify state
```

这说明它是实际主链路，但也导致治理能力容易散落在一个大函数中。

建议：下一步不要直接重构整条 pipeline，而是在外侧逐步抽出 Task List / Context Pack / Gate / Trace 的对象模型。

---

### Gap 2: Planner 还不是 PM Agent

`request-planner.js` 当前职责是：

```text
classifyOpenclawIntent
resolveOpenclawPolicies
planExecutionBroker
```

它更像执行计划门面，还不是完整 PM Agent。

缺失：

```text
- 任务拆解
- 多步骤计划
- Task List 生成
- Context Pack 指定
- Gate 设置
- 风险分级后的执行策略
```

建议：不要直接把 `request-planner.js` 改成超级大脑，而是新增 Planner 输出结构和 Task List schema，再逐步接入。

---

### Gap 3: Task Context 不是 Context Pack

当前 `task-context-builder.js` 创建的是 pipeline 内部 task context，包含 chatId、messageId、task、classification、prompt、memory 等。

这对运行态很有用，但它不是治理意义上的 Context Pack。

Context Pack 需要表达：

```text
must_read
may_read
skip
constraints
expected_output
stop_conditions
```

建议：新增 `workflow/schemas/context-pack.schema.json`，不要直接替换现有 task context。

---

### Gap 4: Run Trace 已有，但未形成完整审计账本

`run-trace-recorder.js` 已有：

```text
createRunTrace
planAgents
recordAgentExecuted
recordSkippedAgent
recordHandoff
recordReviewer
setGateResult
```

这很好，但当前还需要明确：

```text
- trace 写到哪里
- 每个 task 是否必须有 trace
- trace 与 Task List 如何关联
- Gate 失败如何写入 trace
- 用户如何查看 trace 摘要
```

建议：第一阶段可用 `runs/YYYY-MM-DD/*.jsonl` 或 `workflow/runs/*.jsonl`，不急着上数据库。

---

### Gap 5: Harness 尚未落地为执行边界

当前文档对 Harness 的定位已经明确：Harness 控制怎么执行，不负责决定做什么。

但仓库里尚未看到稳定的：

```text
workflow/harness-policy.md
workflow/tool-allowlist.md
workflow/write-scope.md
```

建议：等 Task List / Context Pack / Gate 结构稳定后，再接 Harness。

---

## 6. Risk Areas

以下区域不建议一开始大改：

| 区域 | 风险 |
|---|---|
| `pipeline-v2.js` | 主链路过重，直接重构容易破坏飞书回复 |
| `bridge-host.js` | 涉及 WS 连接、secret、systemd 运行稳定性 |
| `openclaw-gateway-adhoc.js` | 影响 OpenClaw Gateway 调用 |
| `workflow-execution-policy.js` | 影响 specialized / multi-agent 判断 |
| `pipeline-gate-adapter.js` | Gate fail-closed，改错会导致误兜底 |
| `run-trace-recorder.js` | Trace 是审计基础，字段变更需同步 gate/test |
| `deploy/*.service` | 线上运行路径和服务行为 |

---

## 7. Recommended Minimum Next Cut

下一步不建议直接上 Harness，也不建议直接大规模改 `pipeline-v2.js`。

建议最小切入点：

```text
workflow/
  schemas/
    task-list.schema.json
    context-pack.schema.json
    run-trace.schema.json
  gates/
    intake-gate.md
    context-gate.md
    cleanup-gate.md
```

然后再新增：

```text
lib/openclaw-control-plane/task-list-planner.js
lib/openclaw-control-plane/context-pack-planner.js
```

但第一步只建 schema 和 gate 文档，不接运行链路。

---

## 8. Proposed Next Phase

进入 Phase 2：Governance Schema。

建议任务顺序：

1. 创建 `workflow/schemas/task-list.schema.json`。
2. 创建 `workflow/schemas/context-pack.schema.json`。
3. 创建 `workflow/schemas/run-trace.schema.json`。
4. 创建 `workflow/gates/intake-gate.md`。
5. 创建 `workflow/gates/context-gate.md`。
6. 创建 `workflow/gates/cleanup-gate.md`。
7. 再考虑接入 Planner。

---

## 9. Current-State Verdict

当前系统状态可以概括为：

```text
已有飞书桥主链路
已有 pipeline v2
已有 workflow 分类
已有部分 gate
已有 runtime trace 基础
已有多 Agent 治理文档
但缺少 Task List / Context Pack / Harness Boundary 的一等对象和最小运行闭环
```

因此，后续改造方向不是“推翻重做”，而是：

```text
在现有 pipeline + control-plane 上，补齐 PM Agent 需要的治理对象。
```

---

## 10. Definition of Ready for Code Changes

只有满足以下条件后，才建议开始改运行代码：

1. Task List schema 已创建。
2. Context Pack schema 已创建。
3. Run Trace schema 与现有 `run-trace-recorder.js` 对齐。
4. Intake / Context / Code / Cleanup gate 规则明确。
5. 已明确最小接入点，不直接重构整条 pipeline。
6. 有 rollback 方案：feature flag 或 fallback 到旧 `taskContext` / 旧 planner。
