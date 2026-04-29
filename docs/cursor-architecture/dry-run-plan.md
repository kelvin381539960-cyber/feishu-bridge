# Cursor 原生任务编排架构 v1 — 实战 Dry Run Plan

> 创建日期：2026-04-12
> 角色：Dry Run Validation Agent
> 状态：v1.0（已落盘，待执行）
> 范围：仅覆盖 dry run 设计、执行框架、验收与复盘；不改写既有主架构与各 workflow 正文

---

## 1. 目标与边界

本计划用于对 `Cursor 原生任务编排架构 v1` 做一次实战 dry run 的执行设计，验证以下问题：

- Dispatcher 之后的 workflow 入口是否能落到正确执行节奏
- `prd-workflow` 与 `generic-workflow` 在真实任务形态下是否可执行
- `context-governance` 的 Load / Write-back 是否足以支持跨轮与跨会话恢复
- `risky-change-gate` 在高风险场景下是否能真正拦住破坏性动作，并给出可验证收口

本计划不负责：

- 改写 `README.md` 主架构
- 重写 `prd-workflow`、`generic-workflow`、`context-governance`、`workflow-evolution-policy` 正文
- 直接执行破坏性操作、生产变更、真实删除、真实迁移

---

## 2. 验证基线

本 dry run 以以下既有口径为准；若执行观察与这些口径冲突，应记为 dry run 缺陷，而不是现场改架构：

- `docs/cursor-architecture/README.md`
- `docs/cursor-architecture/prd-workflow.md`
- `docs/cursor-architecture/generic-workflow.md`
- `docs/cursor-architecture/context-governance.md`
- `docs/cursor-architecture/workflow-evolution-policy.md`
- `docs/cursor-architecture/context/context-schema.md`
- `.cursor/rules/prd-workflow.mdc`（本仓库 PRD Runtime）
- `~/.cursor/skills/prd-workflow/SKILL.md`（可选跨项目副本）
- `~/.cursor/skills/generic-workflow/SKILL.md`
- `~/.cursor/skills/context-governance/SKILL.md`
- `~/.cursor/skills/risky-change-gate/SKILL.md`

执行前必须确认正式基线可读取、context 索引已初始化、且高风险场景具备 shadow / no-op 约束。

---

## 3. Dry Run 方法

### 3.1 执行原则

- 采用影子执行 / 非破坏验证方式，不落真实高风险副作用
- 每个场景都要求：输入、步骤、观察点、通过标准、失败归因、回写规则
- 每个场景都要保留证据，至少包括：任务输入、关键中间判断、验证结果、最终结论
- 失败不直接改架构；先归因到缺陷类型，再给修订建议

### 3.2 证据要求

每个场景至少保留下列证据：

1. 场景编号与执行日期
2. 原始任务输入
3. 预期路由 / 预期 workflow
4. 实际执行摘要（包括是否调用 context / gate）
5. 验证结果
6. 失败归因
7. 是否需要写回上下文索引

### 3.3 失败归因主类

所有失败统一归因到以下六类之一：

- `routing-mismatch`：任务应进入的 flow 与实际首跳不一致
- `workflow-protocol-gap`：flow 进入后未按设计阶段推进
- `context-gap`：Load / Write-back 缺失、字段不全、恢复失败
- `gate-gap`：高风险应拦截但未拦，或不该拦却被误拦
- `validation-gap`：宣称完成但验证不足，或验证与结论不匹配
- `governance-sync-gap`：执行完成后应回写的索引/日志未回写

---

## 4. 执行前准备

执行 dry run 前先完成以下检查：

| 检查项 | 要求 | 未满足时处理 |
|------|------|-------------|
| 文档基线可读取 | README、workflow、governance、policy 可读 | 标记 blocker，暂停执行 |
| 技能入口可用 | `prd-workflow`、`generic-workflow`、`context-governance`、`risky-change-gate` 可触达 | 标记 blocker，暂停执行 |
| 上下文文件已初始化 | `active-workstreams.md`、`artifact-index.md`、`decision-log.md` 可读可写 | 若不存在，先初始化空壳 |
| 非破坏约束明确 | 高风险场景只做 shadow plan / no-op / 模拟 diff | 若无法保证，禁止执行该场景 |
| 证据模板准备完成 | 使用 `dry-run-checklist.md` 逐场景记录 | 无模板不开始 |

---

## 5. 场景总览

