#!/usr/bin/env python3
"""
将 solution-design.md 中的 Mermaid 代码块渲染为 PNG，再经 pandoc 导出为带图的 docx。

依赖：pandoc、npx（@mermaid-js/mermaid-cli）
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MD_PATH = REPO / "docs/aix-phase2/solution-design/solution-design.md"
ASSETS_DIR = MD_PATH.parent / "docx-mermaid-assets"
TEMP_MD = MD_PATH.parent / "solution-design.docx-temp.md"
OUT_DOCX = MD_PATH.parent / "solution-design.docx"

MERMAID_BLOCK = re.compile(r"^```mermaid\s*\n(.*?)```", re.DOTALL | re.MULTILINE)

# mmdc 默认 width=800、height=600、scale=1，在 Word 里一拉全屏会非常糊。
# 提高视口 + deviceScaleFactor，再导出 PNG（Word 对嵌入 SVG 兼容性不一，故仍用 PNG）。
MERMAID_VIEWPORT_W = int(os.environ.get("MERMAID_DOCX_WIDTH", "2560"))
MERMAID_VIEWPORT_H = int(os.environ.get("MERMAID_DOCX_HEIGHT", "1920"))
MERMAID_SCALE = int(os.environ.get("MERMAID_DOCX_SCALE", "2"))


def render_mermaid_blocks(md_text: str) -> tuple[str, int]:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    for p in ASSETS_DIR.glob("mermaid-*.png"):
        p.unlink()

    with tempfile.TemporaryDirectory() as tmp:
        td = Path(tmp)
        pcfg = td / "puppeteer.json"
        pcfg.write_text(
            '{"args":["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"]}\n',
            encoding="utf-8",
        )

        parts: list[str] = []
        last = 0
        idx = 0
        for m in MERMAID_BLOCK.finditer(md_text):
            parts.append(md_text[last : m.start()])
            src = m.group(1).strip()
            idx += 1
            png_name = f"mermaid-{idx:02d}.png"
            png_path = ASSETS_DIR / png_name
            mmd = td / f"b{idx}.mmd"
            mmd.write_text(src + "\n", encoding="utf-8")

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
                    str(png_path),
                    "-w",
                    str(MERMAID_VIEWPORT_W),
                    "-H",
                    str(MERMAID_VIEWPORT_H),
                    "-s",
                    str(MERMAID_SCALE),
                    "-b",
                    "white",
                ],
                cwd=str(REPO),
                capture_output=True,
                text=True,
                timeout=300,
            )
            if r.returncode != 0 or not png_path.is_file() or png_path.stat().st_size < 50:
                print(f"FAIL: mermaid-cli 渲染失败 #{idx}", file=sys.stderr)
                print(r.stderr or r.stdout, file=sys.stderr)
                sys.exit(1)

            parts.append(f"\n\n![图 {idx}](docx-mermaid-assets/{png_name})\n\n")
            last = m.end()

        parts.append(md_text[last:])
        return "".join(parts), idx


def main() -> int:
    if not MD_PATH.is_file():
        print(f"FAIL: 缺少 {MD_PATH}", file=sys.stderr)
        return 1

    raw = MD_PATH.read_text(encoding="utf-8")
    if not MERMAID_BLOCK.search(raw):
        print("WARN: 未发现 ```mermaid 代码块，将直接 pandoc 原文件", file=sys.stderr)
        built = raw
        n = 0
    else:
        built, n = render_mermaid_blocks(raw)
        print(f"OK: 已渲染 {n} 个 Mermaid 图为 PNG → {ASSETS_DIR}")

    TEMP_MD.write_text(built, encoding="utf-8")

    r = subprocess.run(
        [
            "pandoc",
            str(TEMP_MD.relative_to(REPO)),
            "--resource-path",
            str(MD_PATH.parent.relative_to(REPO)),
            "-o",
            str(OUT_DOCX.relative_to(REPO)),
        ],
        cwd=str(REPO),
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        print(r.stderr or r.stdout, file=sys.stderr)
        return 1

    try:
        TEMP_MD.unlink()
    except OSError:
        pass

    print(f"OK: {OUT_DOCX}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
