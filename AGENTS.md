# AGENTS.md — feishu-bridge

> 飞书 WS → OpenClaw Gateway。AI 编码助手理解本项目的入口。

---

## 项目定位

飞书消息通过 WebSocket 长连接进入本机 Node 服务，经 pipeline 编排后，由 **`openclaw gateway call`** 调用远端 OpenClaw 网关（`chat.send` → `agent.wait` → `chat.history`），将助手回复回传飞书。
本仓库为独立 Node.js 进程，排障以本服务与 `/etc/feishu-ws-cursor-bot.env` 为准。

**运维约定（唯一主目录）**：本机以 **`/opt/feishu-bridge`** 为唯一权威代码与 git 工作区；systemd 的 `WorkingDirectory` 与 `FEISHU_BRIDGE_ROOT` 均指向此处。不要在 `/root/feishu-bridge` 另起副本，以免改错目录、线上不生效。

---

## 技术栈

| 层 | 技术 |
|---|------|
| 运行时 | Node.js (CommonJS) |
| 飞书 SDK | @larksuiteoapi/node-sdk（WebSocket 长连接） |
| 执行 | OpenClaw CLI（`gateway call`）+ 远端 Gateway |
| 部署 | Linux systemd（`feishu-ws-cursor-bot.service`） |
| 配置 | 环境变量（`/etc/feishu-ws-cursor-bot.env` + `.secret`） |

---

## 核心链路

```
飞书消息
  → @larksuiteoapi WSClient (feishu-ws-cursor.js)
    → bridge-host (lib/feishu-channel/bridge-host.js)
      → pipeline-v2 (lib/feishu-cursor/pipeline-v2.js)
      → runOpenclawGatewayPrompt (lib/openclaw-gateway-adhoc.js)
        → openclaw gateway call chat.send / agent.wait / chat.history
        → structured result normalization
```

---

## 目录结构

```
feishu-bridge/
├── feishu-ws-cursor.js         # 兼容入口：仅启动 Feishu bridge host
├── lib/
│   ├── feishu-channel/
│   │   ├── bridge-host.js          # 渠道宿主装配；旧 bridge 兼容层
│   │   ├── plugin-runtime.js       # 渠道运行时装配（sender/parser/media/reply）
│   │   └── models/                 # 渠道中立协议（FeishuTaskEnvelope）
│   ├── openclaw-gateway-adhoc.js  # OpenClaw 网关 RPC
│   ├── openclaw-control-plane/    # 向 OpenClaw 控制平面迁移的中间层
│   │   ├── intent-router.js       # 意图分类 / doc export 意图
│   │   ├── policy-engine.js       # relay / safety / prompt 规划
│   │   ├── execution-broker.js    # runner + dispatch 规划
│   │   ├── request-planner.js     # 控制平面门面
│   │   ├── result-policy.js       # 结果策略（如 doc export 判定）
│   │   ├── structured-result.js   # 结构化结果协议归一化
│   │   └── session-dispatch.js    # session / idempotency / dispatch 语义
│   ├── run-reply-format.js        # stdout/stderr → 飞书正文
│   ├── feishu-cursor-route.js  # 路由规则（direct/prefix、白名单、profile 决策）
│   ├── feishu-im-parse.js      # WS 消息体解析
│   ├── feishu-tenant.js        # 飞书 API（发消息、reaction、bot info）
│   ├── feishu-session-memory.js # 会话记忆
│   ├── feishu-chain-next.js    # 执行完后的链式动作
│   ├── feishu-docx-export.js   # 调研/报告 → 飞书云文档导出
│   ├── feishu-at-context.js    # @提及 上下文注入
│   ├── feishu-group-at-bot.js  # 群聊 @bot 过滤
│   ├── feishu-quoted-parent-context.js  # 引用消息上下文
│   ├── feishu-reply-timing.js  # 回复耗时标注
│   └── feishu-cursor/          # 模块化 pipeline v2
│       ├── pipeline-v2.js      # 主编排（dedup → parse → route → media → classify → run → reply）
│       ├── config/             # 环境变量集中解析
│       ├── policies/           # 路由、安全、分类、relay、prompt 策略
│       ├── task-builders/      # 任务上下文构建 + 媒体处理
│       ├── runner/             # 任务队列
│       ├── memory/             # 会话记忆门面
│       ├── outbound/          # ACK 发送
│       ├── models/            # 数据模型（task-context, classification, result）
│       └── observability/     # 遥测
├── scripts/                    # 飞书浏览器读取、文档导出、健康检查等
├── deploy/
│   ├── feishu-ws-cursor-bot.service      # systemd unit
│   └── feishu-ws-cursor-bot.env.example  # 环境变量模板
├── test/                        # node --test 单测
└── docs/                        # 架构文档、PRD、方案设计
```