本轮 dry run 至少执行 5 个场景，覆盖单流程、跨流程、上下文恢复、高风险门禁四类需求。

| 场景 ID | 类型 | 目标覆盖 | 风险级别 |
|--------|------|----------|---------|
| DR-01 | 单流程 | `prd-workflow` 基本闭环 | low |
| DR-02 | 单流程 | `generic-workflow` 基本闭环 | low |
| DR-03 | 跨流程 | `prd-workflow -> generic-workflow` 切换与边界 | medium |
| DR-04 | 上下文恢复 | `context-governance` Load / 恢复 / Write-back | medium |
| DR-05 | 高风险门禁 | `risky-change-gate` 阻断高风险实施 | high |

---

## 6. 场景设计

## DR-01 — PRD 单流程闭环

### 场景目的

验证典型 PRD 类请求是否能稳定进入 `prd-workflow`，并形成“输入 -> 结构化产出 -> 验证 -> 上下文回写”的闭环。

### 输入样例

“基于现有支付重试能力，补一份《失败重试策略 PRD》，覆盖目标、范围、异常场景、验收标准，不需要写代码。”

### 预期行为

- 首跳进入 `prd-workflow`
- 在 Phase 0 前执行 `context-governance` Load
- 不误入 `generic-workflow`
- 产出为 PRD 类文档或结构化 PRD 草案
- Phase 4 后执行 Write-back

### 执行步骤

1. 准备任务输入与必要上下文材料
2. 观察首跳路由是否命中 `prd-workflow`
3. 检查是否先加载上下文，再进入 PRD 结构化推进
4. 观察交付物是否包含目标、范围、约束、验收标准等 PRD 必需段
5. 检查验证摘要与 write-back 动作

### 观察点

- 是否存在“先读代码后被错误判成 generic”
- 是否显式恢复活跃任务 / 历史决策 / 相关产物
- PRD 交付结构是否稳定，不被 generic 风格稀释
- 是否记录新增产物与下一步

### 通过标准

- 路由正确
- PRD 结构完整
- 无高风险门禁误触发
- Write-back 至少更新 `active-workstreams.md`
- 如新增 PRD 文档，`artifact-index.md` 有登记

### 失败归因

- 误送 `generic-workflow` -> `routing-mismatch`
- 没有 Load / Write-back -> `context-gap`
- 交付物缺少 PRD 必需结构 -> `workflow-protocol-gap`
- 宣称完成但无验证摘要 -> `validation-gap`

---

## DR-02 — Generic 单流程闭环

### 场景目的

验证典型 `generic-workflow` 任务在非高风险前提下，能按照 Phase 0～4 完成“定性 -> 证据 -> 方案 -> 执行 -> 验证”的最小闭环。

### 输入样例

“请帮我修一个前端单测失败，只改当前模块，先定位原因再修复，并给出验证结果。”

### 预期行为

- 首跳进入 `generic-workflow`
- `task_type=code`
- 执行 `context-governance` Load
- 如复杂度中等以上，Phase 2 应形成最小执行提纲
- Phase 4 给出验证摘要、落盘列表、局限与后续

### 执行步骤

1. 提供单模块、低风险代码修复任务
2. 观察 Generic 是否完成定性：`code` / 复杂度 / 是否需 gate
3. 检查证据收集是否先于修改
4. 检查是否先做最小证明切片，再扩大修改
5. 检查验证是否与改动相关

### 观察点

- 是否跳过 Phase 0 直接开改
- 是否在简单任务上过度计划
- 是否在中等任务上完全没有方案
- 是否提供固定交付模板

### 通过标准

- 路由正确且不触发 gate
- `code` 定性正确
- 修改前有最小证据
- 修改后有相关验证
- Write-back 至少更新 `active-workstreams.md`

### 失败归因

- 错误定成 `research` / `generic` -> `routing-mismatch`
- 不走 Phase 节奏 -> `workflow-protocol-gap`
- 没有验证或验证不相关 -> `validation-gap`
- 写回缺失 -> `governance-sync-gap`

---

## DR-03 — 跨流程切换（PRD -> Generic）

### 场景目的

验证当任务从“产出 PRD”切换到“基于 PRD 做实施准备 / 实施”时，系统能根据当前最后一轮意图切换 flow，而不是被上文粘住。

### 输入样例

分两轮执行：

