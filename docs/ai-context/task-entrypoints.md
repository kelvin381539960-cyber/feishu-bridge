# Task Entrypoints

> 本文档定义不同任务类型下，GPT / Codex / Cursor / Agent 应该优先读取哪些文件、采用什么执行路径、是否需要 Task List / Context Pack / Gate。目标是减少随机读取和黑盒执行。

---

## 1. General Rule

所有任务先读取：

```text
AGENTS.md
docs/ai-context/README.md
```

如果任务涉及工作流、治理、Harness、Agent、Task List、Context Pack、Gate、Trace，则继续读取：

```text
docs/ai-context/workflow-governance-map.md
docs/ai-context/implementation-roadmap.md
docs/ai-context/task-entrypoints.md
```

默认跳过：

```text
*.png
*.jpg
*.jpeg
*.docx
backup / historical / ARCHIVED
crawl_output/
docs/aix-phase2/solution-design/docx-mermaid-assets/
docs/aix-phase2/solution-design/exports-for-word/
```

---

## 2. Entrypoint Matrix

| 任务类型 | 是否需要 Task List | 是否需要 Context Pack | 是否需要 Gate | 首读文件 |
|---|---:|---:|---:|---|
| 简单问答 | no | no | no | `AGENTS.md`、`docs/ai-context/README.md` |
| Bug Fix | maybe | yes | yes | 入口文件 + 相关源码 + 测试 |
| Feature Change | yes | yes | yes | 入口文件 + 相关模块 + policy |
| Workflow / Governance | yes | yes | yes | `docs/ai-context/*` + `docs/cursor-architecture/*` |
| Harness / Execution Boundary | yes | yes | yes | governance docs + deploy/scripts |
| PRD Generation | yes | yes | output gate | PRD workflow + docs/prd |
| Research | yes | yes | research gate | research workflow + docs/research |
| Solution Design | yes | yes | solution gate | solution workflow + architecture docs |
| Code Review | maybe | yes | review gate | changed files + tests + policy |
| Cleanup / Delete | yes | yes | cleanup gate | file list + AI skip rules |
| Deployment / Ops | yes | yes | security gate | AGENTS + deploy + selfcheck scripts |

---

## 3. Simple Answer

### 判断标准

- 用户只问概念、解释、对比、建议。
- 不需要读大量文件。
- 不需要写仓库。

### 执行路径

```text
User Request
  -> Answer
```

### 禁止动作

- 不创建文件。
- 不提交 commit。
- 不启动复杂工作流。

---

## 4. Bug Fix

### 判断标准

用户描述：

- 飞书不回复。
- OpenClaw 调用失败。
- Cursor 任务执行异常。
- WebSocket 连接异常。
- 某个脚本报错。

### 必读文件

```text
AGENTS.md
docs/ai-context/README.md
package.json
feishu-ws-cursor.js
lib/feishu-channel/bridge-host.js
lib/feishu-cursor/pipeline-v2.js
lib/openclaw-gateway-adhoc.js
scripts/feishu-bridge-selfcheck.js
scripts/runtime-smoke-tests.js
```

视情况读取：

```text
lib/feishu-cursor/policies/*
lib/openclaw-control-plane/*
test/
deploy/*.service
```

### 执行路径

```text
classify bug
  -> identify failing path
  -> read minimal files
  -> propose cause
  -> patch minimal file
  -> run / suggest test
  -> summarize diff and rollback
```

### Gate

- Code Gate
- Security Gate if env / token / deployment involved
- Review Gate before delivery

---

## 5. Feature Change

### 判断标准

用户要求新增能力、修改已有流程、改变输出格式、调整策略。

### 必读文件

```text
AGENTS.md
docs/ai-context/README.md
package.json
lib/feishu-cursor/pipeline-v2.js
lib/feishu-cursor/policies/*
lib/feishu-cursor/task-builders/*
lib/openclaw-control-plane/*
test/
```

### 执行路径

```text
User Request
  -> PM creates small plan
  -> identify affected modules
  -> define Context Pack
  -> patch
  -> test / gate
  -> summarize
```

### Gate

- Intake Gate
- Context Gate
- Code Gate
- Review Gate

---

## 6. Workflow / Governance

### 判断标准

用户提到：

```text
Cursor 工作流
治理
PM Agent
Task List
Context Pack
Gate
Run Trace
Harness
多 Agent
OpenClaw 调度
```

### 必读文件

```text
docs/ai-context/README.md
docs/ai-context/workflow-governance-map.md
docs/ai-context/implementation-roadmap.md
docs/ai-context/task-entrypoints.md
docs/cursor-architecture/README.md
docs/cursor-architecture/generic-workflow.md
docs/cursor-architecture/workflow-evolution-policy.md
docs/cursor-architecture/workflow-governance-overview.md
docs/cursor-architecture/multi-agent/
```

视情况读取：

```text
lib/openclaw-control-plane/request-planner.js
lib/openclaw-control-plane/workflow-execution-policy.js
lib/feishu-cursor/task-builders/task-context-builder.js
lib/feishu-cursor/runtime/run-trace-recorder.js
lib/feishu-cursor/runtime/pipeline-gate-adapter.js
```

### 执行路径

```text
User Request
  -> Current-state check
  -> Governance plan
  -> Task List
  -> Context Pack
  -> document first
  -> code later
```

### Gate

- Intake Gate
- Context Gate
- Output Gate
- Review Gate

### 默认策略