---

## Pipeline v2 处理流程

`lib/feishu-cursor/pipeline-v2.js` 仍是当前链路的核心编排，但正在收敛为“渠道宿主 + 控制平面门面”的过渡实现：

1. **Dedup** — 120s message_id 去重
2. **Parse** — 解析 WS payload（文本/图片/语音/文件/合并转发）
3. **Routing** — direct/prefix 模式判断 + 白名单检查
4. **Group @bot** — 群聊需 @机器人才触发（可配）
5. **Echo** — 跳过自己发的消息
6. **Merge debounce** — 合并转发去抖 + 聚合
7. **Media** — 图片描述、语音转文字、文件提取、视频/贴纸处理
8. **Task extract** — prefix 去掉、任务文本规范化
9. **Quoted parent** — 引用消息上下文拼接
10. **@ context** — @人 open_id 注入
11. **Control-plane facade** — `openclaw-control-plane/*` 负责 classify / broker；紧随 **`workflow-execution-policy.js`**（`taskSize`、`multiAgentRequired`、`decisionReason`、Research `forcedRuntimeV2`）为 specialized 执行定型并驱动 V2 强制启用
12. **Relay** — 确定性回复短路（不走网关）
13. **Session memory** — 会话记忆组装
14. **ACK** — reaction 或文本确认
15. **Run** — taskQueue → OpenClaw `chat.send` / `agent.wait` / `chat.history`
16. **Structured result** — 归一化 runId / summary / artifacts / reply hints
17. **Post-process** — timing 标注、relay 清洗、doc export、reply、memory persist、chain-next

---

## Profile（prompt 侧）

路由规则（`feishu-cursor-route.js` → `resolveCursorAgentProfile`）仍决定 **fast / full** 等 prompt 与分类行为；**实际模型与工具**由 OpenClaw 网关上的 agent 配置决定。

---

## 关键环境变量

| 变量 | 说明 |
|------|------|
| `OPENCLAW_GATEWAY_URL` | 必填，如 `ws://10.x.x.x:31721` |
| `OPENCLAW_GATEWAY_TOKEN` | 若网关启用 token 鉴权 |
| `OPENCLAW_BIN` | `openclaw` 可执行文件绝对路径（systemd 下建议设置） |
| `FEISHU_CURSOR_TRIGGER_ENABLED` | `1` 才处理消息 |
| `FEISHU_CURSOR_MODE` | `direct` \| `prefix` |
| `FEISHU_CURSOR_ALLOWED_CHAT_IDS` | 白名单（direct 模式建议设置） |
| `FEISHU_LARK_DOMAIN` | `feishu` \| `lark` |
| `CURSOR_ADHOC_TIMEOUT_SEC` | 网关侧等待超时（秒，默认 600） |
| `FEISHU_CHANNEL_RUNTIME_MODE` | `legacy-bridge` \| `plugin-native`，决定 session/idempotency namespace |
| `OPENCLAW_FEISHU_SESSION_NAMESPACE` | 可选；飞书桥在网关上的会话前缀段（与 `chatId` 组合），多入口共享网关时防串台 |
| `FEISHU_REPLY_USAGE_FOOTER` | 默认 `1`：成功回复后在正文后追加一行 `模型·token·模型·token`（用量优先从 `chat.history` 的 assistant `usage` 解析）；token 默认按 **万**；`0` 关闭 |
| `FEISHU_REPLY_USAGE_SKIP_WHEN_EMPTY` | `1`：仍解析不到任何用量/模型时**不**追加该行；未设时无数据会追加占位行 |
| `FEISHU_REPLY_USAGE_TOKENS_UNIT` | 未设或 `wan`：token 显示为 **万**（÷10000）；`k`：千（÷1000） |
| `FEISHU_REPLY_USAGE_TOKENS_RAW` | `1`：token 用整数，不缩写 |
| `CURSOR_AGENT_FULL_MODEL` | 建议设置；网关 history 常把编排/执行标成同一 `model` 时，用于脚注**右侧**执行模型展示（与真实 Cursor CLI 模型对齐） |
| `FEISHU_REPLY_USAGE_EXECUTOR_MODEL` | 可选；覆盖上一行，仅用于脚注右侧模型名 |

