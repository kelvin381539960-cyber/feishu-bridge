#!/usr/bin/env bash
# Install all extensions listed in .vscode/extensions.json (recommendations[])
# on this machine's Cursor Server (Remote-SSH host). Idempotent.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_JSON="$ROOT/.vscode/extensions.json"

CODE_CLI="$(ls -1t "$HOME"/.cursor-server/bin/linux-x64/*/bin/remote-cli/cursor 2>/dev/null | head -1 || true)"
if [[ -z "${CODE_CLI}" || ! -x "${CODE_CLI}" ]]; then
  echo "ERROR: Cursor remote-cli not found. Expected: ~/.cursor-server/bin/linux-x64/*/bin/remote-cli/cursor" >&2
  exit 1
fi
if [[ ! -f "$EXT_JSON" ]]; then
  echo "ERROR: missing $EXT_JSON" >&2
  exit 1
fi

mapfile -t exts < <(node -e "
const fs = require('fs');
const p = process.argv[1];
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
for (const id of j.recommendations || []) console.log(id);
" "$EXT_JSON")

n=0
for ext in "${exts[@]}"; do
  [[ -z "$ext" ]] && continue
  echo "=== $ext ==="
  "$CODE_CLI" --install-extension "$ext"
  n=$((n + 1))
done
echo "OK: reconciled $n extension(s) via $CODE_CLI"
