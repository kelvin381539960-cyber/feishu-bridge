# Brain Kernel + Harness + Long Memory 架构文档

## 1. 文档目的

本文档定义 `feishu-bridge` 后续重构的目标架构、核心协议、模块边界、迁移不变量与 Harness 策略。

本方案基于 P1 现状盘点结论：当前系统能力完整，但大量能力集中在 `lib/feishu-cursor/pipeline-v2.js` 与若干高副作用模块中。后续重构不采用大爆炸式重写，而采用：

```text
Harness 锁行为 → 协议冻结 → 阶段化拆分 → 插件化迁移 → 兼容收敛
```

核心目标：

```text
让 pipeline 变薄
让模块变清晰
让插件可插拔
让长期记忆可控
让 token 不爆炸
让兼容逻辑可删除
```

---

## 2. 当前架构判断

### 2.1 当前真实链路

```text
飞书 im.message.receive_v1
→ feishu-ws-cursor.js
→ startFeishuBridgeHost()
→ bridge-host
→ channel-runner
→ pipeline-v2
→ taskQueue
→ OpenClaw Gateway / research workflow / specialized runner
→ reply format / doc export / send reply
→ memory persist / telemetry / chain-next
```

### 2.2 当前职责判断

| 模块 | 当前职责 | 后续定位 |
|---|---|---|
| `feishu-ws-cursor.js` | 兼容入口 | 保持极薄，不加业务逻辑 |
| `bridge-host.js` | 飞书 WS 生命周期、配置校验、事件注册 | Channel Host |
| `channel-runner.js` | composition root / service container | Runtime Container |
| `plugin-runtime.js` | 飞书通道能力集合 | Feishu Channel Adapter / Plugin |
| `pipeline-v2.js` | 当前主脑，承担感知、过滤、理解、记忆、决策、执行、输出、反馈 | 逐步瘦身为 Brain Kernel 调度入口 |
| `openclaw-control-plane/*` | 决策、策略、dispatch、runner 选择 | Planning / Execution Control Plane |
| `feishu-docx-export.js` | 飞书云文档真实副作用 | Output Plugin + Fake Adapter Harness |
| `feishu-session-memory.js` / memory provider | 会话记忆、epoch、recent turns、summary | Memory Facade / Memory Router 基础 |
| `research-workflow-*` | 调研状态与多阶段执行 | Research Workflow Plugin |

---

## 3. 目标架构

```text
Channel Layer
  └─ Feishu Adapter
      ├─ parse inbound event
      ├─ send text / reply / reaction
      ├─ download image / file / audio
      └─ fetch quoted / group members

Brain Kernel
  ├─ Sensory
  ├─ Attention
  ├─ Cognition
  ├─ Memory
  ├─ Planning
  ├─ Execution
  ├─ Output
  └─ Feedback

Workflow Registry
  ├─ general
  ├─ research
  ├─ prd
  ├─ solution
  ├─ code
  └─ doc-export

Memory System
  ├─ Session Memory
  ├─ User Preference Memory
  ├─ Project Memory
  ├─ Workflow Memory
  ├─ Artifact Memory
  ├─ Negative Memory
  └─ Memory Budget Controller

Harness Layer
  ├─ Contract Harness
  ├─ Replay Harness
  ├─ Fake Adapter Harness
  ├─ Workflow Harness
  ├─ Memory Harness
  ├─ Token Budget Harness
  └─ Compat Harness
```

---

## 4. 模块边界

### 4.1 Channel Layer

Channel Layer 只负责飞书通道能力，不理解业务任务。

允许职责：

```text
接收飞书事件
发送文本 / 回复 / reaction
下载图片 / 文件 / 语音
获取引用消息
获取群成员
处理飞书 API 错误
```

禁止职责：

```text
任务分类
workflow 决策
memory 注入
OpenClaw planning
research 状态机
doc export 决策
```

### 4.2 Brain Kernel

Brain Kernel 负责阶段编排，不直接承载业务细节。

