# Workflow Governance Map

> 本文档定义 Cursor / OpenClaw / Harness / PM Agent / Task List / Context Pack / Gate / Trace 之间的治理关系。它不是实现细节文档，而是后续改造工作流前必须先读取的结构地图。

---

## 1. Goal

目标不是单纯把 AI 接到飞书，也不是简单让 Cursor 自动写代码。

目标是把 AI 工作变成一个可管理、可审查、可追踪、可回滚的执行系统：

```text
User Request
  -> Intake
  -> PM Agent / Planner
  -> Task List
  -> Context Pack Builder
  -> Executor Agent / Tool Runner
  -> Gate / Review
  -> Run Trace
  -> Result Policy
  -> Reply / Commit / Document / Next Task
```

核心原则：

1. 所有复杂任务必须先计划，再执行。
2. 所有执行步骤必须登记到 Task List。
3. 每个执行单元只拿必要上下文，不允许无限制读取全仓库。
4. 关键节点必须经过 Gate 检查。
5. 每次执行必须留下 Trace，便于复盘、回滚和追责。
6. Harness 不是替代 PM Agent，而是执行约束和环境边界。

---

## 2. Concept Map

| 概念 | 定位 | 主要职责 | 不负责什么 |
|---|---|---|---|
| Cursor | IDE / Code Agent 宿主 | 读写代码、执行局部实现、配合测试 | 不应独立决定产品目标和全局路线 |
| OpenClaw Gateway | Agent 调用网关 | 接收任务、调用模型/工具、返回结构化结果 | 不负责业务治理本身 |
| Harness | 执行约束层 | 限制工具、目录、命令、权限、输出格式 | 不负责拆任务、不负责业务判断 |
| PM Agent / Planner | 任务主控 | 理解用户目标、拆解任务、制定计划、分派执行 | 不直接写大量代码 |
| Task List | 状态账本 | 记录任务、步骤、Owner、状态、输入、输出、依赖 | 不做推理 |
| Context Pack | 上下文包 | 为单个任务提供最小必要上下文 | 不承载全仓库所有内容 |
| Executor Agent | 执行者 | 按任务类型执行 research / prd / solution / code / review | 不随意扩大任务范围 |
| Gate | 审核门禁 | 检查完整性、安全性、边界、测试、格式 | 不生成主要内容 |
| Run Trace | 执行轨迹 | 记录每步输入、输出、工具、结果、失败原因 | 不替代日志系统全部能力 |
| Result Policy | 结果策略 | 决定输出给用户、写文件、提交代码、进入下一步 | 不修改事实结果 |

---

## 3. Target Architecture

```text
Feishu / CLI / Manual Input
          |
          v
+-------------------+
| Intake Layer       |
| - normalize input  |
| - identify intent  |
| - detect risk      |
+-------------------+
          |
          v
+-------------------+
| PM Agent / Planner |
| - clarify goal     |
| - decompose tasks  |
| - set gates        |
| - assign context   |
+-------------------+
          |
          v
+-------------------+
| Task List          |
| - task graph       |
| - status           |
| - dependencies     |
| - artifacts        |
+-------------------+
          |
          v
+----------------------+
| Context Pack Builder |
| - repo map           |
| - relevant files     |
| - user request       |
| - constraints        |
+----------------------+
          |
          v
+-------------------+
| Executor Layer     |
| - Research Agent   |
| - PRD Agent        |
| - Solution Agent   |
| - Code Agent       |
| - Review Agent     |
+-------------------+
          |
          v
+-------------------+
| Gate / Review      |
| - policy checks    |
| - tests            |
| - risk review      |
| - completeness     |
+-------------------+
          |
          v
+-------------------+
| Result Policy      |
| - reply            |
| - write docs       |
| - commit code      |
| - continue / stop  |
+-------------------+
```

---

## 4. Workflow Levels

### Level 0: Direct Answer

适用场景：简单解释、方案点评、短文本生成。

```text
User Request -> Answer
```

要求：

- 不创建 Task List。
- 不写仓库。
- 不调用重型工作流。

---

### Level 1: Single-Step File Task

适用场景：读取一个文件、修改一个文档、更新一处配置。

```text
User Request
  -> read relevant file
  -> modify / answer
  -> summarize diff
```

要求：

- 可以不创建完整 Task List。
- 必须说明读取文件和修改文件。
- 若写仓库，必须给出 commit。

---

### Level 2: Planned Task

适用场景：PRD、研究、方案、较复杂代码修改。

