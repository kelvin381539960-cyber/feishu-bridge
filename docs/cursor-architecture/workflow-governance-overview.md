# Workflow Governance Overview

> 来源：`草稿/AI工作流_Cursor迁入执行基线 .xlsx`（最终洁净版）
> 仓库唯一权威：本文件 + `lib/feishu-cursor/contracts/` + `lib/feishu-cursor/workflows/workflow-registry.js` + `scripts/{verify-workflow-gates,research-gate,code-gate,solution-gate}.py`

## 1. 五类 Workflow（最终白名单）

仓库执行主体只允许以下 5 类 `workflowKey`，禁止再引入任何其他 workflow：

| workflowKey | 角色 | 用途 | Contract | Gate（Python） |
|---|---|---|---|---|
| `prd` | specialized | 产品需求文档 | `lib/feishu-cursor/contracts/prd.contract.js` | `scripts/verify-prd-gates.py` |
| `research` | specialized | 调研 / 报告 | `lib/feishu-cursor/contracts/research.contract.js` | `scripts/research-gate.py` |
| `code` | specialized | 编码 / 排障 / 部署 / 运维 | `lib/feishu-cursor/contracts/code.contract.js` | `scripts/code-gate.py` |
| `solution` | specialized | 方案设计（5 模式：`feasibility` / `roadmap` / `plan` / `release` / `growth`） | `lib/feishu-cursor/contracts/solution.contract.js` | `scripts/solution-gate.py` |
| `general` | fallback | 兜底；不与 specialized 抢占 | `lib/feishu-cursor/contracts/general.contract.js` | `scripts/verify-workflow-gates.py` 内联 |

> 任何不在上表的 `workflowKey` 一律由 `lib/feishu-cursor/runtime/pipeline-gate-adapter.js` 兜底为 `general`，并在 telemetry 中记录 `pipeline_gate_violation`。

## 2. 双轨字段：workflowKey + taskSubtype

`task-classification` 同时产出两条字段：

- **`workflowKey`** ∈ 上表 5 类。**contracts / registry / gate / docs 的唯一只读字段。** 出现治理决策只引用它。
- **`taskSubtype`** ∈ `interactive_card / sheet_write / sheet_read / resource_read / workflow_audit / relay / report_export / none`。**pipeline-v2 / runner-selector / route-policy / docx-export 等渠道能力**继续读它，避免破坏既有交互卡 / 飞书表格 / 飞书云文档导出 / 短路 relay 等成熟链路。
- 旧 `taskType` 字段保留为 `taskSubtype`（subtype ≠ none 时）或 `workflowKey`（subtype = none 时）的 alias，回归期内不删；新代码禁止再读 `taskType`。

映射真源：`lib/feishu-cursor/policies/task-classifier.js` 的 `WORKFLOW_META`。

## 3. 治理硬约束

| 项 | 规则 |
|---|---|
| 禁止字面量 | 任何 `taskType` / `workflowKey` / `mode` 出现 `qa` / `debug` / `P0` / `P2` / `custom_mode` / `legacy_mode` 视为 residue，由 `scripts/scan-governance-residue.sh` 在 CI 阶段扫出并阻断。 |
| Gate 硬启用 | `pipeline-gate-adapter` 在 pipeline-v2 中无条件执行；不保留任何 `FEISHU_WORKFLOW_GOVERNANCE_ENABLED` 之类长期开关；违规 fail-closed 兜底 general，不静默放行。 |
| Reviewer 门 | `solution` 的 `L`/`XL` 必须有 reviewer 留痕（`runtime/run-trace-recorder.js` 的 `reviewerRecords`），否则 Gate 拒绝。 |
| Code execute 授权门 | `code.execute` 模式无 `executionAuthorization` 时由 `code-gate.py` 直接拒绝（详见 `multi-agent/code.md`）。 |
| 子 Agent 越权 | `multi-agent-runtime-guards.js` 的 `enforceCurrentAgentRole` 自校验 `currentAgentRole`，禁止子 Agent 跨身份代写。 |

## 4. xlsx 已知矛盾的处置

- xlsx **sheet 41** 提到 `research.contract.js` 为「fallback / 兼容」**作废**；以 sheet 47 / 99 为准：`research` 是 specialized 工作流，与 PRD/Code/Solution 同级。
- xlsx 写到 `reference/docs/` 的 5 份多 Agent 文档，统一改放 `docs/cursor-architecture/multi-agent/`。
- xlsx 提到的 `tests/runtime-smoke-tests.md` 改为 `scripts/runtime-smoke-tests.js` (CLI 入口) + `test/runtime-smoke-tests.test.js`（`node --test` 守护）。

## 5. 校验入口（npm scripts）

| 命令 | 作用 |
|---|---|
| `npm test` | `node --test` 全量回归（含 contracts / registry / runtime / 双轨 classifier / pipeline-gate-adapter / gates）。 |
| `npm run smoke:runtime` | 运行 runtime 13 项 smoke。 |
| `npm run verify:workflow` | 跑 `scripts/verify-workflow-gates.py` 统一调度。 |
| `npm run verify:research` / `verify:code` / `verify:solution` | 三个专用 gate 的 stdin 入口（CI 可直连）。 |
| `npm run scan:residue` | 扫描主体代码 / 文档残留治理 residue（qa / debug / P0 / P2 / 旧 mode）。 |

## 6. 文档导航

- `multi-agent/intake.md` — 进入闸 + 双轨分类 + Gate 兜底。
- `multi-agent/prd.md` — PRD 工作流（与 `.cursor/rules/prd-workflow.mdc` 互为索引）。
- `multi-agent/research.md` — Research 工作流（clarify → execute）。
- `multi-agent/code.md` — Code 工作流（inspect / execute + 授权门）。
- `multi-agent/solution.md` — Solution 工作流（5 模式 + 任务规模 + Reviewer 门）。
