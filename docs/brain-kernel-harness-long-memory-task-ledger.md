# Brain Kernel + Harness + Long Memory 任务台账

## 0. 任务基本信息

| 字段 | 内容 |
|---|---|
| Task ID | T-BRAIN-20260504 |
| 任务 | 在 feishu-bridge 仓库中落地 Brain Kernel + Harness + Long Memory 架构，包含代码重构、长期记忆、Harness、插件化、兼容治理与 token 预算控制 |
| 执行角色 | PM / Architect / Tech Implementer / Harness Reviewer / Compatibility Reviewer |
| 输入 | 当前 feishu-bridge 仓库；已确认的 9 分版架构方案；用户确认的全方位代码重构落地范围 |
| 输出 | 分阶段 WBS 台账、架构文档、协议定义、Harness 测试、模块化代码重构、长期记忆模块、token 预算控制、workflow 插件化、compat 治理、迁移记录 |
| 完成标准 | 代码可测试；主链路保持兼容；核心协议有 schema/fixture/test；pipeline-v2 被阶段化瘦身；research/doc-export/memory/output 逐步插件化；长期记忆受 token budget 控制；所有关键改动有 Harness 覆盖；每阶段均有明确验收与回填 |
| 状态 | Confirming |
| 当前阶段 | P2：目标架构文档与协议冻结 |
| 结果回填 | P1 已通过用户确认；当前进入 P2：目标架构文档与协议冻结 |

---

## 1. 项目治理原则

1. 不做大爆炸式重写，采用 Harness 锁行为后逐步迁移。
2. 每个阶段必须有：目标、范围、具体任务、文件级输出、验收标准、依赖、风险、回填。
3. 每个具体任务必须可独立判断 Done / Blocked / Confirming。
4. 每次修改必须能解释对应风险与验证方式。
5. 保持现有飞书链路兼容，避免破坏线上入口。
6. 先建立协议、Harness 和阶段边界，再迁移复杂业务逻辑。
7. 长期记忆必须受 Memory Budget Controller 控制，禁止无界注入上下文。
8. 大内容进入 artifact，摘要进入 prompt，索引进入 memory。
9. 兼容逻辑集中进入 compat，不继续污染主 pipeline。
10. 完成每个阶段后回填台账并等待用户确认。

---

## 2. 阶段总览

| 阶段 | 名称 | 目标 | 状态 | 主要交付物 |
|---|---|---|---|---|
| P0 | PM 台账重构与项目治理 | 将任务从平铺清单升级为阶段化 WBS，明确每阶段任务、文件、验收和风险 | Done | 本台账新版 |
| P1 | 现状盘点与架构边界 | 盘点现有主链路、模块职责、风险与可迁移边界 | Done | 现状盘点回填、架构边界清单 |
| P2 | 目标架构文档与协议冻结 | 产出 Brain Kernel + Harness + Long Memory 架构文档与核心协议草案 | Doing | `docs/brain-kernel-harness-long-memory-architecture.md` |
| P3 | Harness 基线与 Replay 锁行为 | 建立 Contract / Replay / Fake Adapter 基线，先锁住现有行为 | Todo | contract tests、replay tests、fixtures、fake adapters |
| P4 | Brain Kernel 骨架与阶段化 Pipeline | 新增 brain/kernel/context/registry，并把 pipeline-v2 第一层阶段化 | Todo | `lib/brain/*`、阶段文件、行为保持测试 |
| P5 | Long Memory + Token Budget | 建立长期记忆分层、Memory Router、Budget Controller 和对应 Harness | Todo | `lib/memory/*`、memory tests、token budget tests |
| P6 | Workflow 插件化：Research 优先 | 将 research clarify/execute/finalize 状态机迁出 pipeline 主体 | Todo | `lib/workflows/research/*`、research replay/harness |
| P7 | Output 插件化：Doc Export / Usage / Feishu Limit | 将 doc export、usage footer、输出限制从 pipeline 主体拆出 | Todo | output plugin、Feishu output harness |
| P8 | Compat Adapter 与 Planning 收敛 | 集中治理 legacy/plugin-native/session/idempotency，并统一 prePlan/finalPlan | Todo | `lib/compat/*`、planning stage、compat tests |
| P9 | 全量回归、性能与收口 | 运行全量测试，验证效率、token 预算、兼容与风险关闭 | Todo | 测试报告、风险清单、最终回填 |

---

## 3. 分阶段 WBS

## P0：PM 台账重构与项目治理

### 阶段目标

把原始台账从“任务列表”升级为“项目经理可执行 WBS”，支持后续按阶段推进、验收、回填和风险管理。

### 阶段状态

Done

### 阶段任务

#### P0-T01：重构任务台账结构

