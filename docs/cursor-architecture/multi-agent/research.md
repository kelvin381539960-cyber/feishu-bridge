# Research Workflow

> Contract：`lib/feishu-cursor/contracts/research.contract.js`
> Registry：`workflow-registry.js#research`
> Runtime trace + 分发 Gate：`scripts/verify-workflow-gates.py`（先于子 Gate）  
> 模型输出 Gate：`scripts/research-gate.py`
> Pipeline 子流程：`lib/openclaw-control-plane/research-workflow-runner.js`

## 1. 触发与角色

- 触发：`task-classifier` 命中 `RESEARCH_RE`、prefix `/调研`，或 `isResearchLikeTask` 命中。
- `workflowKey`: `research`，`role`: `specialized`，`taskSubtype`: `none`。
- 子 Agent：**Workflow → Researcher**（必要时附加 Reviewer，对应 reviewerRecords）。

## 2. 双阶段：clarify → execute

| stage | 输入 | 输出 | Gate 期望 |
|---|---|---|---|
| `clarify` | 原始用户任务 | 1–10 条编号澄清问题 | `expectedOutput.kind = clarification_questions` |
| `execute` | clarify 阶段的用户回答（注入 `qaContext`） | 完整 Markdown 调研报告（§0–§7 + 参考资料） | `expectedOutput.kind = markdown_research_report` + 通过 `validateResearchOutput` |

切换规则：

- 用户首次提出 → clarify。
- 收到澄清回答（`isLikelyClarificationAnswer` 命中或 `qaContext` 已有） → execute。
- 显式重新调研关键词（`新调研 / 重开调研 / 重新调研...`）→ 回 clarify。

## 3. 报告骨架（execute）

```
# <主题>
> 调研日期 | 作者：OpenClaw Agent
## 0. 用户意图与调研范围
## 1. 执行摘要
## 2. 背景与定义
## 3. 核心机制 / 判断框架
## 4. 主流方案 / 实现对比   ← 必含 Markdown 表格
## 5. 优劣势、风险与适用场景
## 6. 现实案例 / 生产落地
## 7. 结论与建议
## 参考资料
```

至少 8 个二级章节、不少于 1800 字符、无过程性话术（`正在检索…` / `下面开始分析…` 等）。

## 4. Policy → V2 → 留痕 → Gate

1. **`workflow-execution-policy`**（`resolveWorkflowExecutionPolicy`）在 pipeline 内根据 `planTask` / `qaContext` / stage 计算 `taskSize`、`multiAgentRequired`、`decisionReason`、`forcedRuntimeV2`。
2. **Research execute + 多 Agent**：走 `research-workflow-runner` V2，写入完整 `runtimeRunTrace`（`Researcher_Crawler` → handoff → `Researcher_Analyst`、`gateResult`）。若环境未开 V2 但 policy 要求多 Agent，pipeline **强制 V2** 并打 `research_v2_forced_by_policy`。
3. **Research execute + 单 Agent（S/M）**：仍写 trace：`skippedAgents` 两角色 + `<workflow>_Solo` 或等价 executed 记录，满足 `verify-workflow-gates.py` 的 solo 分支。
4. **`verify-workflow-gates.py`**：specialized 一律校验 `runtimeRunTrace.source === "runtime"`、`decisionReason`；multi 时校验 `handoffRecords` 与 `AGENTS_PLAN_NOT_FULFILLED`；通过后才会调用 `research-gate.py` 做**正文**校验。

## 5. 模型输出 Gate（`scripts/research-gate.py`）

| 模式 | Gate 强约束 |
|---|---|
| `clarify` | 输出必须是编号问题列表；至少 1 条；禁止任何「报告章节」字符；禁止「我先开始调研」类承诺 |
| `execute` | 必含 §0–§7 全部章节 + 参考资料 + 至少一个 Markdown 表格 + `qaContext` 非空 |

多 Agent **runtime 留痕**由 `verify-workflow-gates` + `run-trace-recorder` 保证；`research-gate.py` 不负责解析 trace（避免重复；统一入口已拦截）。

## 6. 云文档导出

`lib/feishu-docx-export.js#resolveFeishuDocExportKind` 在 `workflowKey === "research"` 时优先返回 `research`，触发自动写入飞书云文档；不再依赖 `taskType` 关键词命中。
