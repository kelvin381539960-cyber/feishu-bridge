# Architecture Validation Report

> Agent 1（Routing QA）交付物。  
> 目标：记录派发层路由验收的执行轮次、发现的问题、偏差归因与收敛结论。  
> 范围：仅覆盖**入口定向规则集合**（以 `task-dispatcher.mdc` 为 PRD 绑定规范，若工作区未部署则以 `README.md` §3.1 + `SKILL.md` 等价约束为准）与其直接关联的 workflow 入口一致性，不覆盖 workflow 内部 Phase 深度验收。

## 1. 当前结论

- 当前架构文档（含 README §3.1）、`task-dispatcher.mdc`（若启用）、**本仓库** `.cursor/rules/prd-workflow.mdc`（及可选 `prd-workflow/SKILL.md`）、`generic-workflow/SKILL.md` 在**路由定义层**保持一致
- Agent 1 的工作已从“测试设计”推进到“测试执行 + 多轮回归”
- 已补齐四份基础资产：
  - `routing-fixtures.md`
  - `routing-conversation-fixtures.md`
  - `e2e-test-matrix.md`
  - `architecture-validation-report.md`
- R1 已完成 30 条单轮样本回放
- R2 已完成 12 条多轮对话回归
- 当前未发现系统性误路由或明显上下文污染

## 2. 验证范围

- `docs/cursor-architecture/README.md`
- `~/.cursor/rules/task-dispatcher.mdc`
- `.cursor/rules/prd-workflow.mdc`（本仓库）
- `~/.cursor/skills/prd-workflow/SKILL.md`（可选跨项目副本）
- `~/.cursor/skills/generic-workflow/SKILL.md`

## 3. 验证轮次

| Round | 日期 | 类型 | 范围 | 结果 | 说明 |
|------|------|------|------|------|------|
| R0 | 2026-04-11 | 静态一致性审查 | README / dispatcher / workflow 入口约束 | pass | 文档层路由定义一致，无明显冲突 |
| R1 | 2026-04-12 | 端到端回放 | `routing-fixtures.md` 全量 30 条样本 | pass | 首跳分类与目标均符合预期；通过率 100% |
| R2 | 2026-04-12 | 多轮对话回归 | `routing-conversation-fixtures.md` 全量 12 条样本 | pass | 多轮上下文未污染最后一轮意图；通过率 100% |

## 3.1 R1 执行方法

- 回放对象：`routing-fixtures.md` 的 30 条样本
- 回放方式：逐条单轮执行，记录首跳 `task_type` 与首跳目标
- 判定依据：`README.md`（§3.1）、`task-dispatcher.mdc`、`.cursor/rules/prd-workflow.mdc`（及可选 `prd-workflow/SKILL.md`）、`generic-workflow/SKILL.md`
- 本轮只校验路由与入口一致性，不校验 workflow 内部 Phase 产物

## 3.2 R1 统计摘要

| 指标 | 结果 |
|------|------|
| 总样本数 | 30 |
| 通过数 | 30 |
| 失败数 | 0 |
| 总通过率 | 100% |
| core 样本通过率 | 20 / 20 = 100% |
| edge 样本通过率 | 10 / 10 = 100% |
| `quick_answer` 误送 workflow | 0 |
| `prd` 误送 `generic-workflow` | 0 |
| `code` 误送 `quick_answer` | 0 |

## 3.3 R2 执行方法

- 回放对象：`routing-conversation-fixtures.md` 的 12 条多轮样本
- 回放方式：保留前文上下文，只以最后一轮用户请求作为首跳分类判定对象
- 判定重点：验证上下文不会污染最新用户意图
- 本轮仍不校验 workflow 内部 Phase 产物

## 3.4 R2 统计摘要

| 指标 | 结果 |
|------|------|
| 总样本数 | 12 |
| 通过数 | 12 |
| 失败数 | 0 |
| 总通过率 | 100% |
| `context-heavy -> quick_answer` 误送 workflow | 0 |
| `prd -> generic` 漂移错误 | 0 |
| `research -> code` 切换错误 | 0 |

