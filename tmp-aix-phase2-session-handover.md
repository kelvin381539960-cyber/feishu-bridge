# AIX Phase 2 — 会话接力（Session Handover）

> 最后更新：2026-04-04（本文件曾缺失，由当前会话根据仓库状态重建）

## 1. 目标与范围

- **BRD 来源**：飞书/Lark `[BRD] AIX Phase 2`（仓库内有抓取快照：`tmp-aix-phase2.json`、`tmp-aix-phase2-api.json`）。
- **交付物主线**：`docs/aix-phase2/solution-design/` 概要设计 — 分章 `chapters/*.md`，合并输出 `solution-design.md` / `solution-design.html`（**勿手改合并稿**，改分章后跑装订脚本）。

## 2. 当前完成度（见 `progress.yaml`）

| 章节 | 状态 |
|------|------|
| 01–07 | `locked` |
| 08 关键设计决策 | `review`（待业务/合规/安全拍板后再改 `locked`） |

## 3. 图稿与脚本

- **架构/账户**：`diagrams/ecosystem-overview-v0.1.drawio`、`diagrams/account-structure-overview-v0.1.drawio`
- **Flow 1–13**：`diagrams/flows/flow-*-v0.x.drawio`（Flow 1 已到 v0.2，其余 v0.1）；Flow1 可由 `scripts/generate-flow1-business.py` 生成/维护 XML
- **回家电脑续作说明**：`docs/aix-phase2/solution-design/CONTINUE-ON-HOME-PC.md`

## 4. 最近环境动作（2026-04-04）

- 已执行：`bash scripts/assemble-solution-design.sh` → 已刷新 `solution-design.md` 与 `solution-design.html`。

## 5. 建议的下一步（按优先级）

1. **第八章拍板**：组织评审 `chapters/08-decisions.md`（D1–D8），将已定结论写入正文（可选：每项增加「状态：已确认 / 待确认」与负责人）；通过后把 `progress.yaml` 中 `08-decisions` 改为 `locked` 并 commit。
2. **图稿与正文对齐**：若 draw.io 有变更，同步更新 `chapters/03-architecture.md` 等处的文字说明。
3. **对外导出**：需要 Word 时在本机/CI 执行 `bash scripts/solution-design-export-docx.sh`（依赖 LibreOffice 等，见脚本说明）。
4. **BRD 增量**：若 Lark 上 BRD 有更新，重新抓取并核对概要设计是否需增补章节（如新市场或新 Vendor）。

## 6. 关键路径命令

```bash
cd /opt/feishu-bridge
bash scripts/assemble-solution-design.sh
```

（首次需：`python3 -m venv .venv-aix-doc && .venv-aix-doc/bin/pip install -r scripts/aix-doc-requirements.txt`）

---

*若你有一份更完整的旧版接力正文，可粘贴覆盖本文件「5. 建议的下一步」以外的段落，以免丢失历史结论。*