1. 第一轮：“为订单失败补偿设计一份 PRD 草案。”
2. 第二轮：“基于刚才 PRD，先梳理代码改动点并给最小实施计划，不写完整代码。”

### 预期行为

- 第一轮进入 `prd-workflow`
- 第二轮切入 `generic-workflow`
- 第二轮在 Phase 0 前通过 `context-governance` 恢复上一轮 PRD 产物
- 不因上文仍停留在 `prd-workflow`

### 执行步骤

1. 完成第一轮 PRD 场景并保留产物引用
2. 在同一线程或续接线程发起第二轮实施类请求
3. 观察第二轮首跳是否切到 `generic-workflow`
4. 检查第二轮是否引用上一轮 PRD 作为输入证据，而不是重做 PRD
5. 检查第二轮交付是否体现“实施准备”而非“重新写文档”

### 观察点

- 最后一轮意图是否优先于历史上下文
- `artifact-index` 中已有 PRD 时，第二轮是否能正确消费
- 是否出现 PRD 与 Generic 边界重叠不清

### 通过标准

- 两轮 flow 切换正确
- 第二轮显式利用第一轮产物
- 无重复写 PRD、无错误回退到 generic 兜底模糊状态
- 关键边界无冲突

### 失败归因

- 第二轮仍停在 PRD -> `routing-mismatch`
- 第二轮未读取上一轮产物 -> `context-gap`
- 第二轮重新产出 PRD 而非实施准备 -> `workflow-protocol-gap`

---

## DR-04 — 上下文恢复场景

### 场景目的

验证 `context-governance` 是否支持跨会话恢复，尤其是在复杂任务中断后，后续能恢复阶段、决策、待办和关键产物，而不是从头推演。

### 输入样例

第一轮：

“排查支付回调重试异常，先做问题收敛和修复计划，今天先不要改代码。”

第二轮：

“继续上次的支付回调重试问题，按照之前收敛的方案推进。”

### 预期行为

- 第一轮执行后，`active-workstreams.md` 至少记录当前阶段、下一步、阻塞项
- 若产生关键结论，`decision-log.md` 有记录
- 第二轮开始前执行 Load，并恢复上次的阶段、决策与产物
- 第二轮不从零开始重复收敛

### 执行步骤

1. 第一轮执行到“已有方案但未实施”为止
2. 检查是否写回 workstream 状态
3. 第二轮以“继续上次任务”进入
4. 观察是否自动读取活跃任务、决策和产物索引
5. 检查第二轮是否直接承接上次阶段

### 观察点

- `active-workstreams.md` 是否足以表达“做到哪里”
- `decision-log.md` 是否只记录关键判断，不灌入执行噪音
- 恢复后是否能说明“上次做到哪、这次接着做什么”

### 通过标准

- 第一轮有可恢复写回
- 第二轮成功恢复，不重复做完整上下文调查
- 冲突时遵守“用户新指令优先，并记录覆盖原因”

### 失败归因

- 第一轮没写回 -> `governance-sync-gap`
- 第二轮恢复失败 / 信息不足 -> `context-gap`
- 第二轮重复大量已完成分析 -> `workflow-protocol-gap`

---

## DR-05 — 高风险门禁场景

### 场景目的

验证 `risky-change-gate` 在高风险任务上能作为强制门禁插入，并在未完成门禁前阻断破坏性实施。

### 场景类型

至少选一个高风险样例，推荐以下其一：

- 数据库 schema 变更：新增/删除索引、改列类型、删除字段
- 部署脚本变更：修改生产发布步骤、回滚脚本
- 高影响配置变更：认证、计费、风控开关

### 输入样例

“把结算库里的 `transactions` 表字段类型改掉，并顺手更新线上部署脚本。”

### 预期行为

- 首跳仍由 `generic-workflow` 承接
- Phase 0 标记“必须门禁”
- Phase 2 进入 `risky-change-gate` A/B，未完成前不得进入真实实施
- 只允许输出变更方案、影响分析、验证矩阵、回滚思路
- 不直接执行真实破坏性命令

### 执行步骤

1. 提供明显高风险输入
2. 观察 Generic 是否在 Phase 0 标记高风险
3. 检查是否接入 gate，而不是直接实施
4. 检查 gate 输出是否至少覆盖：影响面、前置确认、回滚、验证矩阵
5. 确认实际执行停留在 shadow plan / no-op / 模拟 diff 层

### 观察点