目标伪代码：

```js
async function runBrain(event) {
  let ctx = createBrainContext(event);

  ctx = await runPhase("sensory", ctx);
  ctx = await runPhase("attention", ctx);
  if (ctx.flags.shortCircuited) return runPhase("output", ctx);

  ctx = await runPhase("cognition", ctx);
  ctx = await runPhase("memory", ctx);
  ctx = await runPhase("planning", ctx);
  ctx = await runPhase("execution", ctx);
  ctx = await runPhase("output", ctx);
  await runPhase("feedback", ctx);

  return ctx;
}
```

### 4.3 Workflow Layer

Workflow Layer 只承载业务流程。

```text
ResearchWorkflow
PrdWorkflow
SolutionWorkflow
CodeWorkflow
DocExportWorkflow
```

要求：

1. 每个 workflow 必须有状态机边界。
2. 每个 workflow 必须可被 Harness 单独运行。
3. workflow 不直接调用飞书发送能力。
4. workflow 不直接写长期记忆，只输出建议的 memory records。

### 4.4 Memory System

Memory System 的目标是“越用越懂你”，但禁止无界注入上下文。

读取链路：

```text
MemoryQuery
→ MemoryRouter
→ MemoryScoring
→ MemorySummarizer
→ MemoryBudgetController
→ MemoryPack
```

写入链路：

```text
ExecutionResult / UserCorrection / ProjectDecision
→ MemoryRecord candidate
→ confidence / scope / source / ttl
→ persist
```

### 4.5 Output Layer

Output Layer 负责交付形式，不负责决策本身。

```text
ReplyFormatter
DocExportOutput
UsageFooterOutput
FeishuLimitGuard
```

注意：`result-policy.js` 负责结果策略判断，Output Plugin 负责执行输出副作用，二者不能重复决策。

### 4.6 Compat Layer

兼容逻辑必须集中，不得继续污染主 pipeline。

```text
compat/
  legacy-bridge-adapter.js
  plugin-native-adapter.js
  session-adapter.js
  idempotency-adapter.js
```

每个 compat 分支必须包含：

```js
{
  name: "legacy-bridge-session",
  reason: "support old runtime",
  removeWhen: "plugin-native stable for 30 days",
  tests: ["compat-adapter.test.js"]
}
```

---

## 5. 核心协议

### 5.1 InboundEvent

```js
{
  source: "feishu",                 // required
  eventId: "evt_xxx",               // optional
  messageId: "om_xxx",              // required
  chatId: "oc_xxx",                 // required
  senderId: "ou_xxx",               // optional
  messageType: "text",              // required: text/post/image/audio/file/merge_forward/interactive
  text: "raw text",                 // optional
  media: null,                       // optional
  raw: {},                           // optional
  receivedAtMs: 1710000000000        // required
}
```

兼容策略：当前可由 `parseWsImDispatchPayload` 生成或映射。

### 5.2 TaskEnvelope

```js
{
  source: "feishu",                 // required
  channel: {
    name: "feishu",                 // required
    chatId: "oc_xxx",               // required
    messageId: "om_xxx",            // required
    senderId: "ou_xxx",             // optional
    runtimeMode: "plugin-native"     // optional
  },
  content: {
    text: "original task",           // required
    normalizedText: "normalized",    // optional
    attachments: []                  // required, default []
  },
  context: {
    quotedParent: null,              // optional
    mentions: [],                    // required, default []
    memory: null                     // optional
  },
  routing: {
    mode: "direct",                  // required: direct/prefix
    prefixMatched: true,             // optional
    allowed: true,                   // required
    reason: ""                       // optional
  },
  trace: {
    traceId: "trace_xxx",            // required
    receivedAtMs: 1710000000000      // required
  }
}
```

兼容策略：第一阶段复用 `buildFeishuTaskEnvelope`，新增字段必须保持 optional，不破坏现有 planner。

### 5.3 BrainContext

