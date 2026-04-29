# Dry Run Checklist

> 用途：逐场景记录 dry run 实际执行证据，保证可验证、可复盘、可回写。  
> **A6 语义对齐**：与 `dry-run-plan.md` 文首一致——**方案已落盘，场景待执行**；§3 中 DR-01~05 仍为 `pending` 或未勾选 §1/§4 时，**不得**在对外表述中宣称「dry run 已执行完成」。

---

## 1. 执行前总检查

| 项目 | 结果 | 备注 |
|------|------|------|
| `README.md` 可读取 | [ ] pass / [ ] fail |  |
| `prd-workflow.md` 可读取 | [ ] pass / [ ] fail |  |
| `generic-workflow.md` 可读取 | [ ] pass / [ ] fail |  |
| `context-governance.md` 可读取 | [ ] pass / [ ] fail |  |
| `workflow-evolution-policy.md` 可读取 | [ ] pass / [ ] fail |  |
| `.cursor/rules/prd-workflow.mdc` 可读取（本仓库 PRD Runtime） | [ ] pass / [ ] fail |  |
| `generic-workflow` 技能可用 | [ ] pass / [ ] fail |  |
| `context-governance` 技能可用 | [ ] pass / [ ] fail |  |
| `risky-change-gate` 技能可用 | [ ] pass / [ ] fail |  |
| `active-workstreams.md` 已初始化 | [ ] pass / [ ] fail |  |
| `artifact-index.md` 已初始化 | [ ] pass / [ ] fail |  |
| `decision-log.md` 已初始化 | [ ] pass / [ ] fail |  |
| 高风险场景已设为 shadow/no-op | [ ] pass / [ ] fail |  |

---

## 2. 场景执行记录模板

以下模板每个场景复制一份。

### 场景信息

- 场景 ID：
- 执行日期：
- 执行人：
- 任务类型：
- 风险等级：

### 输入

- 原始任务：
- 前置上下文：

### 预期

- 预期首跳：
- 预期是否 Load：
- 预期是否 Write-back：
- 预期是否触发 gate：

### 实际观察

| 检查项 | 结果 | 证据 |
|------|------|------|
| 首跳 flow 正确 | [ ] pass / [ ] fail |  |
| `task_type` 正确 | [ ] pass / [ ] fail |  |
| Phase 0 完整 | [ ] pass / [ ] fail |  |
| 已执行 Load | [ ] pass / [ ] fail |  |
| Phase 1 证据充分 | [ ] pass / [ ] fail |  |
| Phase 2 方案强度匹配 | [ ] pass / [ ] fail |  |
| Phase 3 执行节奏正确 | [ ] pass / [ ] fail |  |
| Phase 4 验证完整 | [ ] pass / [ ] fail |  |
| 已执行 Write-back | [ ] pass / [ ] fail |  |
| 高风险门禁行为正确 | [ ] N/A / [ ] pass / [ ] fail |  |

### 结论

- 当前结果：`pass / fail / blocked`
- 失败归因：
- 缺陷描述：
- 修订建议：

### 回写动作

| 文件 | 是否应更新 | 实际结果 | 备注 |
|------|-----------|----------|------|
| `active-workstreams.md` | [ ] yes / [ ] no |  |  |
| `artifact-index.md` | [ ] yes / [ ] no |  |  |
| `decision-log.md` | [ ] yes / [ ] no |  |  |

---

## 3. 本轮场景清单

| 场景 ID | 名称 | 状态 | 备注 |
|--------|------|------|------|
| DR-01 | PRD 单流程闭环 | [ ] pending / [ ] running / [ ] pass / [ ] fail / [ ] blocked |  |
| DR-02 | Generic 单流程闭环 | [ ] pending / [ ] running / [ ] pass / [ ] fail / [ ] blocked |  |
| DR-03 | 跨流程切换 | [ ] pending / [ ] running / [ ] pass / [ ] fail / [ ] blocked |  |
| DR-04 | 上下文恢复 | [ ] pending / [ ] running / [ ] pass / [ ] fail / [ ] blocked |  |
| DR-05 | 高风险门禁 | [ ] pending / [ ] running / [ ] pass / [ ] fail / [ ] blocked |  |

---

## 4. 收口检查

整轮结束后统一核对：

| 项目 | 结果 | 备注 |
|------|------|------|
| 5 个场景均已执行或明确 blocked | [ ] pass / [ ] fail |  |
| 所有 fail 都已归因 | [ ] pass / [ ] fail |  |
| 所有 blocked 都有前置条件 | [ ] pass / [ ] fail |  |
| 高风险场景 0 个漏拦截 | [ ] pass / [ ] fail |  |
| 至少 1 个上下文恢复成功 | [ ] pass / [ ] fail |  |
| 跨流程场景无历史上下文粘连 | [ ] pass / [ ] fail |  |
| 应回写文件均已回写 | [ ] pass / [ ] fail |  |
| 已形成 dry run 结论与后续修订建议 | [ ] pass / [ ] fail |  |
