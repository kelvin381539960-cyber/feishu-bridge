#!/usr/bin/env bash
# 将 docs/aix-phase2/solution-design/solution-design.html 导出为同目录下 solution-design.docx。
# 用法：在仓库根目录执行  bash scripts/solution-design-export-docx.sh

set -euo pipefail
REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
SD="$REPO_ROOT/docs/aix-phase2/solution-design"
HTML="$SD/solution-design.html"
OUTDIR="$SD"
LO_PROFILE="file://${REPO_ROOT}/.lo-profile"

if [[ ! -f "$HTML" ]]; then
  echo "错误: 找不到 $HTML" >&2
  exit 1
fi

if command -v libreoffice >/dev/null 2>&1; then
  LO=libreoffice
elif command -v soffice >/dev/null 2>&1; then
  LO=soffice
else
  echo "错误: 未找到 libreoffice" >&2
  exit 1
fi

"$LO" --headless "-env:UserInstallation=$LO_PROFILE" \
  --convert-to "docx:MS Word 2007 XML" \
  --outdir "$OUTDIR" \
  "$HTML"

echo "已生成: $OUTDIR/solution-design.docx"
