# AIX Phase 2 概要设计方案 — 工作目录

## 直观看正文（推荐）

- **分章编辑**：`chapters/*.md` — 在 Cursor 里就是普通 Markdown，**没有满屏 HTML 标签**，和看 Plan 类似。
- **一篇通读**：`solution-design.md` — 由脚本**自动合并**各章，**不要手改**（改了也会被下次装订覆盖）。
- **印刷级排版 / 导出 Word**：`solution-design.html` — 由脚本从 `.md` 生成，用 **Live Preview** 看；**不要长期手改**。

## 环境（一次性）

在仓库根目录执行：

```bash
python3 -m venv .venv-aix-doc
.venv-aix-doc/bin/pip install -r scripts/aix-doc-requirements.txt
```

## 日常命令

```bash
bash scripts/assemble-solution-design.sh
```

会更新同目录下的 `solution-design.html` 与 `solution-design.md`。

**Mermaid 图稿（HTML）**：`solution-design.html` 在页尾加载 **Mermaid 10**（jsDelivr CDN），并把装订生成的 `<pre><code class="language-mermaid">` 自动换成可渲染节点。Flow 1 同时含 **结构图（flowchart）** 与 **时序图（sequenceDiagram）** 两块。打开 HTML 时需能访问外网以拉取脚本；若离线，需自行改 `partials/foot.html` 为本地 `mermaid` bundle。可选自检：`python3 scripts/verify-solution-design-mermaid.py`（校验前两图为 Flow 1 双图并尝试 mmdc 渲染；依赖 `npx` 与 Chromium，root 需 `--no-sandbox`，脚本内已配）。

然后：

- 想**舒服阅读**：打开 `solution-design.md`，用 Markdown 预览（或只看分章 `.md`）。
- 想**漂亮排版 / 给老板 HTML 感**：打开 `solution-design.html` → Live Preview。
- 要 **Word**：`bash scripts/solution-design-export-docx.sh`。

也可用 Cursor 任务：**Run Task →「AIX: Assemble solution-design.html」**（会调用上述脚本）。

## 其它路径

| 路径 | 作用 |
|------|------|
| `diagrams/*.drawio` | 图（手工确认后再改正文里的引用）；**Flow 1** 已改为 `chapters/05-money-flows.md` 内嵌 **Mermaid**，不再维护单独 drawio |
| `progress.yaml` | 章节状态 draft / review / locked |
| `card-activation-swimlane-prd.html` | 卡激活 PRD 附件 |
| `partials/` | 全页 HTML 头尾与样式（少动） |
| `scripts/assemble-solution-design.py` | 装订逻辑（Markdown → HTML） |

## Markdown include（可选，独立工具）

仓库根目录：

```bash
python3 scripts/render_markdown_includes.py --input 入口.md --output 输出.md
# 或
bash scripts/render_markdown_includes.sh --input 入口.md --output 输出.md
```

在任意 `.md` 中写单行指令：路径相对于**含有该指令的文件**所在目录；若以 `/` 开头则按**绝对路径**读取。

```markdown
<!-- include: chapters/03-architecture.md -->
<!-- include: /etc/absolute/path/snippet.md -->
```

脚本会把指令替换为目标文件正文，支持嵌套 include 与环检测；**默认不接入** `assemble-solution-design.sh`。若要先展开再装订，请自行对中间稿运行本脚本后再接装订流程。