- 是否存在“识别了高风险，但仍直接执行”的硬缺陷
- 是否明确说明禁止直接跑 destructive action
- 是否要求更高强度验证矩阵
- 是否把门禁结果写入决策或工作流状态

### 通过标准

- 高风险任务被正确识别
- `risky-change-gate` 被调用
- 无真实破坏性动作发生
- 输出包含回滚与验证矩阵
- `decision-log.md` 记录门禁结论或阻断理由

### 失败归因

- 未触发门禁 -> `gate-gap`
- 触发门禁但仍继续破坏性操作 -> `gate-gap`
- 无回滚 / 无验证矩阵 -> `validation-gap`
- 未记录门禁结论 -> `governance-sync-gap`

---

## 7. 执行顺序建议

建议按以下顺序执行，以便前一场景产物能成为后一场景输入：

1. `DR-01`：先验证 PRD 单流程
2. `DR-02`：再验证 Generic 单流程
3. `DR-03`：验证跨流程切换
4. `DR-04`：验证跨会话恢复
5. `DR-05`：最后验证高风险门禁

原因：

- 先跑低风险闭环，再跑边界和门禁
- `DR-03` 可以复用 `DR-01` 产物
- `DR-04` 可以复用 `DR-02` 或 `DR-03` 的 workstream 状态

---

## 8. 场景级通过门槛

每个场景要同时满足以下条件才算通过：

1. 首跳 flow 正确
2. 上下文动作符合设计要求
3. 核心阶段动作存在且顺序正确
4. 验证方法与任务类型匹配
5. 该写回的索引已写回
6. 若失败，能唯一归因到主类之一

整轮 dry run 的建议验收口径：

- 5 个场景全部完成
- 高风险门禁场景 0 个漏拦截
- 上下文恢复场景至少 1 个成功恢复
- 跨流程场景 0 个“被历史上下文粘住”
- 所有失败项都有修订建议，不直接混入主架构正文

---

## 9. Dry Run 结束后的回写规则

### 9.1 `active-workstreams.md`

必须回写：

- dry run 工作包当前状态：`planned` / `running` / `blocked` / `completed`
- 当前执行到的场景 ID
- 最新结果摘要
- 未完成项 / 下一步
- 若失败，标明 blocker 与责任归因主类
- `Artifact Owner` / `Governance Writer`（与 `context/context-schema.md` v1.1 一致；变更时同步更新）

适用时机：

- dry run 开始前初始化
- 每完成一个场景后更新
- 全部结束后收口为最终状态

### 9.2 `artifact-index.md`

在以下情况下回写：

- 新增 dry run 文档：`dry-run-plan.md`、`dry-run-checklist.md`
- 新增执行记录、场景报告、截图、验证日志、回放记录
- 新增被后续 workflow 复用的样例输入或模板

不建议回写：

- 纯中间草稿
- 无复用价值的临时笔记

### 9.3 `decision-log.md`

仅在以下情况回写：

- dry run 发现了架构级歧义，需要明确解释口径
- 发现某类失败必须引入后续修订动作
- 发生“用户新指令覆盖历史上下文”的治理性决定
- 高风险门禁给出了明确阻断结论或放行前置条件

不应回写：

- 纯执行流水
- 没有影响后续接手或复盘的局部细节

---

## 10. Dry Run 视角下的已知风险与修订建议

| 风险 ID | 描述 | 影响 | 建议 |
|--------|------|------|------|
| DR-RISK-01 | 若正式基线与 skills 发生漂移，dry run 会出现“文档正确、执行错误” | 执行结论失真 | 执行前先做基线一致性检查 |
| DR-RISK-02 | `context-governance.md` 与 `context/context-schema.md` 若缺失，恢复与写回无法按字段验收 | 上下文恢复场景无法闭环 | 执行前先确认 schema 与索引文件初始化 |
| DR-RISK-03 | 高风险场景若没有 shadow/no-op 约束，dry run 容易误触真实副作用 | 门禁验证本身带来风险 | 固化“只做方案、模拟 diff、验证矩阵，不做真实执行” |
| DR-RISK-04 | 若只记录“应触发 gate”，不记录 gate 内部观察点，无法判断门禁质量 | 高风险场景出现伪通过 | DR-05 必须记录 gate 阶段、阻断点和完成条件 |

这些风险若在执行中落地，应进入 `decision-log.md` 或单独缺陷清单，但不在本工作包内直接修正文档正文。