```js
{
  envelope: {},                      // required: TaskEnvelope
  inbound: {},                       // optional: InboundEvent
  classification: null,              // optional
  workflow: null,                    // optional
  memory: null,                      // optional: MemoryPack
  plan: null,                        // optional: ExecutionPlan
  execution: null,                   // optional: ExecutionResult
  output: null,                      // optional
  telemetry: [],                     // required, default []
  flags: {
    shortCircuited: false,
    needsAck: true,
    needsMemoryPersist: true,
    needsDocExport: false,
    skipDocExport: false
  },
  errors: []                         // required, default []
}
```

约束：插件不得随意写入未声明字段，P3/P4 之后由 Plugin Harness 检查。

### 5.4 ExecutionPlan

```js
{
  workflowKey: "general",            // required
  taskType: "general",               // required
  stage: "execute",                  // required: clarify/execute/finalize
  runner: {
    type: "openclaw",                // required
    agentProfile: "fast",            // optional
    multiAgentRequired: false         // required
  },
  dispatch: {
    task: "final task",               // required
    opts: {
      sessionId: "",                 // optional
      gatewayRequest: {}             // optional
    }
  },
  policy: {
    taskSize: "small",                // optional
    safetyLevel: "normal",           // optional
    reasonCodes: []                  // required, default []
  }
}
```

约束：`finalPlan` 是唯一执行依据；`prePlan` 不允许触发执行。

### 5.5 ExecutionResult

```js
{
  code: 0,                            // required
  stdout: "",                         // required, default ""
  stderr: "",                         // required, default ""
  structuredResult: null,             // optional
  artifacts: [],                      // required, default []
  usage: {
    plannerModel: "",
    executorModel: "",
    tokens: 0
  },
  runtimeTrace: {
    runnerType: "openclaw",
    multiAgentRequired: false,
    queueWaitMs: 0
  }
}
```

兼容策略：第一阶段复用 `normalizeExecutionResult`。

### 5.6 MemoryRecord

```js
{
  id: "mem_xxx",                     // required
  scope: "user",                     // required: user/project/workflow/session/artifact/negative
  subject: "feishu-bridge",          // required
  key: "response_style",             // required
  value: "直接、少废话、先执行",        // required
  summary: "用户偏好直接执行",          // optional
  confidence: 0.9,                    // required: 0~1
  source: "explicit",                // required: explicit/inferred/artifact/correction/system
  tokenCost: 120,                     // optional
  priority: 80,                       // optional
  expiresAt: null,                    // optional
  updatedAt: "2026-05-04T00:00:00Z"  // required
}
```

约束：`negative` scope 优先级高于普通偏好；用户显式纠正高于推断记忆。

### 5.7 MemoryQuery

```js
{
  userId: "ou_xxx",                  // optional
  projectId: "feishu-bridge",        // optional
  workflowKey: "research",           // optional
  taskType: "architecture_review",    // optional
  query: "优化飞书 bridge 架构",        // required
  budget: {
    maxTokens: 1200,                  // required
    maxRecords: 8                     // required
  }
}
```

### 5.8 MemoryPack

```js
{
  injected: true,                     // required
  records: [],                        // required, default []
  summary: "相关记忆摘要",             // required when injected=true
  tokenEstimate: 780,                 // required
  omitted: [
    { reason: "low_relevance", count: 12 }
  ]
}
```

约束：MemoryPack 只能注入摘要和少量高相关记录，不能注入无限历史。

### 5.9 TokenBudget

```js
{
  totalLimit: 128000,                 // required
  reservedForOutput: 8000,            // required
  reservedForTools: 12000,            // required
  memoryBudget: 1500,                 // required
  artifactBudget: 3000,               // required
  conversationBudget: 1200,           // required
  safetyMargin: 0.2                   // required
}
```

默认策略：

