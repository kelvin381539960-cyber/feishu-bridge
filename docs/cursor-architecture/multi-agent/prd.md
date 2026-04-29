# PRD Workflow

> Contract：`lib/feishu-cursor/contracts/prd.contract.js`
> Registry：`workflow-registry.js#prd`
> 关联规则：`.cursor/rules/prd-workflow.mdc`（PRD 子 Agent 产线规范）

## 1. 触发与角色

- 触发：`task-classifier` 命中 `PRD_STRONG_RE` / `PRD_ACTION_RE`，或 prefix `/prd`。
- `workflowKey`: `prd`，`role`: `specialized`，`taskSubtype`: `none`。
- 子 Agent 产线（强制）：**Workflow → Brief → Outline → Writer → Review → Workflow**，主会话只负责落盘与 Gate。

## 2. 产物

| 阶段 | 产物 |
|---|---|
| Step 1A | 澄清问题列表（仅出现在对话） |
| Step 1B | `docs/prd/_brief-{topic}.md`（YAML：`brief_status: draft` → `confirmed`） |
| Step 2A | PRD 骨架（仅出现在对话，§1–§8） |
| Step 2B | `docs/prd/{topic}-prd.md`（YAML：`outline_status: frozen`） |
| Step 2C | `docs/prd/_review-{topic}.md` |
| Step 2D | 修订后的 `docs/prd/{topic}-prd.md` |

## 3. PRD 章节锁定（§1–§8）

仅允许下表章节，禁止单独成章 `数据与权限` / `依赖与假设` / `风险与对策` / `里程碑` / `开放问题`：

| 章节 | 用途 |
|---|---|
| §1 | 背景与目标 |
| §2 | 用户与场景 |
| §3 | 功能清单（**表格**：功能点 / 优先级 / 是否本期 / 边界） |
| §4 | 业务规则（含数据 / 权限 / 日志 / 外部依赖） |
| §5 | 关键流程（主 / 分支 / 失败） |
| §6 | 页面与交互 |
| §7 | 异常与失败处理（含风险与合规边界） |
| §8 | 验收标准 |

## 4. Gate

PRD 的文件级 Gate 沿用 `scripts/verify-prd-gates.py`（已存在）：

- Brief 字段完整、`brief_status: confirmed` 后才能进入正文。
- PRD 正文章节须严格匹配 §1–§8。
- Brief 与 PRD 之间的目标 / 功能 / 边界一致性检查。
- 治理 residue：禁止出现 `qa`/`debug`/`P0`/`P2` 字面值。

`pipeline-gate-adapter` 不重复 PRD Gate 的文件级检查；它只在运行时校验 classification 合规。

## 5. 回退矩阵

| 变化 | 回退到 |
|---|---|
| 用户目标变化 | Step 1B（Brief） |
| 功能清单变化 | Step 2A（骨架） |
| 本期做/不做边界变化 | Step 1B |
| 成功标准变化 | Step 1B |
| 新增 / 删除主功能 | Step 2A |
| 新增 / 删除主章节 | Step 2A |
| 风险 / 合规边界变化 | Step 1B |
