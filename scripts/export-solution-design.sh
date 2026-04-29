#!/usr/bin/env bash
# 先渲染 Mermaid 为 PNG，再 pandoc 导出 docx（含图）
cd /opt/feishu-bridge
python3 scripts/export-solution-design-docx.py