| 任务类型 | Memory Budget | Artifact Budget | 说明 |
|---|---:|---:|---|
| small | 300~800 | 0~1000 | 轻任务少注入 |
| medium | 800~1500 | 1000~3000 | 普通任务 |
| large | 1500~3000 | 3000~8000 | 调研/方案类 |
| huge | 需要 artifact 化 | 需要 artifact 化 | 不允许直接塞满 prompt |

---

## 6. Plugin 接口约束

### 6.1 BrainPlugin

```js
{
  name: "plugin-name",
  phase: "sensory",
  priority: 100,
  reads: ["envelope.content"],
  writes: ["classification"],
  sideEffects: [],
  enabled(ctx) { return true; },
  async run(ctx) { return ctx; }
}
```

约束：

1. 插件必须声明 `reads` / `writes` / `sideEffects`。
2. 插件不得写入未声明字段。
3. 插件异常必须由 Kernel 捕获并进入 `ctx.errors`。
4. 外部副作用必须通过 Adapter，不允许直接调用真实外部服务。

### 6.2 WorkflowPlugin

```js
{
  key: "research",
  match(ctx) { return true; },
  async clarify(ctx) { return ctx; },
  async execute(ctx) { return ctx; },
  async finalize(ctx) { return ctx; }
}
```

### 6.3 ExecutorPlugin

```js
{
  key: "openclaw",
  match(plan) { return plan.runner.type === this.key; },
  async run(ctx) { return ctx; }
}
```

### 6.4 OutputPlugin

```js
{
  key: "feishu-doc-export",
  match(ctx) { return ctx.flags.needsDocExport && !ctx.flags.skipDocExport; },
  async run(ctx) { return ctx; }
}
```

---

## 7. 迁移不变量

以下行为在重构中不可回归，必须映射到 P3/P9 Harness。

### 7.1 Channel / Routing 不变量

1. `feishu-ws-cursor.js` 仍可启动当前飞书 WS 链路。
2. env 校验、secret file 等待、shutdown 行为不变。
3. direct 模式下任意文本可进入任务流程。
4. prefix 模式下 prefix miss 必须短路并给提示。
5. allowed chat 不匹配必须静默或按现有逻辑跳过。
6. 群聊 require @bot 时，未 @bot 必须跳过。
7. outbound echo 必须跳过，避免机器人回复触发自身。
8. merge_forward debounce/coalesce 行为不得破坏。

### 7.2 Planning / Execution 不变量

1. relay-like task 必须 deterministic short-circuit，不进入 OpenClaw。
2. sessionId / idempotencyKey 兼容现有 `legacy-bridge` 与 `plugin-native`。
3. `reasonCodes` 不丢失。
4. specialized runtime guard 仍可阻断不合规结果。
5. queue metadata、runner metadata 仍进入 normalized result。
6. `prePlan` 不执行任务，`finalPlan` 是唯一执行依据。

### 7.3 Research 不变量

1. research clarify-first 默认行为不变。
2. 用户回复“继续澄清”时保持 clarify。
3. 用户回复“继续下一步/开始执行”时进入 execute。
4. 普通补充回答默认进入 execute。
5. “结束任务/取消/停止”清理 research state。
6. fresh reset 不得错误串接上一个 research。
7. research execute 失败仍写 failed snapshot。
8. research execute 成功后清理 workflow state。

### 7.4 Memory 不变量

1. memory persist 不阻塞主回复。
2. conversation epoch 行为不变。
3. `meta_followup` 语义保持。
4. 新 memory router 不得跨 chat/session/project 串记忆。
5. 所有长期记忆注入必须受 TokenBudget 限制。
6. 用户显式纠正优先于历史推断记忆。

### 7.5 Output / Doc Export 不变量

1. clarify 阶段不触发 doc export。
2. research/report 命中时按配置导出云文档。
3. 长回复导出受 allowlist / min chars / modes 控制。
4. 已有 `feishu_doc` artifact 时不重复导出。
5. doc export 失败不影响主回复发送。
6. 不发送空文档或半成品链接。
7. usage footer 行为保持配置可控。
8. reply sanitize 仍避免 relay echo 风险。

