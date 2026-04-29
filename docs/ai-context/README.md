# AI Context Entry

> 本文档是 GPT / Codex / Cursor / Agent 阅读本仓库时的入口文件。目标是让 AI 在处理任务前先获得稳定上下文，避免误读历史产物、导出文件、实验代码或无关文档。

---

## 1. Repository Purpose

本仓库是 `feishu-bridge`：飞书消息通过 WebSocket 进入本机 Node.js 服务，经 pipeline 编排后调用 OpenClaw Gateway，再将结果回传飞书。

当前核心演进方向：

1. 稳定飞书消息入口与 OpenClaw Gateway 调用链路。
2. 改造 Cursor / OpenClaw / Agent 的工作流与治理体系。
3. 建立可追踪的任务计划、执行记录、上下文包、审核门禁与回滚机制。
4. 让 AI 产出 PRD、调研、方案、代码时具备稳定流程，而不是一次性黑盒输出。

---

## 2. Mandatory Reading Order

处理任何任务前，优先按以下顺序读取：

| 顺序 | 文件 / 目录 | 目的 |
|---:|---|---|
| 1 | `AGENTS.md` | 项目总入口、运行约束、核心链路、部署约定 |
| 2 | `docs/ai-context/README.md` | AI 阅读规则与任务入口 |
| 3 | `package.json` | 运行脚本、依赖、项目类型 |
| 4 | `feishu-ws-cursor.js` | 飞书 WebSocket 兼容入口 |
| 5 | `lib/feishu-channel/bridge-host.js` | 渠道宿主装配入口 |
| 6 | `lib/feishu-cursor/pipeline-v2.js` | 当前主 pipeline 编排 |
| 7 | `lib/openclaw-gateway-adhoc.js` | OpenClaw Gateway 调用实现 |
| 8 | `lib/openclaw-control-plane/request-planner.js` | 控制平面门面 |
| 9 | `lib/openclaw-control-plane/workflow-execution-policy.js` | 工作流执行策略 |
| 10 | `docs/cursor-architecture/` | 工作流、治理、多 Agent、上下文治理设计资料 |

如果任务是文档治理、PRD、调研或方案设计，再读取：

| 场景 | 优先读取 |
|---|---|
| PRD 工作流 | `docs/cursor-architecture/prd-workflow.md`、`docs/prd/` |
| Research 工作流 | `docs/cursor-architecture/multi-agent/research.md`、`docs/research/` |
| Solution 工作流 | `docs/cursor-architecture/multi-agent/solution.md` |
| 多 Agent 治理 | `docs/cursor-architecture/multi-agent/` |
| Gate / Review / Trace | `docs/cursor-architecture/multi-agent/gate-rules.md`、`run-trace-schema.md` |
| Workflow 体系升级 | `docs/cursor-architecture/generic-workflow.md`、`workflow-evolution-policy.md`、`workflow-governance-overview.md` |

---

## 3. Default Skip List

默认不要优先读取以下内容，除非任务明确要求：

| 路径 / 类型 | 原因 |
|---|---|
| `docs/aix-phase2/solution-design/docx-mermaid-assets/` | 渲染产物，非源文档 |
| `docs/aix-phase2/solution-design/exports-for-word/` | Word / 飞书导出图产物，非源文档 |
| `*.png`、`*.jpg`、`*.jpeg` | 图片资产，通常不利于代码/工作流理解 |
| `*.docx` | 二进制文档，默认不作为 AI 首读材料 |
| `crawl_output/` | 临时爬虫输出，若存在则默认跳过 |
| 带 `backup`、`historical`、`ARCHIVED` 的文件 | 历史版本，除非做差异追溯 |
| `kids-learning-app/` | 实验/示例性质，和 feishu-bridge 主链路无关 |
| `generate_veggie_plan.py`、`hello.py` | 独立实验脚本 |
| `test.txt`、`test-perm.txt` | 权限/临时测试文件 |

原则：先读源文件和治理文件，再读导出物；先读当前版本，再读历史版本。

---

## 4. Task Classification

收到任务后，先判断任务类型，再决定读取范围：