先输出方案或文档，不直接改核心 pipeline。

---

## 7. Harness / Execution Boundary

### 判断标准

用户要求：

- 限制 Agent 行为。
- 控制可运行命令。
- 控制读写目录。
- 执行自动化任务。
- 做 sandbox / allowlist / denylist。

### 必读文件

```text
docs/ai-context/workflow-governance-map.md
docs/ai-context/implementation-roadmap.md
AGENTS.md
deploy/
scripts/*selfcheck*
scripts/runtime-smoke-tests.js
```

视情况读取：

```text
lib/openclaw-control-plane/*
lib/feishu-cursor/runtime/*
```

### 执行路径

```text
Define execution boundary
  -> command allowlist
  -> write scope
  -> timeout policy
  -> failure handling
  -> trace integration
```

### Gate

- Security Gate
- Code Gate
- Review Gate

### 默认策略

Harness 只控制“怎么执行”，不负责“做什么”。

---

## 8. PRD Generation / Update

### 判断标准

用户要求生成或修改 PRD、需求文档、验收标准。

### 必读文件

```text
docs/ai-context/README.md
docs/cursor-architecture/prd-workflow.md
docs/cursor-architecture/multi-agent/prd.md
docs/prd/
```

视情况读取：

```text
docs/research/
docs/cursor-architecture/context/*
```

### 执行路径

```text
Intake
  -> clarify goal if needed
  -> gather existing artifacts
  -> create PRD brief
  -> draft PRD
  -> review gate
  -> write / return output
```

### Gate

- Output Gate
- Review Gate

---

## 9. Research

### 判断标准

用户要求调研、竞品分析、事实收集、方案依据。

### 必读文件

```text
docs/ai-context/README.md
docs/cursor-architecture/multi-agent/research.md
docs/research/
```

视情况读取：

```text
docs/cursor-architecture/context/*
scripts/research-gate.py
```

### 执行路径

```text
Research goal
  -> source plan
  -> gather evidence
  -> synthesize
  -> research gate
  -> output report
```

### Gate

- Research Gate
- Output Gate

---

## 10. Solution Design

### 判断标准

用户要求系统方案、架构、流程、技术边界、模块设计。

### 必读文件

```text
docs/ai-context/README.md
docs/cursor-architecture/multi-agent/solution.md
docs/cursor-architecture/generic-workflow.md
docs/cursor-architecture/workflow-governance-overview.md
lib/openclaw-control-plane/*
lib/feishu-cursor/*
```

视情况读取：

```text
docs/aix-phase2/solution-design/solution-design.md
```

### 执行路径

```text
Goal
  -> current-state analysis
  -> target architecture
  -> module boundaries
  -> phased implementation
  -> risk and rollback
```

### Gate

- Solution Gate
- Review Gate

---

## 11. Code Review

### 判断标准

用户要求看代码质量、找 bug、看 PR、评审架构。

### 必读文件

```text
Changed files
Related tests
AGENTS.md
docs/ai-context/README.md
Relevant policy files
```

### 执行路径

```text
Read changed files
  -> identify risk
  -> check tests
  -> summarize issues by severity
  -> suggest patch if needed
```

### Gate

- Review Gate
- Code Gate if patching

---

## 12. Cleanup / Delete

### 判断标准

用户要求删除、归档、整理、减少上下文污染。

### 必读文件

```text
docs/ai-context/README.md
docs/ai-context/task-entrypoints.md
full file list
```

### 优先删除候选

```text
crawl_output/
*.tmp
明显测试文件
导出产物
backup / historical / ARCHIVED
无关 demo
```

### 禁止直接删除

```text
AGENTS.md
docs/ai-context/*
package.json
feishu-ws-cursor.js
lib/**
deploy/**
scripts/*selfcheck*
当前源文档
```

### 执行路径

```text
List candidates
  -> classify risk
  -> get user approval
  -> delete low-risk files
  -> summarize commits
```

### Gate

- Cleanup Gate

---

## 13. Deployment / Ops

### 判断标准

用户要求部署、服务启动、systemd、nginx、环境变量、飞书配置、OpenClaw Gateway。

### 必读文件

```text
AGENTS.md
deploy/
scripts/feishu-bridge-selfcheck.js
scripts/runtime-smoke-tests.js
package.json
```

视情况读取：

```text
lib/feishu-tenant.js
lib/openclaw-gateway-adhoc.js
```

### 执行路径

```text
Read ops docs
  -> identify environment
  -> suggest commands
  -> safety check
  -> rollback plan
```

### Gate

- Security Gate
- Ops Gate
- Review Gate

---

## 14. Stop Conditions

AI / Agent 必须停止并返回原因，而不是继续猜测：

1. 关键文件读不到。
2. 用户目标与现有治理规则冲突。
3. 需要删除核心源文件但没有明确授权。
4. 需要生产凭证但用户未提供。
5. Gate 失败。
6. 任务范围超过当前 Context Pack。
7. 发现已有文档与代码事实冲突，但无法判断权威版本。

---

## 15. Commit Summary Requirement

凡是写入仓库，必须返回：

```text
- commit sha
- created / updated / deleted files
- why changed
- risk
- next step
```

---

## 16. Recommended Next Step

完成本文件后，下一步应进入：

```text
Phase 1: Current-State Audit
```

建议创建：

```text
docs/ai-context/workflow-current-state.md
```

该文档应先审计现有系统，不直接改代码。
