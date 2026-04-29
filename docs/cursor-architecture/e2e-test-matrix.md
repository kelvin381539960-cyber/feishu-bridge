# E2E Test Matrix

> Agent 1（Routing QA）交付物。  
> 目的：把 `routing-fixtures.md` 转成可执行的验收矩阵，用于验证派发层输出是否与架构定义一致。  
> 当前状态：R1 + R2 已执行。  
> R1 覆盖单轮 30 条样本；R2 覆盖多轮对话污染与边界漂移 12 条样本。两轮结果均已回填。

## 1. 测试目标

- 验证**入口定向规则集合**下的 `task_type` 是否与预期一致（**PRD 主路径关键字与强制顺序** 以工作区已加载的 `~/.cursor/rules/task-dispatcher.mdc` 为规范；若某环境未部署该文件，则以 `README.md` §3.1 与各 `SKILL.md` 中的等价约束为准）
- 验证分类后是否命中正确目标
- 验证 `prd-workflow` / `generic-workflow` 的入口假设是否与上述入口定向规则一致
- 验证 `quick_answer` 是否被错误送入 workflow
- 验证 `context-governance` 与 `risky-change-gate` 的“应触发性”判断是否被记录

## 2. 执行说明

每条样本执行时记录以下证据：

- 实际 `task_type`
- 实际目标
- 是否直接回答
- 是否读取对应 `SKILL.md`
- 对于 `prd` / `code` / `research` / `generic`，是否应进入 workflow
- 对于高风险代码类样本，workflow 内是否应进入 `risky-change-gate`
- 对于所有 workflow 类样本，是否应执行 `context-governance` 的 Load / Write-back

### 2.1 R1 执行方法

- 执行日期：`2026-04-12`
- 执行方式：逐条单轮回放 `routing-fixtures.md` 的 30 条样本，以当前架构约束为准，记录**首跳分类与目标**
- 验收边界：本轮只验证**派发层输出**与**workflow 入口一致性**
- 不纳入本轮的内容：workflow 内部 Phase 深度执行、文件写入结果、真实外部工具副作用

### 2.2 R2 执行方法

- 执行日期：`2026-04-12`
- 执行方式：逐条回放 `routing-conversation-fixtures.md` 的 12 条多轮样本
- 验收重点：验证前文上下文不会污染**最后一轮用户意图**对应的首跳分类
- 不纳入本轮的内容：workflow 内部 Phase 深度执行、`risky-change-gate` 内部质量、真实文件副作用

## 3. 通过门槛

### 3.1 发布前硬门槛

- `quick_answer` 样本 0 个误送入 workflow
- `prd` 样本 0 个误送入 `generic-workflow`
- `code` 样本 0 个误送入 `quick_answer`
- 核心高置信样本总体通过率 100%
- 边界样本总体通过率不低于 80%

### 3.2 观察指标

- 低置信样本是否稳定落到 `generic`
- 是否出现“分类正确但技能未读”的伪通过
- 是否出现“派发正确但 workflow 入口假设冲突”

## 4. 覆盖矩阵

| Fixture ID | 样本类别 | 预期 `task_type` | 实际 `task_type` | 预期目标 | 實际目标 | 应直接回答 | 应读技能 | 应触发 `context-governance` | 应触发 `risky-change-gate` | 当前结果 | 备注 |
|------------|----------|------------------|----------|------------|----------|-----------------------------|----------------------------|----------|------|
| PRD-01 | core | `prd` | `prd` | `prd-workflow` | `prd-workflow` | no | `prd-workflow` | yes | no | pass | 标准 PRD 路由 |
| PRD-02 | core | `prd` | `prd` | `prd-workflow` | `prd-workflow` | no | `prd-workflow` | yes | no | pass | 标准规格文档路由 |
| PRD-03 | core | `prd` | `prd` | `prd-workflow` | `prd-workflow` | no | `prd-workflow` | yes | no | pass | 产品方案路由 |
| PRD-04 | edge | `prd` | `prd` | `prd-workflow` | `prd-workflow` | no | `prd-workflow` | yes | no | pass | PRFAQ/PRD 边界，仍属 PRD 交付 |
| PRD-05 | edge | `prd` | `prd` | `prd-workflow` | `prd-workflow` | no | `prd-workflow` | yes | no | pass | 代码阅读仅作辅助，不改变交付形态 |
| QA-01 | core | `quick_answer` | `quick_answer` | direct answer | direct answer | yes | none | no | no | pass | 定义问题 |
| QA-02 | core | `quick_answer` | `quick_answer` | direct answer | direct answer | yes | none | no | no | pass | 常见技术解释 |
| QA-03 | core | `quick_answer` | `quick_answer` | direct answer | direct answer | yes | none | no | no | pass | Mermaid 语法解释 |
| QA-04 | core | `quick_answer` | `quick_answer` | direct answer | direct answer | yes | none | no | no | pass | 法规事实问答 |
| QA-05 | edge | `quick_answer` | `quick_answer` | direct answer | direct answer | yes | none | no | no | pass | 错误码解释仍为单轮回答 |
| CODE-01 | core | `code` | `code` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 修测试 |
| CODE-02 | core | `code` | `code` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 实现逻辑 |
| CODE-03 | core | `code` | `code` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 重构 |
| CODE-04 | core | `code` | `code` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 脚本/配置变更 |
| CODE-05 | edge | `code` | `code` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | yes | pass | 部署脚本场景，门禁应触发 |
| CODE-06 | core | `code` | `code` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 调试并修复 |
| CODE-07 | core | `code` | `code` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 伪代码落地 |
| CODE-08 | edge | `code` | `code` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | yes | pass | SQL/索引改动，门禁应触发 |
| RES-01 | core | `research` | `research` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 外部实践调研 |
| RES-02 | core | `research` | `research` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 方案对比 |
| RES-03 | edge | `research` | `research` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 结合当前架构分析，仍以分析为主 |
| RES-04 | core | `research` | `research` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 云产品差异调研 |
| RES-05 | core | `research` | `research` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 路由评测研究 |
| RES-06 | edge | `research` | `research` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 架构对比总结 |
| GEN-01 | edge | `generic` | `generic` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 架构缺口梳理 |
| GEN-02 | edge | `generic` | `generic` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 多 agent 分工 |
| GEN-03 | core | `generic` | `generic` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 先收敛问题 |
| GEN-04 | core | `generic` | `generic` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 项目梳理与优先级 |
| GEN-05 | edge | `generic` | `generic` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 用户刻意模糊，落入兜底 |
| GEN-06 | core | `generic` | `generic` | `generic-workflow` | `generic-workflow` | no | `generic-workflow` | yes | no | pass | 只做拆解与推进顺序 |

