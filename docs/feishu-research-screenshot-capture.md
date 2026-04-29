# 调研配图：批量截图服务（可选）

飞书桥 **pipeline 内不跑浏览器**，避免阻塞 WebSocket。批量网页截图由 **独立 HTTP 服务** 提供，供 OpenClaw 网关侧 agent（或本机 `curl`）调用。

## 依赖

```bash
cd /opt/feishu-bridge
npm install playwright   # 若未装
npx playwright install chromium
```

## 启动

```bash
node scripts/feishu-research-screenshot-server.js
```

环境变量：

| 变量 | 默认 | 说明 |
|------|------|------|
| `FEISHU_SCREENSHOT_SERVER_PORT` | `17654` | 监听端口 |
| `FEISHU_SCREENSHOT_MAX_CONCURRENCY` | `2` | 并发页数 |
| `FEISHU_SCREENSHOT_TIMEOUT_MS` | `45000` | 单 URL 导航超时 |

## API

### `POST /capture`

请求体 JSON：

```json
{
  "urls": ["https://example.com", "https://open.feishu.cn"],
  "viewport": { "width": 1280, "height": 720 }
}
```

成功 `200`：

```json
{
  "ok": true,
  "results": [
    { "url": "https://example.com", "ok": true, "pngBase64": "..." },
    { "url": "https://open.feishu.cn", "ok": false, "error": "timeout" }
  ]
}
```

### `GET /health`

返回 `{ "ok": true, "playwright": true }` 或 `playwright: false`（未安装依赖时）。

## 与调研工作流配合

1. Crawler agent 收集公开产品页 URL。
2. 调用本服务批量生成 PNG（base64）；或由 agent 将 PNG 上传对象存储后，在 Markdown 中引用 **HTTPS 图链**。
3. 飞书云文档当前 Markdown 管线以文本块为主；图进 docx 需后续「图片块 + 素材上传」能力。在此之前，聊天/文档中保留 **原页面链接 + 截图 URL** 即可。

## 安全

- 仅绑定 `127.0.0.1`；不要对公网暴露。
- 对 URL 做白名单或长度限制（可按需在脚本中扩展）。