完整列表见 `deploy/feishu-ws-cursor-bot.env.example` 和 `lib/feishu-cursor/config/load-feishu-cursor-config.js`。

---

## MCP 工具

在 Cursor / OpenClaw 工作区中可配置以下 MCP 服务（与飞书桥进程独立）：
- **lark-doc** — 读取飞书云文档/Wiki/表格/白板
- **cursor-ide-browser** — 浏览器自动化
- **figma** — Figma 设计稿读写

### 飞书权限与「建文档」易混点（请默认记住）

- **lark-doc MCP 只有读接口**，没有「创建云文档」工具；飞书里让 Agent「建文档」却做不到，常见原因是 **工具能力边界 + 流水线分类**，不是「没申请权限」。
- **本机生产应用**已通过 `node scripts/feishu-docx-export-selftest.js` 验证 **docx 创建 API 可用**（与机器人共用 `/etc/feishu-ws-cursor-bot.env` + secret）。用户强调「权限已全开」时，**不要**把「先去开放平台勾选权限」当作第一假设；应查 `FEISHU_CLOUD_DOC_EXPORT`、`exportKind`、pipeline 日志。
- **自动落云文档**由 `lib/feishu-docx-export.js` + `pipeline-v2` 在 **助手回复之后**执行，且需命中 **调研/报告类关键词**（`lib/feishu-cursor-route.js` 的 `isResearchLikeTask` / `isReportLikeTask`，例如含「飞书文档」「在线文档」「输出报告」「导出到飞书」等）。仅说「写一段文字」而未命中上述规则时不会创建 docx。
- **本地 Markdown → 飞书云文档（一次性新建）**：`node scripts/export-md-to-feishu-docx.js [path.md] [--title ...] [--folder <folder_token>]`（需 `source /etc/feishu-ws-cursor-bot.env` 等提供租户凭证；默认 `docs/aix-ai-chatbot-plan-v2.md`）。依赖 `lib/feishu-docx-markdown.js` 的块类型与开放平台枚举一致（如分割线为 `block_type` 22）。

### 开放平台「全部权限」与本文档的关系

- 开发者后台里「能勾选的权限」清单**会随飞书产品更新**，本仓库**不逐条镜像**控制台上的每一个 scope 名称（避免过期、误导）。
- 若你已在后台 **开通与本应用相关的全部能力**（或按官方建议全选业务所需项），对排查而言等价于：**下面各 API 域所需的权限已具备**。若某条 API 仍返回 `code`/权限类错误，再对照该域在控制台中的**具体 scope 名称**（以飞书开放平台当前文档为准）。
- **本仓库 Node 侧实际会打到的开放接口域**（与是否「全部勾选」对齐时，请保证这些域可调用）：