```text
User Request
  -> Plan
  -> Task List
  -> Context Pack
  -> Execution
  -> Gate
  -> Result
```

要求：

- 必须生成任务计划。
- 每个步骤必须有输入、输出、完成标准。
- 修改前先判断影响范围。

---

### Level 3: Multi-Agent Workflow

适用场景：跨文档、跨代码、跨系统的大任务，例如“重构 Cursor 工作流和治理体系”。

```text
PM Agent
  -> Research Agent
  -> Solution Agent
  -> Code Agent
  -> Review Agent
  -> Gate
  -> Trace
```

要求：

- 必须拆分角色。
- 必须使用 Context Pack。
- 必须保存 Run Trace。
- 必须有中止条件和回滚方案。

---

### Level 4: Harness-Controlled Execution

适用场景：需要真实执行命令、部署、批量改代码、调用外部工具。

```text
Workflow
  -> Harness Policy
  -> Tool Allowlist
  -> Execution Sandbox
  -> Log / Trace
  -> Gate
```

要求：

- 明确可访问目录。
- 明确可运行命令。
- 明确禁止操作。
- 失败必须有可读错误原因。

---

## 5. PM Agent Responsibilities

PM Agent 是工作流主控，不是单纯的聊天角色。

职责：

1. 识别任务类型和风险等级。
2. 判断是否需要计划。
3. 拆分任务步骤。
4. 为每一步定义：输入、输出、完成标准、依赖、Owner。
5. 指定 Context Pack 内容。
6. 指定 Gate 检查规则。
7. 汇总执行结果。
8. 判断继续、暂停、回滚或交付。

PM Agent 不应：

1. 绕过 Task List 直接让 Executor 做复杂任务。
2. 在没有 Context Pack 的情况下让 Agent 读取全仓库。
3. 把用户模糊目标直接转换成大规模代码修改。
4. 忽略 Gate 失败继续推进。

---

## 6. Task List Model

Task List 是黑盒治理的核心。

建议最小字段：

| 字段 | 说明 |
|---|---|
| task_id | 稳定任务 ID |
| parent_id | 父任务 ID，可为空 |
| title | 任务标题 |
| type | research / prd / solution / code / review / cleanup / ops |
| owner | pm / research-agent / prd-agent / code-agent / review-agent |
| status | todo / doing / blocked / review / done / failed / cancelled |
| input | 任务输入摘要 |
| context_pack_id | 使用的上下文包 |
| output_artifact | 输出物路径或结果摘要 |
| gate | 需要通过的检查 |
| risk_level | low / medium / high |
| created_at | 创建时间 |
| updated_at | 更新时间 |

示例：

```json
{
  "task_id": "WG-001",
  "title": "梳理当前 Cursor 工作流现状",
  "type": "research",
  "owner": "research-agent",
  "status": "todo",
  "input": "读取 docs/cursor-architecture 与核心 pipeline 文件，输出现状摘要",
  "context_pack_id": "CP-WG-001",
  "output_artifact": "docs/ai-context/workflow-current-state.md",
  "gate": ["source-cited", "no-code-change"],
  "risk_level": "low"
}
```

---

## 7. Context Pack Model

Context Pack 是每个执行单元的最小上下文载体。

建议字段：

| 字段 | 说明 |
|---|---|
| context_pack_id | 上下文包 ID |
| task_id | 对应任务 ID |
| goal | 本任务目标 |
| must_read | 必读文件列表 |
| may_read | 可选文件列表 |
| skip | 禁止或默认跳过内容 |
| constraints | 约束条件 |
| expected_output | 预期输出 |
| stop_conditions | 中止条件 |

示例：

```json
{
  "context_pack_id": "CP-WG-001",
  "task_id": "WG-001",
  "goal": "梳理当前 Cursor 工作流和治理体系现状",
  "must_read": [
    "docs/ai-context/README.md",
    "docs/cursor-architecture/README.md",
    "docs/cursor-architecture/generic-workflow.md",
    "docs/cursor-architecture/workflow-governance-overview.md"
  ],
  "may_read": [
    "lib/feishu-cursor/pipeline-v2.js",
    "lib/openclaw-control-plane/workflow-execution-policy.js"
  ],
  "skip": [
    "docs/aix-phase2/solution-design/docx-mermaid-assets/",
    "*.png",
    "*.docx"
  ],
  "constraints": [
    "不修改代码",
    "只输出现状摘要和问题列表"
  ],
  "expected_output": "workflow-current-state.md",
  "stop_conditions": [
    "关键文件缺失",
    "发现现有设计与目标冲突但无法判断权威版本"
  ]
}
```