---

## 8. Harness 策略

### 8.1 Contract Harness

目标：锁定核心协议字段、默认值和兼容输入。

建议文件：

```text
test/brain-contracts.test.js
```

### 8.2 Replay Harness

目标：用 fixture 重放当前关键行为。

必须覆盖：

```text
text basic
prefix miss
direct mode
group @bot
merge_forward
relay-like task
research clarify → execute
```

### 8.3 Fake Adapter Harness

禁止测试调用真实：

```text
飞书 API
OpenClaw Gateway
真实 memory store
真实 doc export
真实文件清理副作用
```

### 8.4 Memory Harness

必须覆盖：

```text
epoch
meta_followup
session/project 隔离
maxTokens/maxRecords
negative memory 优先
```

### 8.5 Token Budget Harness

必须覆盖：

```text
长会话不爆 token
大 artifact 不直接进入 prompt
低相关记忆被省略
huge 任务转 artifact / 分阶段处理
```

### 8.6 Compat Harness

必须覆盖：

```text
legacy-bridge session key
plugin-native session key
idempotency key
namespace
agentId
reasonCodes
```

---

## 9. 推荐目录结构

```text
lib/
  channel/
    feishu/

  brain/
    context.js
    registry.js
    kernel.js
    sensory/
    attention/
    cognition/
    memory/
    planning/
    execution/
    output/
    feedback/

  memory/
    memory-record.js
    memory-query.js
    memory-pack.js
    memory-router.js
    memory-budget-controller.js
    memory-scoring.js
    memory-summarizer.js

  workflows/
    general/
    research/
    prd/
    solution/
    code/
    doc-export/

  executors/
    openclaw/
    specialized/
    research-v2/

  compat/
    legacy-bridge-adapter.js
    plugin-native-adapter.js
    session-adapter.js
    idempotency-adapter.js
```

测试建议：

```text
test/
  brain-contracts.test.js
  brain-replay-harness.test.js
  memory-budget-controller.test.js
  memory-router.test.js
  compat-adapter.test.js
  feishu-output-limit.test.js
```

---

## 10. 迁移阶段映射

| 阶段 | 目标 | 关键约束 |
|---|---|---|
| P3 | Harness baseline | 不改行为，只锁行为 |
| P4 | Brain Kernel 骨架 | 新增骨架，不急于接管主链路 |
| P5 | Long Memory + Token Budget | memory 注入必须受预算控制 |
| P6 | Research Workflow Plugin | 先 Harness 后迁移状态机 |
| P7 | Output Plugin | doc export 必须 fake adapter 先行 |
| P8 | Compat + Planning 收敛 | prePlan/finalPlan，不破坏 session/idempotency |
| P9 | 全量回归 | 全量测试、风险、回滚点明确 |

---

## 11. 风险与回滚原则

### 11.1 高风险区

```text
pipeline-v2 主流程
research state / fresh reset
session / idempotency
memory epoch / meta_followup
doc export 真实飞书 API 副作用
planning 多次调用收敛
```

### 11.2 回滚原则

1. P3 之前不改运行代码。
2. P4 之后每次抽取必须保持旧入口可用。
3. 新模块先旁路加载，再逐步接管。
4. 每次接管必须有 replay case。
5. 外部副作用必须 fake adapter 先行。
6. compat 分支必须有 removeWhen，但未满足条件前不得删除。

---

## 12. AI Agent 执行约束

本项目后续会由 AI Agent 分阶段执行，因此必须限制执行范围，避免一次性生成过多空目录、过早接管主链路或引入不可验证改动。

### 12.1 最小可落地单元

每个阶段只允许新增该阶段必要文件，不允许提前创建大批空目录。

P3 最小落地文件：

```text
test/helpers/fake-feishu-channel.js
test/helpers/fake-openclaw-executor.js
test/helpers/fake-memory-store.js
test/helpers/fake-doc-exporter.js
test/brain-contracts.test.js
test/brain-replay-harness.test.js
```