| 字段 | 内容 |
|---|---|
| 状态 | Done |
| 执行角色 | PM |
| 输入 | 用户反馈：任务台账不够细，应分阶段，每阶段还有具体任务 |
| 输出 | 本文件阶段化 WBS 结构 |
| 涉及文件 | `docs/brain-kernel-harness-long-memory-task-ledger.md` |
| 完成标准 | 阶段总览、每阶段任务、文件级输出、验收、依赖、风险、回填结构完整 |
| 结果摘要 | 已将台账重构为 P0~P9 阶段，并在每阶段下拆具体任务 |
| 问题 / Gap | 暂无 |
| 下一步 | 进入 P1 现状盘点 |

---

## P1：现状盘点与架构边界

### 阶段目标

明确当前系统每个关键模块的职责、耦合点、风险点和第一批可安全迁移边界，避免盲目重构。

### 阶段状态

Done

### 阶段输入

- `AGENTS.md`
- `feishu-ws-cursor.js`
- `lib/feishu-channel/bridge-host.js`
- `lib/feishu-channel/channel-runner.js`
- `lib/feishu-cursor/pipeline-v2.js`
- `lib/openclaw-control-plane/*`
- `lib/feishu-cursor/memory/*`
- `lib/feishu-session-memory.js`
- `lib/feishu-docx-export.js`
- `test/*.test.js`

### 阶段任务

#### P1-T01：主链路调用链盘点

| 字段 | 内容 |
|---|---|
| 状态 | Done |
| 执行角色 | Architect |
| 输出 | 飞书事件从入口到回复的调用链图 |
| 涉及文件 | `AGENTS.md`、`feishu-ws-cursor.js`、`bridge-host.js`、`channel-runner.js`、`pipeline-v2.js` |
| 完成标准 | 明确每层职责、输入输出、当前不能破坏的兼容点 |
| 依赖 | 无 |
| 风险 | 若入口职责判断错误，后续拆分会破坏线上飞书链路 |
| 验证方式 | 对照现有测试和 AGENTS.md 中核心链路描述 |
| 结果回填 | 见第 6 节 `P1-T01：主链路调用链盘点` 回填 |

#### P1-T02：pipeline-v2 职责切片

| 字段 | 内容 |
|---|---|
| 状态 | Done |
| 执行角色 | Architect |
| 输出 | pipeline-v2 职责拆分表：sensory / attention / cognition / memory / planning / execution / output / feedback |
| 涉及文件 | `lib/feishu-cursor/pipeline-v2.js` |
| 完成标准 | 每段逻辑归属到目标阶段；标记可先拆/暂不拆/需要 Harness 先行 |
| 依赖 | P1-T01 |
| 风险 | pipeline-v2 同时承载状态机与副作用，过早拆分会产生回归 |
| 验证方式 | 形成拆分边界后再进入 P3/P4，不直接改行为 |
| 结果回填 | 见第 6 节 `P1-T02：pipeline-v2 职责切片` 回填 |

#### P1-T03：control-plane 与 planning 现状盘点

| 字段 | 内容 |
|---|---|
| 状态 | Done |
| 执行角色 | Architect |
| 输出 | OpenClaw planning / policy / result 相关模块职责图 |
| 涉及文件 | `lib/openclaw-control-plane/request-planner.js`、`intent-router.js`、`policy-engine.js`、`workflow-execution-policy.js`、`result-policy.js` |
| 完成标准 | 明确哪些决策应保留在 control-plane，哪些从 pipeline 迁出 |
| 依赖 | P1-T02 |
| 风险 | pipeline 与 control-plane 双重决策导致行为不一致 |
| 验证方式 | 标记重复 planning 点，后续 P8 收敛 |
| 结果回填 | 见第 6 节 `P1-T03：control-plane 与 planning 现状盘点` 回填 |

#### P1-T04：memory / research / doc-export 风险盘点

| 字段 | 内容 |
|---|---|
| 状态 | Done |
| 执行角色 | Architect / Harness Reviewer |
| 输出 | 高风险模块清单与 Harness 优先级 |
| 涉及文件 | `feishu-session-memory.js`、`default-memory-provider.js`、`research-workflow-state.js`、`research-workflow-runner.js`、`conversation-reset.js`、`feishu-docx-export.js` |
| 完成标准 | 明确 memory、research、doc export 哪些必须先用 Harness 锁行为 |
| 依赖 | P1-T02 |
| 风险 | 长期记忆、调研状态、文档导出都是高副作用模块 |
| 验证方式 | 产出 P3 fixture 优先级列表 |
| 结果回填 | 见第 6 节 `P1-T04：memory / research / doc-export 风险盘点` 回填 |

### 阶段验收标准

- 有明确现状职责图。
- 有 pipeline-v2 拆分边界。
- 有高风险模块清单。
- 有 P3 Harness 优先级建议。
- 不修改运行代码。

---

## P2：目标架构文档与协议冻结

### 阶段目标

将 Brain Kernel + Harness + Long Memory 方案沉淀为仓库正式架构文档，并冻结第一版核心协议。

### 阶段状态

Doing

### 阶段任务