| 类型 | 判断标准 | 优先动作 |
|---|---|---|
| Bug Fix | 用户描述线上异常、无回复、报错、失败 | 读入口、pipeline、相关日志/策略、最小改动 |
| Feature Change | 用户要求新增能力或修改流程 | 读相关模块、策略文件、测试文件，先写方案再改 |
| Workflow / Governance | 涉及 Cursor、Harness、PM Agent、Task List、Context Pack、Gate、Trace | 先读 `docs/cursor-architecture/`，再设计数据结构和执行链路 |
| PRD / Research / Solution | 需要生成或改造产品文档 | 读对应 workflow 文档、模板、历史样例 |
| Cleanup | 删除、归档、整理文档 | 先输出候选清单，不直接删核心源文件 |
| Deployment / Ops | systemd、env、OpenClaw Gateway、飞书权限 | 读 `AGENTS.md`、`deploy/`、`scripts/*selfcheck*` |

---

## 5. Current Design Direction

当前不应把系统简单理解为“飞书机器人”。更准确的目标结构是：

```text
Feishu Message
  -> Channel Runtime
  -> Pipeline v2
  -> Control Plane
  -> Workflow Policy
  -> Task / Context Pack / Execution Broker
  -> OpenClaw Gateway / Cursor / Agent Runtime
  -> Structured Result
  -> Reply / Doc Export / Memory / Trace
```

后续治理改造重点：

1. **PM Agent / Planner**：把用户请求拆成任务计划。
2. **Task List**：所有步骤显式登记，可追踪、可暂停、可审查。
3. **Context Pack**：每个任务只带必要上下文，降低污染。
4. **Executor Agent**：按任务类型执行 PRD、Research、Solution、Code、Review。
5. **Gate**：关键节点必须通过规则检查。
6. **Run Trace**：记录谁做了什么、输入是什么、输出是什么、是否通过。
7. **Result Policy**：决定回复、导出、落文档、是否进入下一步。

---

## 6. Modification Rules

修改代码或文档前遵守以下规则：

1. 不要硬编码密钥、Token、Cookie、tenant secret。
2. 不要提交 `.env`、`.secret` 或生产凭证。
3. 不要假设 `/root/feishu-bridge` 是主目录；生产权威目录按 `AGENTS.md`：`/opt/feishu-bridge`。
4. 改 pipeline 前，必须同时检查相关 policy、task builder、runner、control-plane 文件。
5. 改 workflow / governance 前，先确认是否已有 `docs/cursor-architecture/` 相关设计，避免重复造概念。
6. 删除文件前先判断：源文件、生成物、历史备份、实验文件。不要误删当前源文档。
7. 每次修改后输出：改动范围、影响链路、测试建议、回滚方式。
8. 对风险较高的修改，优先新增文档或测试，再改运行代码。

---

## 7. Output Expectations

AI 给出结果时应尽量使用以下结构：

```text
1. 结论
2. 我读取了哪些文件
3. 当前判断
4. 建议方案
5. 影响范围
6. 下一步操作
7. 风险 / 回滚
```

代码改动类任务还应补充：

```text
- 修改文件列表
- 核心 diff 摘要
- 需要运行的测试命令
- 未覆盖风险
```

---

## 8. Do Not Overfit Historical Artifacts

仓库中存在历史方案、导出文档、图形产物、实验代码和旧版本备份。AI 不应把这些内容自动视为当前设计。

判断当前权威内容时，优先级如下：

```text
AGENTS.md
> docs/ai-context/*
> docs/cursor-architecture/*
> 当前 lib/ 源码
> deploy/ 与 scripts/selfcheck
> docs/prd、docs/research 当前文档
> archive / backup / historical
> generated exports / images / docx
```

---

## 9. Immediate Next Documents

本文件只负责 AI 阅读入口。后续建议继续补充：

```text
docs/ai-context/workflow-governance-map.md
docs/ai-context/implementation-roadmap.md
docs/ai-context/task-entrypoints.md
```

其中：

- `workflow-governance-map.md`：定义 Cursor / Harness / Agent / Task List / Context Pack / Gate / Trace 的关系。
- `implementation-roadmap.md`：定义从当前系统演进到治理化工作流的阶段计划。
- `task-entrypoints.md`：定义不同任务类型应读取哪些文件、调用哪些流程。
