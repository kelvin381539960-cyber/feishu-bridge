# Code Workflow

> Contract：`lib/feishu-cursor/contracts/code.contract.js`
> Registry：`workflow-registry.js#code`
> Runtime Gate：`scripts/code-gate.py`

## 1. 触发与角色

- 触发：`task-classifier` 的 `CODE_RE`（排障 / 修复 / 部署 / 重启 / 安装 / 配置 / 报错 / `systemctl` / `journalctl` / …）或 prefix `/code`。
- `workflowKey`: `code`，`role`: `specialized`，`taskSubtype`: `none`。
- 子 Agent：**Workflow → Coder**（执行型时强制附加 Reviewer）。

## 2. 双模式：inspect / execute

| mode | 含义 | 写盘 / 命令 | 必备字段 |
|---|---|---|---|
| `inspect` | 只读分析、阅读代码、复盘日志 | 禁止 | `findings`（≥ 1）、`evidence` 引用文件路径 |
| `execute` | 修改文件 / 改配置 / 跑命令 / 部署 / 重启 | 允许 | `executionAuthorization`（必须）、`changeSet`（diff 摘要）、`postChecks`（验证步骤） |

> 模式由 contract 推断：明确出现「执行 / 修改 / 重启 / 部署 / 删除 / 安装 …」动词时进入 `execute`，否则保持 `inspect`。

## 3. 授权门（execute 模式）

`scripts/code-gate.py` 拒绝下列 execute payload：

- `executionAuthorization` 缺失或为空字符串。
- `executionAuthorization.scope` 不在 `{file, service, host}` 之一。
- 单步动作影响范围超出 scope（例如声明 `scope: file` 却跑 `systemctl restart`）。
- `changeSet` 为空（声明执行但没改任何东西，视作虚假执行）。
- 输出中出现 secret 字符串（`password=...` / `Bearer ...` / `cli_a9` 之类样式）→ Gate 直接拒绝。

multi-agent-runtime-guards 的 `codeExecuteAuthGuard` 在运行时同样拦截，双重保险。

## 4. 必备产物

| 产物 | inspect | execute |
|---|---|---|
| `summary` | 必填 | 必填 |
| `findings[]` | 必填 | 可选 |
| `changeSet[]` | — | 必填，每条含 `path` / `diffSummary` |
| `postChecks[]` | — | 必填，至少一条可执行验证（如 `systemctl status xxx` / 单测命令） |
| `runtimeTrace.handoffRecords` | 可选 | 必填（Coder → Reviewer） |
| `runtimeTrace.reviewerRecords` | 可选 | 必填 |

## 5. 禁止行为（Gate 检测）

- 伪造执行：`status: success` 但 `changeSet` 为空。
- 角色越权：子 Agent 自称 `Workflow Agent`。
- 跨 scope 操作：未声明 `scope: host` 却尝试改全局服务。
- 残留 residue：`qa` / `debug` / `P0` / `P2` 字面值出现在结构化输出。
