#!/usr/bin/env python3
"""
自检 solution-design.html 中的 Mermaid：
1) HTML 已内嵌 Mermaid 运行时（foot 脚本）
2) 提取所有 language-mermaid 代码块
3) 若本机有 npx，对所有图块分别调用 mmdc 渲染 SVG（验证语法）
"""
from __future__ import annotations

import html
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
HTML_PATH = REPO / "docs/aix-phase2/solution-design/solution-design.html"


def extract_mermaid_blocks(page: str) -> list[str]:
    blocks = re.findall(
        r'<pre><code class="language-mermaid">(.*?)</code></pre>',
        page,
        re.DOTALL,
    )
    return [html.unescape(b).strip() for b in blocks]


def main() -> int:
    if not HTML_PATH.is_file():
        print(
            "FAIL: 缺少 solution-design.html，请先执行: bash scripts/assemble-solution-design.sh",
            file=sys.stderr,
        )
        return 1

    page = HTML_PATH.read_text(encoding="utf-8")

    if "mermaid.esm" not in page and "mermaid.run" not in page:
        print("FAIL: HTML 未包含 Mermaid ESM 运行时（检查 partials/foot.html）", file=sys.stderr)
        return 1

    blocks = extract_mermaid_blocks(page)
    if not blocks:
        print("FAIL: 未找到任何 language-mermaid 代码块", file=sys.stderr)
        return 1

    print(f"OK: 已嵌入 Mermaid 运行时；共发现 {len(blocks)} 个 Mermaid 代码块")

    with tempfile.TemporaryDirectory() as tmp:
        td = Path(tmp)
        pcfg = td / "puppeteer.json"
        pcfg.write_text(
            '{"args":["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"]}\n',
            encoding="utf-8",
        )
        try:
            for i, src in enumerate(blocks):
                # 尝试识别图表类型和标题（如果有）
                chart_type = "unknown"
                if "flowchart" in src: chart_type = "flowchart"
                elif "sequenceDiagram" in src: chart_type = "sequenceDiagram"
                elif "gantt" in src: chart_type = "gantt"
                elif "classDiagram" in src: chart_type = "classDiagram"
                elif "stateDiagram" in src: chart_type = "stateDiagram"
                elif "pie" in src: chart_type = "pie"
                elif "erDiagram" in src: chart_type = "erDiagram"

                label = f"block-{i:02d}-{chart_type}"
                mmd = td / f"{label}.mmd"
                svg = td / f"{label}.svg"
                mmd.write_text(src + "\n", encoding="utf-8")
                
                print(f"Checking {label}...", end=" ", flush=True)
                r = subprocess.run(
                    [
                        "npx",
                        "-y",
                        "@mermaid-js/mermaid-cli@10.9.0",
                        "-p",
                        str(pcfg),
                        "-i",
                        str(mmd),
                        "-o",
                        str(svg),
                    ],
                    cwd=str(REPO),
                    capture_output=True,
                    text=True,
                    timeout=180,
                )
                if r.returncode != 0:
                    print(f"\nFAIL: mmdc 渲染失败 ({label})", file=sys.stderr)
                    print(r.stderr or r.stdout, file=sys.stderr)
                    return 1
                if not svg.is_file() or svg.stat().st_size < 100:
                    print(f"\nFAIL: 输出 SVG 异常 ({label})", file=sys.stderr)
                    return 1
                print(f"OK ({svg.stat().st_size} bytes)")
        except FileNotFoundError:
            print("SKIP: 未找到 npx，跳过 mmdc 语法渲染校验")
            return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