P4 最小落地文件：

```text
lib/brain/context.js
lib/brain/registry.js
lib/brain/kernel.js
test/brain-kernel.test.js
```

P5 之后再新增 `lib/memory/*`，P6 之后再新增 `lib/workflows/research/*`，P7 之后再新增 output plugin 文件，P8 之后再新增 compat adapter 文件。

### 12.2 P3 执行限制

P3 只允许新增 Harness、fixtures、fake adapters 和 contract tests。

P3 禁止事项：

```text
禁止修改 pipeline-v2.js
禁止修改 channel-runner.js
禁止修改 bridge-host.js
禁止修改 openclaw-control-plane 运行逻辑
禁止触发真实飞书 API / OpenClaw Gateway / doc export / memory store 副作用
```

### 12.3 P4 执行限制

P4 只允许新增 Brain Kernel 骨架和旁路测试。

P4 的 Brain Kernel 不直接接管生产链路，只能被测试加载和运行。

允许：

```text
新增 context / registry / kernel
新增最小 runPhase 编排
新增 brain-kernel.test.js
```

禁止：

```text
禁止把 pipeline-v2.js 主流程直接替换为 Brain Kernel
禁止一次性迁移 research / memory / doc export
禁止重写 session / idempotency
```

### 12.4 Plugin 读写约束演进

Plugin 的 `reads` / `writes` / `sideEffects` 分两阶段落地：

```text
P4：只声明，不强拦截，用于文档化和 Harness 可见性。
P5/P6：引入 mutation guard，检测插件是否写入未声明字段。
```

这样避免 P4 过重，同时保留后续治理能力。

### 12.5 BrainContext 分阶段演进

禁止一次性接入完整 BrainContext。

v0 只实现：

```js
{
  envelope,
  flags,
  telemetry,
  errors
}
```

v1 再接入：

```js
{
  classification,
  memory,
  plan,
  execution,
  output
}
```

v0 用于 P3/P4，v1 用于 P5 之后的迁移。

### 12.6 提交约束

每次提交必须对应一个 WBS task。

每次提交信息应体现阶段与任务，例如：

```text
P3-T02 Add fake Feishu channel adapter
P4-T01 Add Brain Kernel skeleton
P5-T02 Add Memory Budget Controller
```

每次完成一个 WBS task，必须回填台账中的：

```text
状态
输出路径
结果摘要
问题 / Gap
下一步
```

### 12.7 AI Agent 停止条件

AI Agent 遇到以下情况必须停止并等待确认：

```text
需要删除 / 移动 / 大规模重命名文件
需要修改生产入口
需要改变 session / idempotency 语义
需要改变 research clarify 默认行为
需要改变 doc export 触发条件
需要绑定长期记忆的真实持久化存储
测试基线失败且原因不明确
```

---

## 13. Intent Classification Governance

当前 `lib/feishu-cursor/policies/task-classifier.js` 是真实任务分类入口，但它同时承担了分类、路由、兼容字段、执行策略前置判断和 semantic fallback，长期会导致规则漂移、误判难回归、优先级隐性化。

后续应将它治理为可解释、可回归、低漂移的 Intent Classification System。

### 13.1 目标

```text
准确识别用户真实意图
规则清晰，不靠代码顺序暗中决定结果
分类结果可解释、可回归、可灰度
普通任务本地规则完成，不调用模型
新增 workflow 不重写整个分类器
```

### 13.2 目标链路

```text
userTask
→ normalize
→ signal extraction
→ candidate generation
→ conflict arbitration
→ classification policy
→ final classification
```

对应模块建议：