## 5. 执行批次建议

### Batch A

- `PRD-01` 到 `PRD-05`
- `QA-01` 到 `QA-05`
- 目的：先验证 `prd` / `quick_answer` 的边界是否稳定

### Batch B

- `CODE-01` 到 `CODE-08`
- 目的：验证 `code` 样本是否统一送入 `generic-workflow`

### Batch C

- `RES-01` 到 `RES-06`
- `GEN-01` 到 `GEN-06`
- 目的：验证 `research` / `generic` 边界与低置信兜底

## 6. 失败归因模板

若某条样本失败，必须归因到以下四类之一：

- 分类错误：`task_type` 本身错误
- 目标错误：`task_type` 正确，但目标 flow 错误
- 入口协议错误：目标正确，但技能入口行为不一致
- 规则冲突：入口定向规则（含 `task-dispatcher.mdc`）与 workflow / README 的定义不一致

每个失败样本都必须回填到 `architecture-validation-report.md`。

## 7. R1 汇总

| 指标 | 结果 |
|------|------|
| 总样本数 | 30 |
| 总通过数 | 30 |
| 总失败数 | 0 |
| 总通过率 | 100% |
| core 样本通过率 | 20 / 20 = 100% |
| edge 样本通过率 | 10 / 10 = 100% |
| `quick_answer` 误送 workflow | 0 |
| `prd` 误送 `generic-workflow` | 0 |
| `code` 误送 `quick_answer` | 0 |

## 8. 本轮结论

- 当前入口定向规则与 workflow 入口约束在 30 条样本上保持一致
- 暂未发现需要系统性修订 `task-dispatcher.mdc`（或 README §3.1 等价表述）的误路由
- R2 已完成多轮对话回归；后续仅在规则变更或新增 workflow 时重新开启

## 9. R2 多轮对话回归矩阵

| Fixture ID | 漂移类型 | 预期 `task_type` | 实际 `task_type` | 预期目标 | 实际目标 | 当前结果 | 备注 |
|------------|----------|------------------|------------------|----------|----------|----------|------|
| CTX-01 | `architecture -> quick_answer` | `quick_answer` | `quick_answer` | direct answer | direct answer | pass | 长上下文未污染单轮解释 |
| CTX-02 | `code -> prd` | `prd` | `prd` | `prd-workflow` | `prd-workflow` | pass | 代码上下文不压过 PRD 意图 |
| CTX-03 | `prd -> generic` | `generic` | `generic` | `generic-workflow` | `generic-workflow` | pass | 明确要求先收敛，正确降级 |
| CTX-04 | `code -> quick_answer` | `quick_answer` | `quick_answer` | direct answer | direct answer | pass | 调试上下文中仍能单轮回答 |
| CTX-05 | `research -> code` | `code` | `code` | `generic-workflow` | `generic-workflow` | pass | 研究上下文正确切回实施任务 |
| CTX-06 | `code -> research` | `research` | `research` | `generic-workflow` | `generic-workflow` | pass | 调试上下文正确切回调研 |
| CTX-07 | `mixed -> generic` | `generic` | `generic` | `generic-workflow` | `generic-workflow` | pass | 刻意模糊时保持兜底 |
| CTX-08 | `code-reading -> prd` | `prd` | `prd` | `prd-workflow` | `prd-workflow` | pass | 读代码后写需求仍属 PRD |
| CTX-09 | `code -> research` | `research` | `research` | `generic-workflow` | `generic-workflow` | pass | 性能优化对比仍属研究 |
| CTX-10 | `high-risk-context -> quick_answer` | `quick_answer` | `quick_answer` | direct answer | direct answer | pass | 高风险背景不污染简单问答 |
| CTX-11 | `generic -> prd` | `prd` | `prd` | `prd-workflow` | `prd-workflow` | pass | generic 收敛后切入规格草案 |
| CTX-12 | `prd -> code` | `code` | `code` | `generic-workflow` | `generic-workflow` | pass | 文档上下文切入实现任务 |

## 10. R2 汇总

| 指标 | 结果 |
|------|------|
| 多轮样本数 | 12 |
| 多轮通过数 | 12 |
| 多轮失败数 | 0 |
| 多轮通过率 | 100% |
| `context-heavy -> quick_answer` 误送 workflow | 0 |
| `prd -> generic` 漂移错误 | 0 |
| `research -> code` 切换错误 | 0 |

## 11. 最终结论

- R1 已覆盖单轮首跳分类一致性
- R2 已覆盖多轮对话污染与边界漂移
- 在 Agent 1 范围内，当前 Routing QA 已达到可关闭状态
