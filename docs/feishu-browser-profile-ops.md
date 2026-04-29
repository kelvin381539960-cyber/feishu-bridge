# Feishu Browser Profile Ops

这套网页登录直连能力部署在云服务器上，核心登录态保存在：

```bash
/root/.feishu-browser-profile
```

## 常用命令

### 1. 健康检查

只检查浏览器 profile 是否还能打开飞书首页：

```bash
/opt/feishu-bridge/scripts/feishu-browser-healthcheck.sh
```

检查一个具体飞书链接是否还能直连：

```bash
/opt/feishu-bridge/scripts/feishu-browser-healthcheck.sh "https://advancegroup.sg.larksuite.com/wiki/..."
```

也可以预先设置默认检查链接：

```bash
export FEISHU_BROWSER_HEALTH_URL="https://advancegroup.sg.larksuite.com/wiki/..."
/opt/feishu-bridge/scripts/feishu-browser-healthcheck.sh
```

### 2. 重新登录 / 通用 OAuth 授权

当健康检查返回 `login_required` 时，重新启动临时 VNC 登录会话：

```bash
/opt/feishu-bridge/scripts/feishu-browser-vnc-login.sh
```

也可以直接打开任意需要人工登录/授权的页面，例如：

```bash
/opt/feishu-bridge/scripts/feishu-browser-vnc-login.sh "https://www.figma.com/login"
```

登录完成后关闭会话：

```bash
/opt/feishu-bridge/scripts/feishu-browser-vnc-stop.sh
```

### 3. 备份 profile

手动备份当前浏览器登录态：

```bash
/opt/feishu-bridge/scripts/feishu-browser-profile-backup.sh
```

默认：

- 备份目录：`/opt/feishu-bridge/var/backups/feishu-browser-profile`
- 保留份数：`7`

可通过环境变量覆盖：

```bash
KEEP_COUNT=14 /opt/feishu-bridge/scripts/feishu-browser-profile-backup.sh
```

## 运维建议

- 换电脑不影响使用，这套能力和登录态都在云上。
- 不要手动删除 `/root/.feishu-browser-profile`。
- 在重置密码、SSO 策略变化、长时间未使用后，优先先跑健康检查。
- 对需要浏览器 OAuth 的服务，优先复用这套 VNC 会话，不要临时在本地做端口回调方案。
- 重要登录完成后，建议执行一次 profile 备份。
