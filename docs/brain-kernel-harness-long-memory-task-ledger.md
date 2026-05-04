# Brain Kernel + Harness + Long Memory 任务台账

## 任务基本信息

| 字段 | 内容 |
|---|---|
| Task ID | T-BRAIN-20260504 |
| 任务 | 在 feishu-bridge 仓库中落地 Brain Kernel + Harness + Long Memory 架构，包含代码重构、长期记忆、Harness、插件化、兼容治理与 token 预算控制 |
| 执行角色 | Architect / Tech Implementer / Harness Reviewer / Compatibility Reviewer |
| 输入 | 当前 feishu-bridge 仓库；已确认的 9 分版架构方案；用户确认的全方位代码重构落地范围 |
| 输出 | 架构文档、协议定义、Harness 测试、模块化代码重构、长期记忆模块、token 预算控制、workflow 插件化、compat 治理、迁移记录 |
| 完成标准 | 代码可测试；主链路保持兼容；核心协议有 schema/fixture/test；pipeline-v2 被阶段化瘦身；research/doc-export/memory/output 逐步插件化；长期记忆受 token budget 控制；所有关键改动有 Harness 覆盖 |
| 状态 | Doing |
| 结果回填 | 待执行 |

---

## 执行原则

1. 不做大爆炸式重写，采用 Harness 锁行为后逐步迁移。
2. 每次修改必须能解释对应风险与验证方式。
3. 保持现有飞书链路兼容，避免破坏线上入口。
4. 先建立协议、Harness 和阶段边界，再迁移复杂业务逻辑。
5. 长期记忆必须受 Memory Budget Controller 控制，禁止无界注入上下文。
6. 大内容进入 artifact，摘要进入 prompt，索引进入 memory。
7. 兼容逻辑集中进入 compat，不继续污染主 pipeline。
8. 完成每个阶段后回填台账并等待确认。

---

## 任务拆解

### T-001：现状盘点与目标落地边界确认

状态：Doing
执行角色：Architect
输入：AGENTS.md、pipeline-v2.js、channel-runner.js、openclaw-control-plane、现有 test 目录
输出：现状模块职责图、重构边界、风险点清单
完成标准：明确哪些逻辑先拆、哪些逻辑保留兼容、哪些模块需要 Harness 先行
结果回填：待执行

### T-002：新增架构设计文档

状态：Todo
执行角色：Architect
输入：9 分版 Brain Kernel + Harness + Long Memory 方案
输出：docs/brain-kernel-harness-long-memory-architecture.md
完成标准：包含目标架构、协议草案、模块边界、迁移阶段、token budget、memory 策略、compat 策略、Harness 策略
结果回填：待执行

### T-003：建立核心协议与目录骨架