---

## 8. Gate Types

Gate 是防止 AI 乱跑的关键。

| Gate | 适用场景 | 检查内容 |
|---|---|---|
| Intake Gate | 所有复杂任务 | 目标是否明确、是否需要计划、风险等级 |
| Context Gate | 执行前 | Context Pack 是否足够、是否包含禁读内容 |
| Output Gate | 文档/方案输出 | 是否满足格式、是否覆盖问题、是否引用来源 |
| Code Gate | 代码修改 | 是否最小改动、是否影响核心链路、是否有测试建议 |
| Security Gate | 密钥、权限、部署相关 | 是否泄露凭证、是否误改生产路径 |
| Cleanup Gate | 删除/归档 | 是否误删源文件、是否有备份、是否用户明确授权 |
| Review Gate | 交付前 | 是否可以被用户审查、是否列出风险和回滚 |

Gate 失败时：

```text
stop execution
record failure reason
return to PM Agent
ask for revised task / context / plan if needed
```

---

## 9. Harness Positioning

Harness 是执行安全边界，不是工作流大脑。

适合 Harness 管的内容：

1. 可以运行哪些命令。
2. 可以访问哪些目录。
3. 可以写哪些文件。
4. 是否允许联网。
5. 是否允许提交 commit。
6. 输出必须是什么结构。
7. 超时、失败、回滚策略。

不适合 Harness 单独决定的内容：

1. 用户真正要解决什么问题。
2. 产品目标和优先级。
3. 任务如何拆分。
4. 哪个 Agent 应该执行。
5. 什么结果算业务上完成。

关系判断：

```text
PM Agent decides what to do.
Harness controls how execution is allowed to happen.
Gate decides whether result is acceptable.
Trace records what happened.
```

---

## 10. Run Trace Model

Run Trace 用来还原执行过程。

建议字段：

| 字段 | 说明 |
|---|---|
| run_id | 一次运行 ID |
| task_id | 对应任务 |
| actor | pm / executor / reviewer / tool |
| input_summary | 输入摘要 |
| files_read | 读取文件 |
| files_written | 写入文件 |
| tools_used | 使用工具 |
| output_summary | 输出摘要 |
| gate_result | gate 结果 |
| error | 错误信息 |
| started_at | 开始时间 |
| ended_at | 结束时间 |

Run Trace 不一定一开始就做成数据库。第一阶段可以用 markdown / jsonl 保存：

```text
runs/YYYY-MM-DD/<run-id>.jsonl
```

---

## 11. Result Policy

Result Policy 决定执行结果去哪里。

| 结果类型 | 默认处理 |
|---|---|
| 简单回答 | 直接回复用户 |
| 文档草案 | 写入 docs/ 或返回给用户审阅 |
| 代码修改 | 提交 commit，并说明测试建议 |
| 高风险修改 | 先输出方案，不直接改 |
| Gate 失败 | 停止并返回失败原因 |
| 需要用户确认 | 输出明确选项，不继续执行 |

---

## 12. Minimal First Implementation

第一阶段不要直接做复杂 Harness。建议先落最小闭环：

```text
docs/ai-context/README.md
  -> workflow-governance-map.md
  -> implementation-roadmap.md
  -> task-entrypoints.md
```

然后再新增运行态结构：

```text
workflow/
  task-list.schema.json
  context-pack.schema.json
  run-trace.schema.json
  gates/
    intake-gate.md
    context-gate.md
    code-gate.md
    cleanup-gate.md
```

最小运行闭环：

```text
User Request
  -> PM creates Task List
  -> PM creates Context Pack
  -> Executor runs task
  -> Gate reviews result
  -> Trace records outcome
  -> Result Policy decides next step
```

---

## 13. Non-Goals

当前阶段不做：

1. 不直接把所有任务都自动多 Agent 化。
2. 不在没有 Gate 的情况下自动提交大规模代码。
3. 不让 Executor 自己决定读取全仓库。
4. 不把 Harness 当成 PM Agent。
5. 不把所有文档一次性塞进上下文。
6. 不追求一次完成完整平台化，先做可验证闭环。

---

## 14. Next Documents

后续应继续创建：

```text
docs/ai-context/implementation-roadmap.md
docs/ai-context/task-entrypoints.md
```

其中：

- `implementation-roadmap.md`：定义分阶段实施计划。
- `task-entrypoints.md`：定义不同任务类型对应读取文件、创建任务、执行路径。
