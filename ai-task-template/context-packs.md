# Context Packs

> Context Pack 用于限制 Agent 的上下文范围。
> 每个 Agent 执行任务前，只能读取对应 Context Pack 指定的信息。

---

# 1. Context Pack 基本结构

每个 Context Pack 必须包含：

```md
## CP-XXX：上下文包名称

### 适用任务

- T-XXX

### 必须读取

- 待填写

### 允许参考

- 待填写

### 禁止读取 / 禁止使用

- 待填写

### 输出要求

- 待填写

### 禁止事项

- 待填写
```

---

# 2. 通用 Context Pack

## CP-001：任务启动上下文

### 适用任务

- T-001
- T-002
- T-003

### 必须读取

- 用户原始输入
- 当前 Task Ledger
- 当前已确认的上下文

### 允许输出

- 任务目标
- 任务类型
- 任务边界
- 初始阶段拆解

### 禁止事项

- 不得直接进入完整执行
- 不得自动补全用户未说明的关键目标
- 不得跳过用户确认

---

## CP-PLAN：任务拆解上下文

### 适用任务

- 阶段拆解
- 任务拆解
- Agent 分工

### 必须读取

- Task Overview
- 用户目标
- 已确认 Scope
- Workflow Profile

### 允许输出

- Stage Plan
- Task List
- Agent Assignment
- 任务依赖关系

### 禁止事项

- 不得把未确认目标写进正式任务
- 不得新开独立任务台账，除非用户已确认

---

## CP-EXECUTE：执行上下文

### 适用任务

- 所有具体执行任务

### 必须读取

- 当前 Task ID
- 当前任务目标
- 当前任务输入
- 当前任务完成标准
- 当前任务依赖任务输出
- Decision Log
- Gap List

### 允许输出

- 当前任务结果
- 执行摘要
- 新增 Gap
- 新增 Decision Request
- 下一步建议

### 禁止事项

- 不得执行 Task Ledger 之外的任务
- 不得跳过依赖任务
- 不得把假设写成结论

---

## CP-REVIEW：审核上下文

### 适用任务

- 所有 Review Agent 任务

### 必须读取

- 当前阶段全部输出
- Task Ledger
- Decision Log
- Gap List
- 当前阶段完成标准

### 审核维度

1. 是否满足当前阶段目标
2. 是否有明显漏项
3. 是否存在前后冲突
4. 是否有未经确认的假设
5. 是否有需要用户确认的关键决策
6. 是否可以进入下一阶段

### 输出要求

- 审核结论
- 问题清单
- 阻塞项
- 建议进入下一步 / 不建议进入下一步

### 禁止事项

- 不得替用户确认关键决策
- 不得直接关闭 Gap

---

## CP-CHANGE：变更上下文

### 适用任务

- 变更任务
- 新增任务
- 修改输出物
- 修改范围

### 必须读取

- 当前 Task Ledger
- 当前 Stage Plan
- 当前 Task List
- Decision Log
- Gap List
- 用户提出的变更内容

### 允许输出

- Change Request
- 影响范围评估
- Task Ledger 更新建议
- 是否需要用户确认

### 禁止事项

- 不得未经确认直接变更关键范围
- 不得自行新开独立任务台账
- 不得删除历史执行记录

---

## CP-DELIVER：交付上下文

### 适用任务

- 最终交付
- 输出物整理
- 归档

### 必须读取

- 全部已完成任务记录
- Decision Log
- Gap List
- Output Index
- 用户确认记录

### 允许输出

- Final Output
- Output Index
- 遗留问题说明
- 复盘摘要

### 禁止事项

- 不得隐藏未解决 Gap
- 不得修改已确认历史决策
