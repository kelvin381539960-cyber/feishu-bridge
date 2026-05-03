# Task Ledger Template

> 本文件是当前任务的唯一真相。
> 所有执行计划、Agent 分工、上下文装载、任务状态、产出物、阻塞问题、用户确认，都必须记录在这里。

---

# 1. Task Overview

## 1.1 Task Name

待填写

## 1.2 User Goal

用户原始目标：

> 待填写

## 1.3 Task Type

可选类型：

- generic_project
- product_design
- prd_writing
- research
- document_cleanup
- knowledge_base
- code_analysis
- code_generation
- data_analysis
- strategy_plan
- operation_plan
- review_audit
- learning_plan
- other

当前类型：

```text
待填写
```

## 1.4 Workflow Profile

可选 Profile：

- Profile A：通用复杂任务
- Profile B：文档生成任务
- Profile C：调研分析任务
- Profile D：代码 / 技术任务
- Profile E：执行管理任务

当前 Profile：

```text
待填写
```

## 1.5 Expected Output

最终输出物：

- 待填写

## 1.6 Execution Mode

执行模式：

- Sequential：按顺序执行
- Parallel：部分任务并行
- Review-gated：每阶段审核后继续
- User-gated：每阶段需要用户确认

当前模式：

```text
User-gated
```

## 1.7 Confirmation Rule

确认规则：

```text
每个阶段结束后必须等待用户确认。
关键决策必须等待用户确认。
不允许自动进入下一阶段。
如果需要新增独立新任务，必须先询问用户确认。
```

---

# 2. Stage Plan

| Stage ID | 阶段名称 | 阶段目标 | 主要 Agent | 阶段输出物 | 是否需要用户确认 | 状态 |
|---|---|---|---|---|---|---|
| S0 | 任务定义 | 明确目标、边界、任务类型 | PM Agent | Task Brief | 是 | Todo |
| S1 | 任务拆解 | 拆阶段、拆任务、定 Agent | PM Agent | Task Plan | 是 | Todo |
| S2 | 上下文装载 | 明确每个任务需要读取什么 | Context Agent | Context Packs | 是 | Todo |
| S3 | 执行阶段 | 按任务逐步执行 | Assigned Agents | 中间产出物 | 视任务而定 | Todo |
| S4 | 审核阶段 | 检查质量、漏项、冲突 | Review Agent | Review Report | 是 | Todo |
| S5 | 最终交付 | 整理最终结果 | PM Agent | Final Output | 是 | Todo |
| S6 | 复盘沉淀 | 记录经验、问题、可复用模板 | PM Agent | Retrospective | 否 | Todo |

---

# 3. Task List

| Task ID | Stage | 任务名称 | 任务目标 | 执行 Agent | Context Pack | 输入 | 输出物 | 完成标准 | 状态 | 依赖任务 |
|---|---|---|---|---|---|---|---|---|---|---|
| T-001 | S0 | 理解用户目标 | 明确用户真正要完成什么 | PM Agent | CP-001 | 用户原始输入 | 任务目标说明 | 目标、边界、输出物明确 | Todo | 无 |
| T-002 | S0 | 判断任务类型 | 判断本任务属于哪种执行类型 | PM Agent | CP-001 | 任务目标说明 | Task Type | 类型选择合理 | Todo | T-001 |
| T-003 | S0 | 明确任务边界 | 明确做什么、不做什么 | PM Agent | CP-001 | 用户原始输入 | Scope / Out of Scope | 边界明确 | Todo | T-002 |
| T-004 | S0 | 阶段 0 审核 | 检查任务定义是否完整 | Review Agent | CP-REVIEW | T-001~T-003 | Review Result | 无明显漏项 | Todo | T-003 |
| T-005 | S0 | 用户确认阶段 0 | 等待用户确认任务定义 | User | N/A | Stage 0 输出 | 用户确认 | 用户明确确认 | Pending User Confirm | T-004 |

---

# 4. Decision Log

| Decision ID | 日期 | 决策内容 | 决策人 | 影响范围 | 来源任务 | 状态 |
|---|---|---|---|---|---|---|
| DEC-001 | 待填写 | 待填写 | User | 待填写 | T-XXX | Pending |

## 关键决策定义

以下内容必须进入 Decision Log：

1. 任务目标变化
2. 任务范围变化
3. 最终输出物变化
4. 执行路径变化
5. 关键方案选择
6. 风险接受或遗留
7. 是否新增独立任务台账

---

# 5. Gap List

| Gap ID | 来源任务 | 问题描述 | 影响范围 | 优先级 | Owner | 状态 | 解决结论 |
|---|---|---|---|---|---|---|---|
| GAP-001 | T-XXX | 待填写 | 待填写 | P0 / P1 / P2 | 待填写 | Open | 待填写 |

Gap 状态：

- Open：未解决
- In Review：处理中
- Confirmed：已确认
- Won't Fix：明确不处理
- Deferred：延后处理

---

# 6. Execution Records

## T-XXX 回填模板

### Task ID

T-XXX

### Status

Todo / Doing / Review / Done / Blocked / Pending User Confirm

### Assigned Agent

待填写

### Context Pack Used

待填写

### Input Used

- 待填写

### Execution Summary

- 待填写

### Output

- 待填写

### Issues Found

- 待填写

### New Gaps

- 待填写

### New Decisions Needed

- 待填写

### Completion Check

| 检查项 | 是否通过 | 说明 |
|---|---|---|
| 是否完成任务目标 | 是 / 否 |  |
| 是否使用指定上下文 | 是 / 否 |  |
| 是否产生指定输出物 | 是 / 否 |  |
| 是否存在未确认假设 | 是 / 否 |  |
| 是否需要用户确认 | 是 / 否 |  |

### Next Step

- 待填写
