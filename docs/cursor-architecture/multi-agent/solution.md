# Solution Workflow

> Contract：`lib/feishu-cursor/contracts/solution.contract.js`
> Registry：`workflow-registry.js#solution`
> Runtime Gate：`scripts/solution-gate.py`

## 1. 触发与角色

- 触发：`task-classifier` 的 `SOLUTION_RE`（方案设计 / 可行性 / 路线图 / 发布计划 / 灰度方案 / 增长方案 / 实验设计 / 阶段计划 …）或 prefix `/solution`。
- `workflowKey`: `solution`，`role`: `specialized`，`taskSubtype`: `none`。
- 子 Agent：**Workflow → Strategist**（M 以上规模强制 + Reviewer）。

## 2. 五种 mode（白名单）

| mode | 用途 | 必备产物 |
|---|---|---|
| `feasibility` | 可行性判断 / 做不做 | `recommendation` ∈ {do, hold, drop}, `risks[]`, `assumptions[]` |
| `roadmap` | 长周期路线图（≥ 1 季度） | `phases[]`（≥ 2），每条含 `objective` / `outcome` / `timeline` |
| `plan` | 中短期执行计划（≤ 1 季度） | `milestones[]`（≥ 3），每条含 `deliverable` / `owner` / `dueWeek` |
| `release` | 发布 / 灰度 / 上线计划 | `gates[]`（pre / launch / post）, `rollbackPlan`, `metrics[]` |
| `growth` | 增长 / 实验 / 渠道方案 | `hypothesis`, `experiments[]`（含 metric & sampleSize） |

> mode 由 contract 解析关键词。命中多个时按 `feasibility > roadmap > release > growth > plan` 优先级取一。

## 3. 任务规模（`taskSize`）

| size | 描述 | Reviewer 强制 |
|---|---|---|
| `S` | 单段建议、单一对比 | 不强制 |
| `M` | 多对比 / 多目标 | 不强制（建议 review） |
| `L` | 跨子系统 / 多季度 / 资金敏感 | 必须 reviewerRecords |
| `XL` | 战略级 / 公司级影响 | 必须 reviewerRecords + 至少 1 条 `requiredFixes` 已闭环 |

`scripts/solution-gate.py` 在 `taskSize ∈ {L, XL}` 且无 `reviewerRecords` 时拒绝，阻止单 Agent 直出战略性方案。

## 4. 产物结构（共同字段）

```jsonc
{
  "workflowKey": "solution",
  "mode": "feasibility | roadmap | plan | release | growth",
  "taskSize": "S | M | L | XL",
  "summary": "string",
  "decisions": [...],
  "tradeoffs": [...],
  "risks": [...],
  "openQuestions": [...],
  "runtimeTrace": { "agentsExecuted": [...], "handoffRecords": [...], "reviewerRecords": [...] }
}
```

## 5. 禁止行为

- 跨 mode 混写：例如声明 `mode: feasibility` 却给完整 `phases[]`。
- 用文字水大量章节凑结构（Reviewer 必须给出有效改动建议，不能只给「looks good」）。
- 引用 `qa`/`debug`/`P0`/`P2` 老术语作为优先级标签 — 改用 `taskSize` + `decisions[].priority ∈ {high, medium, low}`。