#### P2-T01：新增正式架构文档

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Architect |
| 输出 | `docs/brain-kernel-harness-long-memory-architecture.md` |
| 涉及文件 | 新增文档 |
| 完成标准 | 包含目标架构、分层职责、模块边界、迁移阶段、风险与回滚策略 |
| 依赖 | P1 全部完成 |
| 风险 | 文档若过抽象，无法指导代码落地 |
| 验证方式 | 与 P1 拆分边界一一对应 |
| 结果回填 | 待执行 |

#### P2-T02：定义核心协议草案

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Architect / Tech Implementer |
| 输出 | TaskEnvelope、BrainContext、ExecutionPlan、ExecutionResult、MemoryRecord、MemoryQuery、MemoryPack、TokenBudget 草案 |
| 涉及文件 | `docs/brain-kernel-harness-long-memory-architecture.md` |
| 完成标准 | 每个协议包含 required fields、optional fields、默认值、兼容策略 |
| 依赖 | P2-T01 |
| 风险 | 协议不稳定会导致后续代码反复调整 |
| 验证方式 | P3 Contract Harness 能按协议落测试 |
| 结果回填 | 待执行 |

#### P2-T03：定义迁移不变量

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Compatibility Reviewer |
| 输出 | 行为不变量清单 |
| 涉及文件 | 架构文档 |
| 完成标准 | 明确 prefix/direct/group @bot/relay/doc export/research clarify 等行为不可回归 |
| 依赖 | P1、P2-T01 |
| 风险 | 没有不变量就无法判断重构是否成功 |
| 验证方式 | 每个不变量映射到 P3/P9 测试 |
| 结果回填 | 待执行 |

### 阶段验收标准

- 架构文档存在且可作为后续开发依据。
- 核心协议有第一版定义。
- 行为不变量清单与 Harness 计划绑定。

---

## P3：Harness 基线与 Replay 锁行为

### 阶段目标

先建立测试和回放护栏，确保后续模块化迁移可验证、可回滚。

### 阶段状态

Todo

### 阶段任务

#### P3-T01：Contract Harness

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Harness Reviewer |
| 输出 | `test/brain-contracts.test.js` |
| 涉及文件 | `lib/brain/context.js`、协议模块或 fixture |
| 完成标准 | 覆盖 required fields、默认值、无效输入、兼容输入 |
| 依赖 | P2-T02 |
| 风险 | 协议无测试会导致插件间字段漂移 |
| 验证方式 | `npm test` 中 contract 测试通过 |
| 结果回填 | 待执行 |

#### P3-T02：Fake Channel Adapter

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Harness Reviewer |
| 输出 | fake send/reply/reaction/download/fetchMessage adapter |
| 涉及文件 | `test/fixtures/*` 或 `test/helpers/*` |
| 完成标准 | 测试不真实调用飞书 API；可捕获发送内容与副作用 |
| 依赖 | P3-T01 |
| 风险 | 测试若触发真实副作用不可接受 |
| 验证方式 | 所有 fake adapter 调用都有内存记录 |
| 结果回填 | 待执行 |

#### P3-T03：Fake Executor / Memory / Doc Export Adapter

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Harness Reviewer |
| 输出 | fake OpenClaw executor、fake memory store、fake doc export hook |
| 涉及文件 | `test/helpers/*` |
| 完成标准 | replay 不调用真实 OpenClaw、不写真实飞书文档、不污染真实 memory |
| 依赖 | P3-T02 |
| 风险 | Harness 误调用外部系统会干扰线上环境 |
| 验证方式 | fake adapter 可配置成功/失败/超长输出 |
| 结果回填 | 待执行 |

#### P3-T04：Replay 基础用例

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Harness Reviewer |
| 输出 | `test/brain-replay-harness.test.js` |
| 涉及场景 | text basic、prefix miss、direct mode、group @bot、merge_forward、relay-like task |
| 完成标准 | 能以 fixture 重放现有关键行为 |
| 依赖 | P3-T02、P3-T03 |
| 风险 | replay 不足会导致 P4 拆分不可控 |
| 验证方式 | `npm test` 通过；关键副作用断言明确 |
| 结果回填 | 待执行 |

### 阶段验收标准

- Contract Harness 存在。
- Fake Adapter 存在。
- Replay Harness 覆盖基础行为。
- 后续 P4 可以在 Harness 保护下开始拆分。

---

## P4：Brain Kernel 骨架与阶段化 Pipeline

### 阶段目标

新增 Brain Kernel 骨架，并把 pipeline-v2 的第一层逻辑按阶段拆出，但保持外部行为不变。

### 阶段状态

Todo

### 阶段任务

#### P4-T01：新增 Brain Context / Registry / Kernel 骨架

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Tech Implementer |
| 输出 | `lib/brain/context.js`、`lib/brain/registry.js`、`lib/brain/kernel.js` |
| 完成标准 | CommonJS；可单测加载；不改变现有入口 |
| 依赖 | P3-T01 |
| 风险 | 过早接入主链路会扩大风险 |
| 验证方式 | Contract test 通过 |
| 结果回填 | 待执行 |

