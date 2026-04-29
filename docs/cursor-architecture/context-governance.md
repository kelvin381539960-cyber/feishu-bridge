# Context Governance v1.1

> 跨会话上下文与产物索引的 Git 原生方案。与 `README.md` §6.2、`context/context-schema.md` 配套使用。  
> 运行时技能入口：`~/.cursor/skills/context-governance/SKILL.md`（若已部署）。

## 1. 目标

- 让后续会话能恢复「做到哪里、阻塞什么、下一步是什么」。
- 让关键产物与已确认决策可被检索，避免双事实源。
- 字段与值域以 `context/context-schema.md` 为唯一权威；本文件描述**流程与约束**，不重复定义列级 schema。

## 2. 受管文件

| 文件 | 作用 |
|------|------|
| `context/context-schema.md` | 字段、值域、升级记录 |
| `context/active-workstreams.md` | 活跃 workstream 行表（v1.1：`Artifact Owner` + `Governance Writer`） |
| `context/decision-log.md` | 已确认决策 |
| `context/artifact-index.md` | 关键产物索引 |

## 3. Load（Workflow Phase 0 前）

1. 读取 `context/context-schema.md`，确认当前 schema 版本与表头约束。  
2. 读取三份索引：`active-workstreams.md`、`decision-log.md`、`artifact-index.md`。  
3. 若某文件缺失：先按 schema 建表头与占位行，再推进任务（与 dry-run 预检一致）。  
4. 若用户新指令与台账冲突：**用户指令优先**，并在 Write-back 中记录覆盖原因（可记入 `decision-log` 或 workstream「阻塞项/下一步」）。

## 4. Write-back（Workflow Phase 4 后或阶段节点）

1. **active-workstreams**：阶段切换时更新 `当前阶段`、`状态`、`阻塞项`、`下一步`、`更新时间`；责任人变更时更新 `Artifact Owner` / `Governance Writer`。  
2. **decision-log**：仅写入**已确认**的架构/流程级决策；替代旧决策时同步更新 `覆盖/替代` 与 `状态`。  
3. **artifact-index**：登记新关键产物或更新被替代条目的 `状态` / `备注`；不登记临时 scratch。

## 5. 与角色模型的关系

- `agent-roles` 要求每轮明确 **artifact owner** 与 **governance writer**；在台账中对应 `active-workstreams` 的 `Artifact Owner` 与 `Governance Writer` 列。  
- 二者可同为一人，但列必须可审计，不得合并为模糊「负责人」。

## 6. 验收与 dry run

- 预检：`context-governance.md`（本文件）、`context-schema.md`、三份索引可读。  
- 详见 `dry-run-plan.md`、`dry-run-checklist.md`。