| 层 | 文件 | 职责 |
|---|---|---|
| Normalize | `lib/brain/intent/task-normalizer.js` | 清洗文本、提取 URL、mention、命令前缀 |
| Signals | `lib/brain/intent/intent-signals.js` | 只提取信号，不做最终判断 |
| Rules | `lib/brain/intent/intent-rules.js` | 显式规则列表，带 priority / ruleId |
| Candidate | `lib/brain/intent/intent-candidates.js` | 生成多个可能 intent |
| Arbiter | `lib/brain/intent/intent-arbiter.js` | 冲突仲裁，选最终 intent |
| Policy | `lib/brain/intent/classification-policy.js` | 决定 requiresTooling / fullRunner / clarify |
| Facade | `lib/feishu-cursor/policies/task-classifier.js` | 保持旧入口，内部调用新系统 |

### 13.3 分类与执行策略分离

分类器只回答：

```text
用户想做什么？
```

示例输出：

```js
{
  workflowKey: "research",
  taskSubtype: "none",
  confidence: 0.88,
  reasons: ["research.keyword", "research.verb"],
  candidates: []
}
```

执行策略再回答：

```text
这个任务怎么执行？
```

示例输出：

```js
{
  requiresTooling: true,
  requiresFullRunner: true,
  needsClarification: false,
  executionMode: "workflow"
}
```

约束：分类规则不得直接承载执行策略；执行策略不得反向改变 workflowKey。

### 13.4 多维意图信号

分类不应只做扁平 workflowKey 判断，而应先提取信号：

| 维度 | 示例 |
|---|---|
| 用户动作 | 生成 / 修复 / 调研 / 分析 / 询问 / 写入 / 读取 |
| 对象 | PRD / 代码 / 方案 / 表格 / 文档 / 人 |
| 资源 | URL / sheet / doc / file / mention |
| 期望输出 | 报告 / 方案 / 代码改动 / 转述 / 表格写入 |
| 强制命令 | `/调研`、`/code`、`/solution` |
| 上下文状态 | research follow-up / memory follow-up |
| 风险信号 | relay / 外部副作用 / doc export |

### 13.5 显式优先级规则

当前分类不能继续依赖代码 if 顺序隐式决定结果。规则必须显式声明 priority：

```js
{
  id: "research.force_command",
  priority: 1000,
  workflowKey: "research",
  match: signals => signals.forceResearch,
  reason: "force_research_command"
}
```

建议优先级：

| 优先级 | 类型 | 示例 |
|---:|---|---|
| 1000 | 强制命令 | `/调研`、`/code`、`/solution` |
| 900 | 结构化资源 | sheet URL、doc URL、interactive card |
| 800 | 明确业务意图 | PRD、代码修复、深度调研 |
| 700 | relay / mention | 转告、问某人 |
| 600 | solution / planning | 方案、路线图、可行性 |
| 500 | weak semantic | 普通关键词 |
| 100 | fallback | general |

### 13.6 冲突仲裁

真实输入经常同时命中多个候选，例如：

```text
帮我调研一个技术方案
帮我写一个修复方案
帮我生成 PRD 调研报告
帮我分析这个发布方案
```

因此必须输出 candidates 并由 arbiter 显式决策：

```js
{
  candidates: [
    { workflowKey: "research", score: 0.82, reasons: ["research.keyword"] },
    { workflowKey: "solution", score: 0.76, reasons: ["solution.keyword"] }
  ],
  winner: "research",
  decision: "research beats solution because research verb is explicit"
}
```

关键仲裁原则：

| 冲突 | 处理 |
|---|---|
| PRD + research | 生成需求文档时 PRD 优先；调研 PRD 模板时 research 优先 |
| research + solution | 调研/分析强时 research；设计/落地/路线图强时 solution |
| code + solution | 修复/报错/部署强时 code；设计技术方案时 solution |
| sheet URL + 写入词 | sheet_write |
| sheet URL 无写入词 | sheet_read |
| relay + 其他 | 明确 @人 + 问/转告时 relay short-circuit 优先 |
| URL + research | research with resource |
| doc URL 无明确动作 | resource_read |

### 13.7 Semantic Classifier 边界

Semantic classifier 只能做仲裁辅助，不能成为主分类器。