#### P4-T02：新增阶段目录与空实现

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Tech Implementer |
| 输出 | `lib/brain/sensory/*`、`attention/*`、`cognition/*`、`memory/*`、`planning/*`、`execution/*`、`output/*`、`feedback/*` |
| 完成标准 | 每个阶段有明确接口；初始不接管运行链路 |
| 依赖 | P4-T01 |
| 风险 | 目录膨胀但无行为价值 |
| 验证方式 | 所有模块可 require，无副作用 |
| 结果回填 | 待执行 |

#### P4-T03：pipeline-v2 第一层阶段化抽取

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Tech Implementer |
| 输出 | 将 parse/dedup/routing/ack/output 等低风险逻辑逐步抽出阶段文件 |
| 涉及文件 | `pipeline-v2.js`、`lib/brain/*` 或 `lib/feishu-cursor/stages/*` |
| 完成标准 | 外部接口不变；现有测试和 replay 通过 |
| 依赖 | P3、P4-T01、P4-T02 |
| 风险 | pipeline 中状态变量多，抽取容易遗漏上下文 |
| 验证方式 | `npm test` + replay harness |
| 结果回填 | 待执行 |

### 阶段验收标准

- Brain Kernel 骨架存在。
- pipeline-v2 开始变薄但行为不变。
- 所有现有入口保持不变。

---

## P5：Long Memory + Token Budget

### 阶段目标

建立长期记忆与 token 预算控制，让系统“越用越懂你”，但不会因为记忆膨胀导致上下文爆炸。

### 阶段状态

Todo

### 阶段任务

#### P5-T01：MemoryRecord / MemoryQuery / MemoryPack 模块

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Tech Implementer |
| 输出 | `lib/memory/memory-record.js`、`memory-query.js`、`memory-pack.js` |
| 完成标准 | 支持 user/project/workflow/session/artifact/negative scope |
| 依赖 | P2-T02、P3-T01 |
| 风险 | 记忆结构不稳定会导致长期不可维护 |
| 验证方式 | memory contract test |
| 结果回填 | 待执行 |

#### P5-T02：Memory Budget Controller

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Tech Implementer |
| 输出 | `lib/memory/memory-budget-controller.js` |
| 完成标准 | 支持 maxTokens、maxRecords、reserveBudget、按任务类型分配预算 |
| 依赖 | P5-T01 |
| 风险 | token 估算不准会影响执行效率 |
| 验证方式 | `test/memory-budget-controller.test.js` |
| 结果回填 | 待执行 |

#### P5-T03：Memory Scoring / Summarizer

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Tech Implementer |
| 输出 | `lib/memory/memory-scoring.js`、`memory-summarizer.js` |
| 完成标准 | 相关性、优先级、confidence、negative memory 覆盖规则明确 |
| 依赖 | P5-T02 |
| 风险 | 低质量记忆注入会污染模型判断 |
| 验证方式 | memory-router test 覆盖排序与裁剪 |
| 结果回填 | 待执行 |

#### P5-T04：Memory Router

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Tech Implementer |
| 输出 | `lib/memory/memory-router.js` |
| 完成标准 | 根据 user/project/workflow/taskType 查询、筛选、预算裁剪并输出 MemoryPack |
| 依赖 | P5-T01~T03 |
| 风险 | 不同 chat/session/project 串记忆 |
| 验证方式 | `test/memory-router.test.js` |
| 结果回填 | 待执行 |

#### P5-T05：Memory Harness / Token Budget Harness

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Harness Reviewer |
| 输出 | `test/memory-budget-controller.test.js`、`test/memory-router.test.js` |
| 完成标准 | 长会话不爆 token；低相关记忆被省略；negative memory 优先；project/session 隔离 |
| 依赖 | P5-T02~T04 |
| 风险 | 无 Harness 会导致长期记忆变成不可控上下文堆积 |
| 验证方式 | `npm test` |
| 结果回填 | 待执行 |

### 阶段验收标准

- 长期记忆模块存在。
- 注入必须经过预算控制。
- 长会话和大内容不会无界进入 prompt。

---

## P6：Workflow 插件化：Research 优先

### 阶段目标

将 research workflow 从 pipeline-v2 主体迁移到独立 workflow plugin，降低主链路复杂度。

### 阶段状态

Todo

### 阶段任务

#### P6-T01：Research Workflow 状态机抽象

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Tech Implementer |
| 输出 | `lib/workflows/research/state-machine.js` |
| 涉及文件 | `research-workflow-state.js`、`conversation-reset.js` |
| 完成标准 | clarify / execute / finalize / end / fresh reset 状态清晰 |
| 依赖 | P3 replay harness |
| 风险 | research 是当前最高风险业务流程之一 |
| 验证方式 | research workflow harness |
| 结果回填 | 待执行 |

#### P6-T02：Research Workflow Plugin

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Tech Implementer |
| 输出 | `lib/workflows/research/index.js` |
| 完成标准 | pipeline 通过 workflowKey 调用，不直接承载 research 细节 |
| 依赖 | P6-T01 |
| 风险 | 与 existing researchWorkflowV2 / specialized runner 冲突 |
| 验证方式 | replay clarify→execute、继续澄清、结束任务 |
| 结果回填 | 待执行 |

