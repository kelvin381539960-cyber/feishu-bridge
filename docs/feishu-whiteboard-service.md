# Feishu Whiteboard Service

这套能力现在按“云端常驻服务”方式部署，不再依赖某台开发机的临时脚本和临时回调页。

## 组成

- 共享写入库：`lib/feishu-whiteboard-write.js`
- 用户态 token 管理：`lib/feishu-user-token.js`
- HTTP 服务：`scripts/feishu-whiteboard-service.js`
- CLI 兼容入口：`scripts/feishu-whiteboard-write-final.js`
- 固定重放命令：`scripts/feishu-whiteboard-replay.sh`

## 部署位置

- 机器：当前云主机
- 用户：建议与现有 `feishu-bridge` systemd 用户一致，默认 `root`
- 工作目录：`/opt/feishu-bridge`

## 环境文件

先在云主机上复制：

```bash
sudo cp /opt/feishu-bridge/deploy/feishu-whiteboard.env.example /etc/feishu-whiteboard.env
```

重点变量：

- `FEISHU_WHITEBOARD_PORT`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET_FILE`
- `FEISHU_WHITEBOARD_DEFAULT_ID`
- `FEISHU_WHITEBOARD_REDIRECT_URI`
- `FEISHU_WHITEBOARD_TOKEN_STORE`
- `FEISHU_WHITEBOARD_SERVICE_TOKEN`

## systemd

在云主机上：

```bash
sudo cp /opt/feishu-bridge/deploy/feishu-whiteboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now feishu-whiteboard
```

## Nginx

如果后续补 Nginx / HTTPS，把这些路径反代到白板服务。

- `/feishu-whiteboard/oauth/callback`
- `/feishu-whiteboard/replay`
- `/feishu-whiteboard/health`

参考文件：

- `deploy/nginx-feishu-bridge.conf.example`

## 首次授权

浏览器打开：

```text
https://accounts.larksuite.com/open-apis/authen/v1/authorize?client_id=<FEISHU_APP_ID>&redirect_uri=<URL_ENCODED_REDIRECT_URI>&scope=board%3Awhiteboard%3Anode%3Acreate%20offline_access&state=whiteboard_write
```

回调成功后：

- `refresh_token` 会落到 `FEISHU_WHITEBOARD_TOKEN_STORE`
- 后续 replay 不再需要每次重新拿 `code`

## 固定命令

云主机上执行预检：

```bash
cd /opt/feishu-bridge
bash scripts/feishu-whiteboard-replay.sh --dry-run
```

云主机上执行真实写入（首次仍可传一次 `oauth_code`）：

```bash
cd /opt/feishu-bridge
bash scripts/feishu-whiteboard-replay.sh <oauth_code>
```

说明：

- 授权成功并落盘后，可直接无参执行：

```bash
cd /opt/feishu-bridge
bash scripts/feishu-whiteboard-replay.sh
```

- 这条固定命令默认走本机 `http://127.0.0.1:8088/feishu-whiteboard/replay`
- 如果未来接入别的白板，可临时覆盖 `WHITEBOARD_ID`

## HTTP 接口

- `GET /feishu-whiteboard/health`
- `GET /feishu-whiteboard/authorize`
- `GET /feishu-whiteboard/oauth/callback`
- `POST /feishu-whiteboard/replay`

`POST /feishu-whiteboard/replay` 示例：

```json
{
  "whiteboardId": "S5yWwgo0dhkrCIb1qNZlBvs3gwg",
  "dryRun": false
}
```
