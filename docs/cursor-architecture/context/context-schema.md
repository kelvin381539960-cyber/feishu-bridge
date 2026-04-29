# Context Schema v1.1

> 权威性：本文件定义 `active-workstreams.md`、`decision-log.md`、`artifact-index.md` 的字段、值域与维护约束。  
> 适用范围：`docs/cursor-architecture/context/*.md`  
> v1.1：`active-workstreams` 将单列 `Owner` 拆为 `Artifact Owner` 与 `Governance Writer`，与 `agent-roles` 双写入者模型对齐。

## 1. 通用规则

1. 日期统一使用 `YYYY-MM-DD`。  
2. ID 使用稳定、可读的全大写或 kebab-case，不依赖行号。  
3. 空值统一写 `-`，不要留空单元格。  
4. 任何替代关系必须显式写入“覆盖/替代”字段。  
5. 除非升级本 schema，否则不得随意增删列或改名。

## 2. `active-workstreams.md`

### 2.1 表头

| 列名 | 必填 | 说明 |
|------|------|------|
| Workstream ID | 是 | 稳定任务流 ID，推荐 kebab-case |
| 名称 | 是 | 面向人类可读的任务名称 |
| 当前阶段 | 是 | 当前所在阶段或治理主题 |
| 状态 | 是 | 仅允许 `planned` / `running` / `blocked` / `completed` / `superseded` |
| 阻塞项 | 是 | 无阻塞写 `-` |
| 下一步 | 是 | 下一条可执行动作，使用动词开头 |
| Artifact Owner | 是 | 业务产物/交付收敛责任人；使用角色标签，如 `prd-owner`、`delivery-executor`、`architecture-owner` |
| Governance Writer | 是 | 治理台账写回责任人，通常为 `governance-owner`；本轮不改 `decision-log` / `artifact-index` 时可写 `-` 并在「下一步」说明原因 |
| 更新时间 | 是 | 最近更新时间，`YYYY-MM-DD` |

### 2.2 更新规则

- 每次阶段切换必须更新 `当前阶段`、`状态`、`下一步`、`更新时间`。  
- 若 `Artifact Owner` 或 `Governance Writer` 发生变更，必须同步更新对应列。  
- 进入阻塞态时必须填写 `阻塞项`。  
- 任务完成后保留条目，不删除历史。

## 3. `decision-log.md`

### 3.1 表头

| 列名 | 必填 | 说明 |
|------|------|------|
| Date | 是 | 决策确认日期 |
| Decision ID | 是 | 稳定决策 ID，如 `D-CTX-003` |
| 决策 | 是 | 决策结论本身 |
| 依据 | 是 | 触发该决策的证据或约束 |
| 影响范围 | 是 | 受影响模块、流程或文件 |
| 覆盖/替代 | 是 | 无则写 `-`；有则写被替代的 Decision ID |
| 状态 | 是 | 仅允许 `active` / `superseded` / `rejected` |
| 记录人 | 是 | 记录该决策的责任人 |

### 3.2 更新规则

- 只有“已确认”决策才入表。  
- 新决策替代旧决策时，必须同时更新新旧两条记录的 `覆盖/替代` 与 `状态`。  
- 暂未确认的讨论不要写入该文件。

## 4. `artifact-index.md`

### 4.1 表头

| 列名 | 必填 | 说明 |
|------|------|------|
| Date | 是 | 产物首次或最近一次入索引日期 |
| Artifact ID | 是 | 稳定产物 ID，如 `A-CTX-SCHEMA` |
| 类型 | 是 | 如 `architecture` / `workflow-design` / `governance` / `qa-report` |
| 路径 | 是 | 仓库相对路径，使用反引号包裹 |
| 来源流程 | 是 | 如 `architecture` / `shared-capability` / `generic-workflow` |
| 关联 Workstream | 是 | 所属工作流 ID，无则写 `-` |
| 状态 | 是 | 仅允许 `active` / `draft` / `superseded` / `archived` |
| 备注 | 是 | 版本、用途或替代关系说明 |

### 4.2 更新规则

- 只记录关键产物，不记录临时 scratch 文件。  
- 新版本替代旧版本时，新旧两条都要保留，并更新 `状态` 和 `备注`。  
- 路径必须可直接在仓库中定位。
