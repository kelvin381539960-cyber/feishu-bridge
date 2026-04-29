#!/usr/bin/env bash
# 将 exports-for-word 下的单张 .mmd 渲染为 PNG + SVG（供 Word / 飞书 插入）。
# 用法：bash scripts/render-flow-export.sh [path/to/file.mmd]
# 默认：docs/aix-phase2/solution-design/exports-for-word/flow-02-card-application-and-issuance.mmd
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_MMD="$ROOT/docs/aix-phase2/solution-design/exports-for-word/flow-02-card-application-and-issuance.mmd"
MMD="${1:-$DEFAULT_MMD}"
OUTDIR="$(dirname "$MMD")"
BASE="$(basename "$MMD" .mmd)"

W="${MERMAID_DOCX_WIDTH:-4096}"
H="${MERMAID_DOCX_HEIGHT:-1600}"
S="${MERMAID_DOCX_SCALE:-2}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PCFG="$TMP/puppeteer.json"
printf '%s\n' '{"args":["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"]}' >"$PCFG"

cd "$ROOT"
CLI_VER="${MERMAID_CLI_VERSION:-10.9.0}"

run_mmdc() {
  npx -y "@mermaid-js/mermaid-cli@${CLI_VER}" -p "$PCFG" "$@"
}

run_mmdc -i "$MMD" -o "$OUTDIR/${BASE}--for-word.png" -w "$W" -H "$H" -s "$S" -b white
run_mmdc -i "$MMD" -o "$OUTDIR/${BASE}--for-word.svg" -w "$W" -H "$H" -s "$S" -b white

echo "OK: $OUTDIR/${BASE}--for-word.png"
echo "OK: $OUTDIR/${BASE}--for-word.svg"