```text
强规则命中 → 不调用 semantic
多候选冲突 → 可选调用 semantic arbiter
弱信号 / general fallback → 可选调用 semantic
semantic 结果必须落在白名单 enum
semantic confidence < 0.8 → 忽略
semantic 不能创造新 workflowKey
```

也就是说：

```text
LLM 不是分类器
LLM 是冲突裁判助理
```

这样可以保持灵活，同时避免模型漂移。

### 13.8 最终分类输出

统一输出结构：

```js
{
  version: "intent-classifier-v2",
  workflowKey: "research",
  taskType: "research",
  taskSubtype: "none",
  confidence: 0.88,
  policy: {
    requiresTooling: true,
    requiresFullRunner: true,
    needsClarification: false,
    executionMode: "workflow"
  },
  reasons: ["research.keyword", "research.deep_analysis"],
  candidates: [
    { workflowKey: "research", score: 0.88, reasons: ["research.keyword"] },
    { workflowKey: "solution", score: 0.61, reasons: ["solution.keyword"] }
  ],
  decision: {
    winner: "research",
    rule: "research_over_solution_when_research_verb_present"
  }
}
```

兼容字段必须保留：

```text
taskType
workflowKey
taskSubtype
requiresTooling
requiresFullRunner
needsClarification
reasons
```

### 13.9 误判样本集

必须新增 regression corpus：

```text
test/fixtures/intent-classifier-corpus.json
test/intent-classifier-regression.test.js
test/intent-arbiter.test.js
```

样本格式：

```json
[
  {
    "input": "帮我调研 Redis 缓存方案",
    "expected": { "workflowKey": "research" },
    "reason": "调研意图强于方案词"
  },
  {
    "input": "帮我设计 Redis 缓存方案",
    "expected": { "workflowKey": "solution" },
    "reason": "设计方案是 solution"
  },
  {
    "input": "帮我修复这个部署失败问题",
    "expected": { "workflowKey": "code" },
    "reason": "修复/部署失败属于 code"
  },
  {
    "input": "生成一个登录功能 PRD",
    "expected": { "workflowKey": "prd" },
    "reason": "明确 PRD 产出"
  },
  {
    "input": "帮我问一下小王今天能不能上线",
    "expected": { "workflowKey": "general", "taskSubtype": "relay" },
    "reason": "转述/问人属于 relay"
  }
]
```

原则：每次线上误判都必须补充样本。

### 13.10 防漂移机制

| 机制 | 作用 |
|---|---|
| enum 白名单 | 不允许产生未知 workflow |
| rule id | 每个判断都有来源 |
| priority 显式化 | 不靠代码顺序 |
| candidate + arbiter | 冲突可解释 |
| regression corpus | 防止修 A 坏 B |
| semantic 只做辅助 | 防止模型漂移 |
| feature flag | 支持 shadow / on / off 灰度 |

### 13.11 迁移策略

不允许一次性替换。必须分阶段：

```text
1. shadow mode：oldResult 生效，newResult 旁路运行并记录 diff
2. regression corpus：历史误判和核心场景全部入测试
3. feature flag 灰度：INTENT_CLASSIFIER_V2=off/shadow/on
4. 旧入口保留 30 天：task-classifier.js 作为 facade
```

上线前必须确认：

```text
old/new diff 可观测
高频误判样本已覆盖
强规则不被 semantic 覆盖
classification latency 不显著增加
```

---

## 14. 最终目标

最终形态不是一个更复杂的 pipeline，而是：

```text
薄 Brain Kernel
强 Harness
可插拔 Workflow
可控长期记忆
严格 token 预算
可逐步淘汰兼容层
```

判断标准：

```text
新增一个 workflow，不需要改 pipeline 主干
新增一个 channel，不需要改 workflow
新增一种输出形式，不需要改 planning
新增长期记忆，不会导致 prompt 爆炸
兼容逻辑可定位、可测试、可删除
```