| 能力域 | 典型用途 | 主要代码 |
|--------|----------|----------|
| `auth` | `tenant_access_token` | `lib/feishu-tenant.js` |
| `bot` | 机器人 `open_id` 等 | `lib/feishu-tenant.js` |
| `im` | 发消息、拉消息、表情、图片/文件资源 | `lib/feishu-tenant.js`、`lib/feishu-media.js`、`feishu-ws-cursor.js` 等 |
| `docx` | 创建文档、列块、写入块、读正文/块（云文档导出与读取） | `lib/feishu-docx-export.js`、`lib/feishu-tenant.js`、`lib/feishu-online-doc.js` |
| `wiki` | 通过 wiki token 解析节点、读挂载文档 | `lib/feishu-online-doc.js` |
| `sheets` / `bitable` | 读电子表格、多维表格（若启用相关能力） | `lib/feishu-online-doc.js` |
| `board` | 读白板节点/导出图（若启用相关能力） | `lib/feishu-online-doc.js`、`lib/feishu-whiteboard-write.js`（写路径若使用） |

- **MCP `lark-doc`** 使用的读文档/表/白板能力，同样需要上述对应 **只读类** scope；**创建云文档**不经过 MCP，由上表 `docx` + 流水线完成。

---

## 飞书完全无回复时（优先排查）

1. **服务是否在跑**：`systemctl is-active feishu-ws-cursor-bot` 应为 `active`。
2. **跑的是否为最新代码**：`deploy/feishu-ws-cursor-bot.service` 的 `WorkingDirectory` 为 **`/opt/feishu-bridge`**；改代码、拉代码、跑测试均在本目录完成，改完重启 `feishu-ws-cursor-bot` 后线上即生效。
3. **本机自检**（在机器人所在机、与 systemd 相同 env）：
   ```bash
   cd /opt/feishu-bridge
   npm run selfcheck
   ```
4. **前缀模式**：默认 `FEISHU_CURSOR_MODE=prefix`，须以 `FEISHU_CURSOR_TRIGGER_PREFIX`（默认 `/figma`）开头，例如：`/figma 你好`。或改为 `FEISHU_CURSOR_MODE=direct` 后重启服务。
5. **群聊**：默认需 **@机器人**；否则消息会被静默丢弃。
6. **卡片发不出**：试 `FEISHU_REPLY_MESSAGE_FORMAT=text` 排除交互卡片/富文本构建问题。
7. **看日志**：`journalctl -u feishu-ws-cursor-bot -n 100 --no-pager`，搜 `feishu-tenant`、`openclaw`、`pipeline error`。

---

## systemd 服务

```bash
# 状态检查
systemctl status feishu-ws-cursor-bot

# 重启
sudo systemctl restart feishu-ws-cursor-bot

# 日志
journalctl -u feishu-ws-cursor-bot --no-pager -n 50

# OpenClaw CLI / 网关（PATH 须含 Node 22+）
command -v openclaw && openclaw gateway status
```

---

## 编码约束

### 运行时
- **Node.js + CommonJS**（`require`/`module.exports`，非 ESM）
- 不使用 TypeScript（纯 .js）
- 不使用 Bun

### 飞书卡片输出限制
回复通过飞书消息/卡片展示，有严格限制：
- 卡片 JSON 最大 **30KB**（约 3500-4000 中文字）
- Markdown 表格单张卡片最多 **5 个**
- 超长内容系统硬截断

**策略**：干活不限量，汇报要精炼。详细内容写到文件，回复只给摘要和路径。

### 测试
- 使用 `node --test` 内置测试框架
- 测试文件在 `test/*.test.js`
- 运行：`npm test` 或 `node --test test/`

### 安全红线
- 禁止硬编码密钥/Token
- 禁止日志输出用户敏感信息
- 禁止将 `.env`/`.secret` 提交 Git
- 对外操作（飞书 API 调用、systemd 操作）需谨慎

---

## 修改代码前必读

1. 理解当前是“兼容 bridge host + 控制平面门面”的中间态，不要把目标态当已完成
2. 新的渠道逻辑优先进入 `lib/feishu-channel/`，新的策略逻辑优先进入 `lib/openclaw-control-plane/`
3. `FEISHU_CHANNEL_RUNTIME_MODE` 已影响 session/idempotency；改动该语义必须同步测试
4. 执行路径：`lib/openclaw-gateway-adhoc.js` 与 OpenClaw 官方排障文档
5. 改动策略模块时先读对应 `test/*.test.js`
6. 涉及部署/服务/密钥时走 `risky-change-gate` skill