#### P6-T03：Research Failed Snapshot 迁移

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Tech Implementer |
| 输出 | `lib/workflows/research/failed-snapshot.js` 或复用现有模块 |
| 完成标准 | 执行失败仍写 snapshot；成功后清理状态 |
| 依赖 | P6-T02 |
| 风险 | 失败恢复能力丢失 |
| 验证方式 | 失败 replay case |
| 结果回填 | 待执行 |

### 阶段验收标准

- research 状态机从 pipeline 主体迁出。
- research replay 通过。
- 失败 snapshot 行为保持。

---

## P7：Output 插件化：Doc Export / Usage / Feishu Limit

### 阶段目标

将输出副作用插件化，避免 doc export、usage footer、飞书限制控制散落在主 pipeline。

### 阶段状态

Todo

### 阶段任务

#### P7-T01：Reply Formatter Output

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Tech Implementer |
| 输出 | `lib/brain/output/reply-formatter.js` |
| 完成标准 | 格式化、sanitize、timing、process narration strip 职责明确 |
| 依赖 | P4 |
| 风险 | 回复内容变化影响用户体验 |
| 验证方式 | reply format tests / replay |
| 结果回填 | 待执行 |

#### P7-T02：Doc Export Output Plugin

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Tech Implementer |
| 输出 | `lib/brain/output/doc-export-output.js` |
| 完成标准 | clarify 不导出；长回复触发导出；导出失败不影响主回复 |
| 依赖 | P3 fake doc export adapter |
| 风险 | 误创建飞书文档或漏创建文档 |
| 验证方式 | doc export harness |
| 结果回填 | 待执行 |

#### P7-T03：Usage Footer Output Plugin

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Tech Implementer |
| 输出 | `lib/brain/output/usage-footer.js` |
| 完成标准 | 保持现有 usage footer 行为，受配置控制 |
| 依赖 | P7-T01 |
| 风险 | 回复过长或显示错误模型/token |
| 验证方式 | existing usage footer tests |
| 结果回填 | 待执行 |

#### P7-T04：Feishu Output Limit Harness

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Harness Reviewer |
| 输出 | `test/feishu-output-limit.test.js` 或合并到现有输出测试 |
| 完成标准 | 卡片大小、表格数量、超长回复、文档导出触发有测试 |
| 依赖 | P7-T01~T03 |
| 风险 | 飞书输出限制被重构破坏 |
| 验证方式 | `npm test` |
| 结果回填 | 待执行 |

### 阶段验收标准

- 输出副作用插件化。
- 文档导出和 usage footer 行为可测。
- 飞书输出限制被 Harness 覆盖。

---

## P8：Compat Adapter 与 Planning 收敛

### 阶段目标

把兼容逻辑集中管理，并减少 pipeline 中重复 planning，形成 prePlan + finalPlan。

### 阶段状态

Todo

### 阶段任务

#### P8-T01：Compat Adapter 骨架

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Compatibility Reviewer / Tech Implementer |
| 输出 | `lib/compat/legacy-bridge-adapter.js`、`plugin-native-adapter.js`、`session-adapter.js`、`idempotency-adapter.js` |
| 完成标准 | 每个 compat 分支包含 reason、removeWhen、tests |
| 依赖 | P1 compat 盘点 |
| 风险 | 兼容逻辑继续污染主链路 |
| 验证方式 | compat tests |
| 结果回填 | 待执行 |

#### P8-T02：Compat Harness

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Compatibility Reviewer |
| 输出 | `test/compat-adapter.test.js` |
| 完成标准 | legacy-bridge、plugin-native、session、idempotency 典型路径有测试 |
| 依赖 | P8-T01 |
| 风险 | 新旧 runtime mode 行为漂移 |
| 验证方式 | `npm test` |
| 结果回填 | 待执行 |

#### P8-T03：prePlan / finalPlan 设计

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Architect |
| 输出 | planning 收敛设计与迁移说明 |
| 涉及文件 | `pipeline-v2.js`、`request-planner.js` |
| 完成标准 | prePlan 只产出 session/workflow/memory hint；finalPlan 是唯一执行依据 |
| 依赖 | P1-T03、P4 |
| 风险 | 多次 planning 结果不一致 |
| 验证方式 | planning tests + replay |
| 结果回填 | 待执行 |

#### P8-T04：Planning 收敛实现

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Tech Implementer |
| 输出 | 统一 planning stage |
| 完成标准 | 减少重复 planOpenclawExecution 调用；行为不变；reasonCodes 保留 |
| 依赖 | P8-T03 |
| 风险 | session/memory/research 判断依赖 prePlan，容易破坏细节 |
| 验证方式 | replay + existing tests |
| 结果回填 | 待执行 |

### 阶段验收标准

- compat 逻辑集中化。
- planning 重复减少。
- prePlan/finalPlan 边界清楚。

