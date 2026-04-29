#!/usr/bin/env bash
# Thin wrapper: run the include renderer from any cwd (script path is absolute).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
exec python3 "$ROOT/scripts/render_markdown_includes.py" "$@"
