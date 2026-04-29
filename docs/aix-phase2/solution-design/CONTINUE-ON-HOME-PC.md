# 回家电脑继续工作 — 最短说明

你在 **SSH 服务器**上的路径是：`/opt/feishu-bridge`。回家有两种接法。

## 方式 A：继续连这台服务器（最省事）

家里电脑装好 Cursor + Remote SSH，用**同一 SSH 账号**连上**同一台主机**，打开文件夹 `**/opt/feishu-bridge`**。  
文件仍在服务器上，**不用拷贝**。

## 方式 B：在家「本地文件夹」离线做文档

1. 在服务器上把打包文件拷到本机（在**你家电脑终端**执行，把 `用户@主机` 换成你的 SSH）：
  ```bash
   scp 用户@你的服务器:/opt/feishu-bridge/feishu-bridge-aix-home-bundle.tar.gz ~/Downloads/
  ```
2. 解压并进入仓库根目录：
  ```bash
   mkdir -p ~/work && cd ~/work
   tar -xzf ~/Downloads/feishu-bridge-aix-home-bundle.tar.gz
   cd feishu-bridge
  ```
3. 装订文档环境（一次性）：
  ```bash
   python3 -m venv .venv-aix-doc
   .venv-aix-doc/bin/pip install -r scripts/aix-doc-requirements.txt
   bash scripts/assemble-solution-design.sh
  ```
4. 用 Cursor **打开** `~/work/feishu-bridge` 文件夹。
  - 改正文：`docs/aix-phase2/solution-design/chapters/*.md`  
  - 通读：`docs/aix-phase2/solution-design/solution-design.md`  
  - 图：`docs/aix-phase2/solution-design/diagrams/`（需装 draw.io 扩展）
5. 导出 Word（本机需装 LibreOffice 或在家用浏览器/HTML 另存）：
  ```bash
   bash scripts/solution-design-export-docx.sh
  ```

## 方式 C：用 Git 同步（推荐长期）

在服务器 `feishu-bridge` 里已经 `git init` 并做过一次提交时：

1. 在 GitHub/GitLab **新建空仓库**（不要勾选初始化 README）。
2. 在服务器上：
  ```bash
   cd /opt/feishu-bridge
   git remote add origin <你的仓库 HTTPS 或 SSH 地址>
   git branch -M main
   git push -u origin main
  ```
3. 家电脑：`git clone <同一地址>` 即可。

> 若仓库在公网，**不要提交**密钥、`.env`、含秘钥的路径说明；当前 `.gitignore` 已排除常见大目录与 `var/`。

### 安全提醒（重要）

历史上若曾把含 **MCP / API Token** 的文件提交进 Git，**推送到公网前**应视为已泄露，在飞书/Lark **轮换 token**。  
本仓库已将 `.cursor/mcp.json` 列入 `.gitignore`；家电脑可拷贝 `.cursor/mcp.json.example` 为 `mcp.json` 再填 token。

## 打包文件在哪

服务器路径：`**/opt/feishu-bridge/feishu-bridge-aix-home-bundle.tar.gz`**（由维护脚本生成；若不存在，在服务器执行一次 `bash scripts/pack-aix-home-bundle.sh`）。