---

## P9：全量回归、性能与收口

### 阶段目标

确认所有阶段交付可运行、可测试、可回滚，形成最终风险清单与下一阶段建议。

### 阶段状态

Todo

### 阶段任务

#### P9-T01：全量测试

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Harness Reviewer |
| 输出 | 测试结果摘要 |
| 命令 | `npm test` |
| 完成标准 | 现有测试 + 新增 Harness 全部通过，或明确记录 Blocked 原因 |
| 依赖 | P3~P8 |
| 风险 | 历史测试基线未知 |
| 验证方式 | 测试输出 |
| 结果回填 | 待执行 |

#### P9-T02：Token 与效率检查

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Harness Reviewer |
| 输出 | token budget 风险检查 |
| 完成标准 | 长记忆、长回复、大 artifact 不会无界进入 prompt；轻任务可短路 |
| 依赖 | P5、P7 |
| 风险 | 长期使用后上下文膨胀 |
| 验证方式 | token budget tests |
| 结果回填 | 待执行 |

#### P9-T03：兼容与回滚检查

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | Compatibility Reviewer |
| 输出 | 兼容风险清单与回滚点 |
| 完成标准 | 每个高风险变更有对应测试或回滚说明 |
| 依赖 | P8 |
| 风险 | 线上飞书链路不可中断 |
| 验证方式 | compat replay |
| 结果回填 | 待执行 |

#### P9-T04：最终台账回填与阶段关闭

| 字段 | 内容 |
|---|---|
| 状态 | Todo |
| 执行角色 | PM |
| 输出 | 最终结果、Gap、风险、后续建议 |
| 完成标准 | 所有任务状态明确；Done/Blocked/Confirming 不混淆；交付物路径完整 |
| 依赖 | P9-T01~T03 |
| 风险 | 交付物不完整导致任务无法关闭 |
| 验证方式 | 台账检查 |
| 结果回填 | 待执行 |

### 阶段验收标准

- 全量测试结果明确。
- token 与效率风险明确。
- 兼容与回滚策略明确。
- 台账完整回填。

---

## 4. 当前 Gap

1. 尚未运行仓库测试，未知现有基线是否全部通过。
2. 长期记忆的持久化位置未最终确认，初步建议先以文件/本地 store 抽象接口开始，避免绑定实现。
3. 是否允许新增较多测试 fixtures 待执行中根据需要控制。
4. P1 已完成并已按 QA 评审意见修正台账一致性、补充 `result-policy.js` 说明和现有测试资产盘点；用户已确认 P1 通过，当前进入 P2。

---

## 5. 关键决策记录

1. 用户确认：任务包含代码重构落地，全方位推进。
2. 用户确认：长期记忆纳入本期实现。
3. 用户确认：任务粒度细化到具体文件/模块级。
4. 用户确认：任务台账放在 GitHub `kelvin381539960-cyber/feishu-bridge`。
5. 用户确认：任务台账路径为 `docs/brain-kernel-harness-long-memory-task-ledger.md`。
6. 用户纠正：台账需要项目经理视角，分阶段，每阶段还有具体任务。
7. 已执行决策：将台账重构为 P0~P9 阶段化 WBS。
8. 用户确认：P1 通过，进入 P2。

---

## 6. 回填记录

### P0-T01：重构任务台账结构

状态：Done
执行角色：PM
输入：用户反馈：任务台账不够细，应分阶段，每阶段还有具体任务
输出：`docs/brain-kernel-harness-long-memory-task-ledger.md`
结果摘要：已将原平铺任务列表重构为 P0~P9 阶段化 WBS，每阶段包含目标、状态、任务、文件级输出、依赖、风险、验证方式和验收标准。
问题 / Gap：暂无
需要确认的决策：暂无
下一步：进入 P1 现状盘点与架构边界。

### P1-T01：主链路调用链盘点

状态：Done
执行角色：Architect
输入：`AGENTS.md`、`feishu-ws-cursor.js`、`bridge-host.js`、`channel-runner.js`、`pipeline-v2.js`
输出：主链路调用链与边界判断
结果摘要：

```text
飞书 im.message.receive_v1
→ feishu-ws-cursor.js
→ startFeishuBridgeHost()
→ bridge-host：加载配置 / 校验 env / 启动 Lark WSClient / 注册 EventDispatcher
→ channel-runner：装配 runtimeConfig、routing、channelPlugin、telemetry、pipelineState、taskQueue、OpenClaw 调用、memory、media、ack 等依赖
→ pipeline-v2：主编排
→ taskQueue
→ OpenClaw Gateway / research workflow / specialized runner
→ reply format / doc export / send reply
→ memory persist / telemetry / chain-next
```

关键判断：