状态：Todo
执行角色：Tech Implementer
输入：TaskEnvelope、BrainContext、ExecutionPlan、ExecutionResult、MemoryRecord、TokenBudget 草案
输出：lib/brain/context.js、lib/brain/registry.js、lib/brain/kernel.js、lib/memory/* 初始骨架、lib/compat/* 初始骨架
完成标准：不改变现有运行链路；新增模块可被单测加载；CommonJS 风格；无 TypeScript
结果回填：待执行

### T-004：建立 Contract Harness

状态：Todo
执行角色：Harness Reviewer
输入：核心协议模块
输出：test/brain-contracts.test.js、fixtures 初始样例
完成标准：协议 required fields、默认值、兼容输入、无效输入均有测试
结果回填：待执行

### T-005：建立 Replay Harness 与 Fake Adapter

状态：Todo
执行角色：Harness Reviewer
输入：现有 feishu-im-parse、pipeline-v2、测试 fixtures
输出：test/brain-replay-harness.test.js、fake channel/executor/memory/doc-export adapter
完成标准：飞书文本、prefix miss、direct mode、group @bot、merge_forward、relay-like task 至少有基础 replay case
结果回填：待执行

### T-006：阶段化瘦身 pipeline-v2 第一阶段

状态：Todo
执行角色：Tech Implementer
输入：pipeline-v2.js
输出：sensory / attention / cognition / memory / planning / execution / output / feedback 阶段文件雏形
完成标准：行为不变；npm test 通过；现有入口不变
结果回填：待执行

### T-007：Memory Router + Memory Budget Controller

状态：Todo
执行角色：Tech Implementer
输入：现有 feishu-session-memory、default-memory-provider、长期记忆方案
输出：lib/memory/memory-router.js、memory-budget-controller.js、memory-scoring.js、memory-summarizer.js
完成标准：支持 session/user/project/workflow/artifact/negative memory 分层；支持 maxTokens/maxRecords；不会无界注入
结果回填：待执行

### T-008：Memory Harness 与 Token Budget Harness

状态：Todo
执行角色：Harness Reviewer
输入：Memory Router、Budget Controller
输出：test/memory-budget-controller.test.js、test/memory-router.test.js
完成标准：长会话不爆 token；低相关记忆被省略；project/session 隔离；negative memory 优先级可覆盖普通记忆
结果回填：待执行

### T-009：Research Workflow 插件化迁移

状态：Todo
执行角色：Tech Implementer
输入：research-workflow-state、research-workflow-runner、conversation-reset、failed snapshot 逻辑
输出：lib/workflows/research/*
完成标准：clarify/execute/finalize 状态机从 pipeline 主体迁出；replay/harness 覆盖 clarify→execute、继续澄清、结束任务、fresh reset、失败 snapshot
结果回填：待执行

### T-010：Doc Export 输出插件化

状态：Todo
执行角色：Tech Implementer
输入：feishu-docx-export、result-policy、long reply export 逻辑
输出：lib/brain/output/doc-export-output.js 或 lib/workflows/doc-export/*
完成标准：clarify 阶段不导出；长回复触发导出；导出失败不影响主回复；Harness 覆盖飞书输出限制
结果回填：待执行

### T-011：Compat Adapter 集中治理

状态：Todo
执行角色：Compatibility Reviewer
输入：legacy-bridge/plugin-native/session/idempotency 现有逻辑
输出：lib/compat/legacy-bridge-adapter.js、plugin-native-adapter.js、session-adapter.js、idempotency-adapter.js
完成标准：主链路只读取统一 compat 输出；每个兼容分支有 removeWhen/tests 标注
结果回填：待执行

### T-012：统一 Planning：prePlan + finalPlan

状态：Todo
执行角色：Tech Implementer
输入：pipeline-v2 中多次 planOpenclawExecution 调用
输出：统一 planning stage
完成标准：减少重复 planning；prePlan 只产出 session/workflow/memory hint；finalPlan 是唯一执行依据
结果回填：待执行

### T-013：全量回归与收口

状态：Todo
执行角色：Harness Reviewer / Compatibility Reviewer
输入：所有改动
输出：测试报告、风险清单、剩余 Gap、下一阶段建议
完成标准：npm test 通过；新增 Harness 通过；关键链路 replay 通过；台账回填完整
结果回填：待执行

---

## 当前 Gap

1. 尚未运行仓库测试，未知现有基线是否全部通过。
2. 尚未读取所有 openclaw-control-plane 与 memory 相关文件，详细拆分点待盘点。
3. 长期记忆的持久化位置未最终确认，初步建议先以文件/本地 store 抽象接口开始，避免绑定实现。
4. 是否允许新增较多测试 fixtures 待执行中根据需要控制。

---

## 关键决策记录

1. 用户确认：任务包含代码重构落地，全方位推进。
2. 用户确认：长期记忆纳入本期实现。
3. 用户确认：任务粒度细化到具体文件/模块级。
4. 用户确认：任务台账放在 GitHub `kelvin381539960-cyber/feishu-bridge`。
5. 用户确认：任务台账路径为 `docs/brain-kernel-harness-long-memory-task-ledger.md`。

---

## 回填记录

### T-001：现状盘点与目标落地边界确认

状态：Doing
执行角色：Architect
输入：AGENTS.md、pipeline-v2.js、channel-runner.js、openclaw-control-plane、现有 test 目录
输出：待执行
结果摘要：待执行
问题 / Gap：待执行
需要确认的决策：暂无
下一步：读取关键目录与文件，形成现状盘点与首批落地边界。
