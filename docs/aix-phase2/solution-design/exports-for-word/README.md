# 供 Word / 飞书 等粘贴的导出图

命名规则：**`flow-NN-<英文主题>--<用途>.png|svg`**

| 文件 | 对应章节 |
|------|----------|
| `flow-02-card-application-and-issuance.mmd` | 源 Mermaid（与 `chapters/05-money-flows.md` Flow 2 同步时请手改或重跑脚本） |
| `flow-02-card-application-and-issuance--for-word.png` | 高分辨率 PNG，适合插入 Word |
| `flow-02-card-application-and-issuance--for-word.svg` | 矢量图，Word 2016+ 可插入，放大不糊 |

重新生成 PNG/SVG（仓库根目录，默认渲染本目录下的 Flow 2）：

```bash
bash scripts/render-flow-export.sh
# 或指定任意 .mmd：
bash scripts/render-flow-export.sh docs/aix-phase2/solution-design/exports-for-word/flow-02-card-application-and-issuance.mmd
```
