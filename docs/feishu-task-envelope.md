# FeishuTaskEnvelope 协议

本文件定义方案 B 落地中的 **渠道侧统一任务信封**。目标不是一次性替代全部运行时对象，而是先把飞书渠道输出稳定成一个可迁移、可测试、可被 OpenClaw 消费的中立形态。

当前实现文件：

- `lib/feishu-channel/models/feishu-task-envelope.js`

---

## 设计目标

`FeishuTaskEnvelope` 只表达 **飞书渠道事实**，不直接承载完整控制平面决策。

它解决三个问题：

1. 把飞书消息从“散落字段”收敛成统一结构
2. 让 Feishu plugin 与 OpenClaw control plane 之间有明确边界
3. 为未来切换到 OpenClaw 原生 Feishu channel 提供稳定输入协议

---

## 当前字段

```js
{
  source: "feishu",
  sourceMessageId,
  sourceChatId,
  sourceThreadKey,
  messageType,
  rawMessage,
  sender,
  media,
  mentions,
  text,
  task,
  userTask,
  normalizedTask,
  replyTarget: {
    channel: "feishu",
    chatId,
    messageId,
    parentId,
    messageType,
  },
  classification,
  safety,
  runner,
  channelConstraints: {
    runtimeMode,
    groupRequireAtBot,
    routingMode,
    routingPrefix,
    fullTaskPrefixes,
  },
  timestamps: {
    receivedAtMs,
    messageCreateTimeMs,
  },
}
```

---

## 字段分层说明

### 渠道事实字段

这些字段属于 Feishu plugin：

- `source`
- `sourceMessageId`
- `sourceChatId`
- `sourceThreadKey`
- `messageType`
- `rawMessage`
- `sender`
- `media`
- `mentions`
- `text`
- `replyTarget`
- `channelConstraints`
- `timestamps`

### 控制平面回填字段

这些字段可以由 OpenClaw control plane 在后续阶段继续填充：

- `task`
- `userTask`
- `normalizedTask`
- `classification`
- `safety`
- `runner`

这类字段保留在信封内，是为了让切流期间能同时承载“渠道事实”和“控制平面派生结果”，便于灰度比较。

---

## 不该塞进信封的内容

以下内容不应继续作为 Feishu plugin 私有逻辑隐含存在：

- `isResearchLikeTask` 的正则细节
- `isReportLikeTask` 的业务判定
- `resolveCursorAgentProfile` 的执行器偏好
- relay 任务的最终处理策略
- docx 导出触发判定
- queue / permission / cleanCwd 的平台策略

这些都应由 OpenClaw control plane 负责。

---

## 当前使用位置

当前代码中，`FeishuTaskEnvelope` 已用于：

- 统一构建 OpenClaw 执行上下文
- 生成稳定 `sessionId` / `idempotencyKey`
- 作为切分 Feishu plugin 与 control plane 的边界对象

对应文件：

- `lib/feishu-cursor/pipeline-v2.js`
- `lib/openclaw-control-plane/session-dispatch.js`

当前 `runtimeMode` 已有真实行为差异：

- `legacy-bridge` -> `feishu:<chatId>`
- `plugin-native` -> `feishu-plugin:<chatId>`

可选环境变量 `OPENCLAW_FEISHU_SESSION_NAMESPACE`（经配置进入 `runtimeConfig.openclawFeishuSessionNamespace`）会在上述片段中再插入一层，例如 `feishu:<namespace>:<chatId>`，用于同一 OpenClaw 网关上多入口隔离。

对应的 idempotency namespace 也随之变化，用于灰度切流时避免串台。

---

## 后续演进方向

### 阶段 1（当前已完成）

`FeishuTaskEnvelope` 主要作为本仓库内部边界对象使用，且已驱动 session/idempotency 语义。

### 阶段 2（进行中）

OpenClaw 的 Feishu channel plugin 直接输出 `FeishuTaskEnvelope` 或同等中立对象。

### 阶段 3（目标态）

OpenClaw control plane 不再依赖本仓库的独立 bridge，只消费该协议。

---

## 验收标准

当满足以下条件时，说明协议设计基本稳定：

1. 飞书消息接收、回复、引用、群聊规则、附件处理不依赖 pipeline 内部散落字段
2. OpenClaw dispatch 可以只依赖 envelope 构建 session / idempotency / reply target
3. 插件层与控制平面新增字段不会相互污染