1. `feishu-ws-cursor.js` 已足够薄，只是兼容入口，不应再加业务逻辑。
2. `bridge-host.js` 主要是飞书 WS 生命周期、配置校验、凭证等待、事件注册、shutdown 和安全提示，边界清晰。
3. `channel-runner.js` 是当前 composition root / service container，负责把飞书通道能力、OpenClaw、memory、media、telemetry、queue 注入 pipeline。
4. `plugin-runtime.js` 已经是 Feishu Channel Plugin 的雏形，可作为 P3 Fake Channel Adapter 和 P4 Channel Plugin 边界参考。
5. 当前不能破坏的行为点：env 校验、secret file 轮询、direct/prefix 模式、allowed chat、group @bot、session/idempotency、飞书 reply/reaction、OpenClaw Gateway 调用。

问题 / Gap：未运行测试，测试基线未知。
需要确认的决策：P2 前无需新决策；P1 等待用户检查。
下一步：用户确认 P1 后进入 P2。

### P1-T02：pipeline-v2 职责切片

状态：Done
执行角色：Architect
输入：`lib/feishu-cursor/pipeline-v2.js`
输出：pipeline-v2 目标阶段切片与迁移边界
结果摘要：

| 目标阶段 | 当前 pipeline-v2 职责 | 迁移判断 |
|---|---|---|
| Sensory 感知 | parse inbound event、raw content log、media processor 装配与文本拼接 | 可拆，但 media 与 merge_forward 联动需 replay |
| Attention 注意力 | dedup、route eligibility、group @bot、echo reply skip、merge_forward debounce/coalesce | 必须 Harness 先行，属于关键行为过滤层 |
| Cognition 理解 | prefix/direct task 提取、quoted parent、sheet normalize、@ context、classificationMerge | quoted/@/sheet 可分模块，classification 暂不先动 |
| Memory 记忆 | research state key、fresh reset、memoryMode、assembleMemoryContext、persistMemoryTurn | 高风险，P5 前不直接重写 |
| Planning 决策 | probePlanned、planned、controlPlanned、pipeline gate、workflow execution policy | 存在重复 planning，P8 收敛为 prePlan/finalPlan |
| Execution 执行 | ACK、taskQueue、research V2、specialized solo、OpenClaw gateway、normalize result、runtime validation | 需要 Replay + Fake Executor 后再拆 |
| Output 输出 | format reply、strip process narration、clarify footer、timing、sanitize、doc export、usage footer、send reply | doc export 高副作用；reply formatter 可较早抽出 |
| Feedback 反馈 | telemetry、failed research snapshot、memory persist、chain-next | 可模块化，但 snapshot/memory 需先锁行为 |

第一批相对安全切口：

1. pipeline 内纯 helper：workflow hint、clarify control、firstHttpUrl、reply post-process helper。
2. output 辅助模块：usage footer wrapper、reply formatter wrapper。
3. channel fake adapter：不影响生产链路。
4. Contract/Replay Harness：优先于运行代码重构。

暂不直接动刀区域：

1. research clarify/execute/fresh reset。
2. session/idempotency/runtime mode。
3. memory epoch 与 meta_followup。
4. doc export 真实飞书 API 副作用。
5. 多次 planning 收敛前的 dispatch/session 细节。

问题 / Gap：pipeline-v2 内状态变量多，不能只做机械拆文件。
需要确认的决策：无。
下一步：P2 将这些边界沉淀为架构文档；P3 先建 Harness。

### P1-T03：control-plane 与 planning 现状盘点

状态：Done
执行角色：Architect
输入：`request-planner.js`、`policy-engine.js`、`execution-broker.js`、`session-dispatch.js`、`workflow-execution-policy.js`、相关 routing/result policy
输出：control-plane 职责图与 P8 收敛重点
结果摘要：

```text
planOpenclawExecution
→ classifyOpenclawIntent
→ mergeClassification
→ resolveOpenclawPolicies
   → relay-policy / safety-policy / prompt-policy
→ planExecutionBroker
   → selectRunner
   → buildOpenclawDispatchRequest
      → resolveGatewayRoute
      → buildFeishuSessionKey
      → buildFeishuIdempotencyKey
```

关键判断：

1. `request-planner.js` 已经是控制平面 facade，方向正确。
2. `policy-engine.js` 仍反向依赖 `feishu-cursor/policies/*`，说明 control-plane 尚未完全纯化，是迁移中间态。
3. `session-dispatch.js` 是最高兼容风险点之一，负责 `legacy-bridge` / `plugin-native` runtime mode、sessionKey、idempotencyKey、namespace、agentId 拼接。
4. `workflow-execution-policy.js` 不是普通 policy，而是 research 多 Agent、taskSize、forecast metadata 的执行决策层，P6 迁移 research 时必须保留该语义。
5. `pipeline-v2.js` 目前至少存在 probe/planned/controlPlanned 多次 `planOpenclawExecution`，可能导致重复计算、调试困难和结果不一致。
6. `result-policy.js` 属于 control-plane 的结果策略层，负责根据 classification / structuredResult 判断 doc export intent，并在已有 `feishu_doc` artifact 时避免重复导出；它应在 P7/P8 中与 doc export output plugin 协同，而不是继续让 pipeline 直接承担导出决策细节。

