# PRD Workflow — 与本仓库的衔接说明（v2）

> **更新**：2026-04-25  
> 本文档是**短衔接说明**，不承载可执行门禁全文。

## 真源（Runtime）

本仓库 PRD 类任务的**唯一执行真源**为：

- **[`.cursor/rules/prd-workflow.mdc`](../../.cursor/rules/prd-workflow.mdc)** — PRD Runtime Skill（状态机、Agent 分工、强制结尾、评审闭环、回退规则）

执行时以该 `.mdc` 为准；**不要**用本文件代替 Runtime。

**多独立 Agent**：Brief / Outline / Writer / Review 的实质产出须在 `.mdc` 中通过 **`Task(readonly:true)`** 子代理完成；主会话仅作 Workflow 编排与机械落盘（详见 `.mdc` 内「执行模型」）。

## 落盘与校验

| 产物 | 路径 |
|------|------|
| Brief | `docs/prd/_brief-{topic}.md` |
| PRD 正文 | `docs/prd/{topic}-prd.md` |
| 工作流状态（一行） | `docs/prd/_state-{topic}.md`（`prd_workflow_state=<枚举>`） |
| 自动评审记录 | `docs/prd/_review-{topic}.md` |

存在 `docs/prd/*-prd.md` 且与 Brief 绑定时，应执行：

- `npm run verify:prd-gates`（主入口，`scripts/verify-prd-gates.py`：Brief + `outline_status` + `_state` + `outline_status=frozen` 时的 `_review`）
- `npm run verify:prd-brief`（兼容别名，内部转调同一脚本）

CI：`.github/workflows/prd-gates.yml` 在变更 `docs/prd/**` 或门禁脚本时运行上述校验。

## 与全局 Skill 的关系（可选）

若本机仍存在 `~/.cursor/skills/prd-workflow/SKILL.md`，视为**跨项目通用副本**。与 `.mdc` 冲突时，**以本仓库 `.cursor/rules/prd-workflow.mdc` 为准**。

## 演进

流程变更时同步更新 `.mdc` 与本文件日期；重大治理变更仍遵循 `workflow-evolution-policy.md`（若适用）。
