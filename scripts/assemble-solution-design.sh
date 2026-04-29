#!/usr/bin/env bash
# 将 chapters/*.md 装订为 solution-design.html + solution-design.md
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PY="$ROOT/.venv-aix-doc/bin/python"
if [[ ! -x "$PY" ]]; then
  echo "请先创建虚拟环境并安装依赖：" >&2
  echo "  cd \"$ROOT\" && python3 -m venv .venv-aix-doc && .venv-aix-doc/bin/pip install -r scripts/aix-doc-requirements.txt" >&2
  exit 1
fi
exec "$PY" "$ROOT/scripts/assemble-solution-design.py"