## 4. R0 静态一致性审查记录

### 4.1 已确认一致

- 入口定向规则（含 `task-dispatcher.mdc`）只负责分类与派发，不负责风险判断和模式切换
- `prd` 命中 `prd-workflow`
- `quick_answer` 直接回答，不进入 skill
- `code` / `research` / `generic` 全部命中 `generic-workflow`
- `generic-workflow` 明确承认自己接收 `task_type ∈ {code, research, generic}`
- `generic-workflow` 明确要求 workflow 类任务在 Phase 0 前读取 `context-governance`

### 4.2 当前未在静态审查中闭环的项

- 低置信度混合任务是否稳定落到 `generic`
- `quick_answer` 是否会被对话上下文污染而误送入 workflow
- 高风险 `code` 样本在真实会话中是否能稳定进入 `risky-change-gate`
- `prd` 任务在“先读代码再写文档”场景下是否会被误送到 `generic`

## 5. R1 回放结果

### 5.1 已验证闭环

- 低置信与模糊样本 `GEN-05` 稳定落到 `generic`
- `quick_answer` 五条样本均直接回答，未进入 workflow
- `PRD-05` 在“先读代码再写文档”场景下仍命中 `prd-workflow`
- `CODE-05`、`CODE-08` 保持 `code -> generic-workflow` 路由，且门禁应触发标记明确

### 5.2 本轮未发现的失败类型

- 分类错误：0
- 目标错误：0
- 入口协议错误：0
- 规则冲突：0

## 6. R2 多轮回归结果

### 6.1 已验证闭环

- 长上下文中的 `quick_answer` 请求未被误送入 workflow
- `code -> prd`、`prd -> generic`、`research -> code`、`prd -> code` 等漂移场景均按最后一轮意图切换正确
- generic 混合场景在多轮对话下仍保持兜底，不被历史上下文硬拉到某一专类

### 6.2 本轮未发现的失败类型

- 上下文污染：0
- 边界漂移误判：0
- 目标 flow 错配：0

## 7. 已知风险

| 风险 ID | 描述 | 等级 | 影响 | 缓解动作 |
|---------|------|------|------|----------|
| RISK-01 | `quick_answer` 与 `research` 的边界仍高度依赖用户表述，极端含混表达仍可能引发解释空间 | low | 边界样本可能回落到 `generic` | 后续若出现误路由，先补 fixture 再修规则 |
| RISK-02 | 高风险 `code` 样本当前只验证“应触发 gate”，未验证 gate 内部执行质量 | medium | 门禁入口对了，但门禁深度仍需其他工作包验收 | 本 Agent 明确不扩展到 gate 深度执行 |
| RISK-03 | 本轮未覆盖跨天会话续接与外部工具副作用对分类的影响 | low | 极端场景下可能需要补更多会话 fixture | 若后续出现案例，再新增 conversation fixture |

## 8. Agent 1 范围内的下一步动作

1. 若后续入口定向规则或 workflow 边界发生变更，重跑：
   - `routing-fixtures.md`
   - `routing-conversation-fixtures.md`
2. 新增专 flow 时，只扩展 fixtures 与 matrix，不直接改其他 agent 的文档
3. 若出现误路由缺陷，先新增样本，再进入规则修订建议流程

## 9. 关闭条件

本工作包在满足以下条件后可视为完成：

- `e2e-test-matrix.md` 全量样本都有实际结果
- 核心高置信样本通过率 100%
- 所有失败样本都已归因
- 若发生规则冲突，已形成单独修订建议，不在本报告内直接改架构

## 10. 当前状态

- Agent 1 状态：**可关闭**
- 完成度：Routing QA 设计、单轮回放、多轮对话回归均已完成
- 边界说明：本 Agent 不负责 `artifact-index` 收口，也不负责 `workflow-evolution-policy.md`