P8 收敛重点：

1. 定义 `prePlan`：只产出 session/workflow/memory/fresh-reset 所需 hint，不能作为最终执行依据。
2. 定义 `finalPlan`：唯一执行依据，包含 classification、prompt、runner、dispatch、reasonCodes。
3. 把 compat/session/idempotency 抽到 `lib/compat/*` 或 planning adapter，但保持现有输出不变。

问题 / Gap：未运行 `test/openclaw-control-plane.test.js`，现有基线未知。
需要确认的决策：无。
下一步：P2 记录 prePlan/finalPlan 原则；P8 再实现。

### P1-T04：memory / research / doc-export 风险盘点

状态：Done
执行角色：Architect / Harness Reviewer
输入：`feishu-session-memory.js`、`memory-facade.js`、`default-memory-provider.js`、`research-workflow-state.js`、`conversation-reset.js`、`research-workflow-runner.js`、`feishu-docx-export.js`
输出：高风险模块清单与 Harness 优先级
结果摘要：

高风险模块：

1. Memory：`feishu-session-memory.js` 已有可插拔 facade；默认 provider 使用本地 JSON store、epoch、最近 24 turns、summary、recent turns、retrieval snippets、meta_followup。问题是缺少统一 token budget，长期使用后仍可能上下文膨胀。
2. Research State：`research-workflow-state.js` 使用本地 JSON store、`clarify_sent` phase、TTL、chat+namespace key。状态简单但和 pipeline fresh reset 深度耦合。
3. Conversation Reset：`conversation-reset.js` 决定 fresh task vs follow-up，依赖 researchRow、lastTurnMeta、assistantReplyLen，误判会导致上下文丢失或串任务。
4. Research Runner：`research-workflow-runner.js` 已实现 crawler/analyst 双阶段、session/idempotency suffix、quality repair、run trace、learning memory record。它已经像 workflow plugin，但位置仍在 control-plane。
5. Doc Export：`feishu-docx-export.js` 真实调用飞书 docx API，创建文档、写 blocks、grant permission、失败删除、verify raw_content、长回复截断、chat summary only、图片 appendix。副作用重，必须 fake adapter/harness 先行。

现有测试资产盘点：

1. Pipeline 相关：`test/feishu-cursor-pipeline-v2.test.js`、`test/feishu-pipeline-fallback.test.js`、`test/pipeline-gate-adapter.test.js`。
2. Control-plane 相关：`test/openclaw-control-plane.test.js`、`test/workflow-execution-policy.test.js`、`test/gates.test.js`、`test/task-classifier-five-workflows.test.js`。
3. Research 相关：`test/research-workflow-runner.test.js`、`test/research-workflow-state.test.js`、`test/conversation-reset.test.js`。
4. Memory 相关：`test/memory-epoch.test.js`、`test/learning-memory-record.test.js`。
5. Doc export / output 相关：`test/feishu-docx-export.test.js`、`test/feishu-docx-markdown.test.js`、`test/feishu-llm-usage-footer.test.js`、`test/run-reply-format.test.js`。
6. Feishu channel / parsing 相关：`test/feishu-im-parse.test.js`、`test/feishu-group-at-bot.test.js`、`test/feishu-task-envelope.test.js`、`test/feishu-cursor-route.test.js`。

判断：P3 不需要从零开始，可以复用现有测试作为 baseline，并补充 replay/fake adapter/contract harness。

P3 Harness 优先级：

1. Pipeline Replay：text basic、prefix miss、direct mode、group @bot、merge_forward、relay-like task。
2. Fake Adapter：Feishu send/reply/reaction/download/fetchMessage、OpenClaw executor、memory store、doc export hook，禁止测试触发真实外部副作用。
3. Research Harness：clarify→execute、继续澄清、结束任务、fresh reset、失败 snapshot。
4. Memory Harness：epoch、meta_followup、session/project隔离、maxTokens/maxRecords、negative memory 优先。
5. Doc Export Harness：clarify 不导出、长回复触发导出、导出失败不影响主回复、半成品链接不发送。
6. Compat Harness：legacy-bridge/plugin-native sessionKey/idempotencyKey 不回归。

问题 / Gap：P1 只做现状盘点，未执行真实测试；doc export 的真实 API 行为后续必须用 fake adapter 隔离。
需要确认的决策：P1 等待用户检查确认后再进入 P2。
下一步：暂停，等待用户检查 P1。

### P1 阶段验收回填

状态：Done，等待用户检查确认。

验收项：

- 有明确现状职责图：已完成。
- 有 pipeline-v2 拆分边界：已完成。
- 有高风险模块清单：已完成。
- 有 P3 Harness 优先级建议：已完成。
- 不修改运行代码：已遵守；本阶段只修改任务台账。

阶段结论：

当前系统不是缺能力，而是能力集中在 `pipeline-v2.js` 和若干副作用模块中。P2 应先冻结架构协议与行为不变量，P3 必须先建立 Harness，再进入 P4 之后的实际拆分。
