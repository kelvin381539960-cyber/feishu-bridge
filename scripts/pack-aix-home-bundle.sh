#!/usr/bin/env bash
# 生成可带回家解压的 AIX 文档包（含 solution-design + 装订脚本）
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/feishu-bridge-aix-home-bundle.tar.gz"
cd "$ROOT"
tar czf "$OUT" \
  docs/aix-phase2/README.md \
  docs/aix-phase2/solution-design \
  scripts/assemble-solution-design.sh \
  scripts/assemble-solution-design.py \
  scripts/aix-doc-requirements.txt \
  scripts/solution-design-export-docx.sh \
  scripts/pack-aix-home-bundle.sh \
  .vscode/tasks.json \
  .gitignore
echo "OK: $OUT"
ls -lh "$OUT"
