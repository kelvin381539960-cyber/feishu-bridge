# Feishu Plugin 切流 Runbook

本 runbook 对应方案 B 的后半段：从“独立厚 bridge”切向“OpenClaw 原生 Feishu channel/plugin”。

目标不是一次性删掉 bridge，而是可灰度、可回滚地切流。

---

## 相关 feature flag

当前仓库新增了：

- `FEISHU_CHANNEL_RUNTIME_MODE=legacy-bridge|plugin-native`

当前默认值：

- `legacy-bridge`

说明：

- `legacy-bridge`：保持旧主链路，session namespace 为 `feishu:<chatId>`
- `plugin-native`：进入插件化准备态，session namespace 为 `feishu-plugin:<chatId>`

注意：当前版本的 `plugin-native` 仍是中间态实现，主要用于边界稳定、埋点、文档化与后续 OpenClaw 接入，而不是已经完全替代 bridge 的最终形态。它现在已经具备真实的 session / idempotency 隔离，可用于双路径灰度。

---

## 环境变量模板

在 `deploy/feishu-ws-cursor-bot.env.example` 中建议补充：

```bash
# 渠道运行模式
# legacy-bridge：默认
# plugin-native：方案 B 灰度切流准备态
# FEISHU_CHANNEL_RUNTIME_MODE=legacy-bridge
```

---

## 切流前检查清单

### 渠道侧

- 飞书 App 权限齐全
- `bot/v3/info` 正常
- `tenant_access_token` 正常
- 群聊 `@bot` 规则已验证
- 引用消息可正常取回
- 图片 / 文件 / 语音可下载

### OpenClaw 侧

- `OPENCLAW_GATEWAY_URL` 可达
- `openclaw gateway status` 正常
- `chat.send -> agent.wait -> chat.history` 正常
- sessionKey 与 idempotencyKey 规则确认

### 业务能力侧

- relay 任务
- report/research 分类
- docx 导出
- memory persist
- 多轮会话

---

## 当前已具备的切流前提

- `feishu-ws-cursor.js` 已缩成兼容入口
- `lib/feishu-channel/bridge-host.js` 作为现阶段渠道宿主
- `openclaw-control-plane` 已承接 intent / policy / broker / result protocol 门面
- 网关返回已可在桥侧归一化为结构化结果

## 灰度步骤

### 第 1 步：文档与契约对齐

先确认以下文件已更新并达成团队共识：

- `docs/feishu-task-envelope.md`
- `docs/feishu-channel-plugin-boundaries.md`
- `docs/current-architecture-vs-coze-openclaw.md`

### 第 2 步：开启中间态运行标识

在灰度环境设置：

```bash
FEISHU_CHANNEL_RUNTIME_MODE=plugin-native
```

然后观察日志中的 channel runtime mode 标识，确认：

- 任务信封正确构建
- OpenClaw dispatch 使用稳定 session / message / idempotency 语义

### 第 3 步：跑高风险场景回归

必须覆盖以下场景：

1. 群聊 `@bot`
2. 引用父消息
3. merge-forward
4. 图片 / 文件 / 语音
5. relay 短路
6. research/report
7. 云文档导出
8. 多轮会话记忆

建议逐条记录：

- 输入消息
- 预期分类
- 预期执行器
- 预期回复形态
- 实际结果

### 第 4 步：双路径对比

在切到 OpenClaw 原生 plugin 之前，保留一个短期双路径对照期：

- `legacy-bridge`
- `plugin-native`

比较以下指标：

- 触发成功率
- 重复消息率
- docx 导出成功率
- 附件处理成功率
- relay 误判率
- 平均回复时长

### 第 5 步：正式切流

当原生 Feishu plugin 已进入 OpenClaw 后：

- 飞书只接 OpenClaw 的 plugin
- 旧 `feishu-ws-cursor` 只保留回滚入口
- 观察 1-3 天
- 再决定是否彻底下线旧进程

---

## 回滚方案

若出现以下任一问题，应立即回滚：

- docx 导出显著失败
- 群聊 `@bot` 触发错误
- 附件处理失效
- 多轮会话明显退化
- 重复回复 / 漏回复

### 回滚动作

1. 环境变量切回：

```bash
FEISHU_CHANNEL_RUNTIME_MODE=legacy-bridge
```

2. 重启服务

```bash
sudo systemctl restart feishu-ws-cursor-bot
```

3. 记录回滚时的：

- 输入样例
- 日志片段
- OpenClaw gateway 状态
- Feishu App 事件情况

---

## 下线清单

只有以下条件都满足，才允许下线独立厚 bridge：

1. OpenClaw 原生 Feishu plugin 已持有飞书连接
2. 任务信封协议已稳定
3. 分类/路由/prompt/runner/docx/memory 已迁入 OpenClaw
4. docx 导出与附件处理能力不退化
5. 已完成至少一个灰度窗口验证

---

## 建议的验收指标

### 功能指标

- 飞书接收成功率 >= 旧链路
- 回复成功率 >= 旧链路
- docx 导出成功率 >= 旧链路
- 附件处理成功率 >= 旧链路

### 稳定性指标

- 不出现重复回复
- 不出现明显会话串台
- 不出现 idempotency 失效

### 架构指标

- 新增业务规则不再进入 `lib/feishu-cursor-route.js`
- `pipeline-v2.js` 不再继续变厚
- OpenClaw 成为唯一控制平面
