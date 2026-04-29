#!/usr/bin/env bash
set -euo pipefail

URL="${1:-${FEISHU_BROWSER_HEALTH_URL:-}}"
CMD=(python3 "/opt/feishu-bridge/scripts/feishu-browser-health.py")

if [[ -n "$URL" ]]; then
  CMD+=(--url "$URL")
fi

echo "== Feishu browser health check =="
echo "profile: /root/.feishu-browser-profile"
if [[ -n "$URL" ]]; then
  echo "target:  $URL"
else
  echo "target:  (bootstrap only; set FEISHU_BROWSER_HEALTH_URL or pass a URL for deeper verification)"
fi
echo ""

"${CMD[@]}"
