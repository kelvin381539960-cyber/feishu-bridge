#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-/etc/feishu-whiteboard.env}"
WHITEBOARD_ID="${WHITEBOARD_ID:-${FEISHU_WHITEBOARD_DEFAULT_ID:-S5yWwgo0dhkrCIb1qNZlBvs3gwg}}"
REDIRECT_URI="${REDIRECT_URI:-${FEISHU_WHITEBOARD_REDIRECT_URI:-https://your-domain.example.com/feishu-whiteboard/oauth/callback}}"
SERVICE_BASE_URL="${SERVICE_BASE_URL:-${FEISHU_WHITEBOARD_SERVICE_BASE_URL:-http://127.0.0.1:8091}}"
SERVICE_TOKEN="${SERVICE_TOKEN:-${FEISHU_WHITEBOARD_SERVICE_TOKEN:-}}"

usage() {
  cat <<EOF
用法:
  bash scripts/feishu-whiteboard-replay.sh
  bash scripts/feishu-whiteboard-replay.sh <oauth_code>
  bash scripts/feishu-whiteboard-replay.sh --dry-run

运行位置:
  机器: 当前云主机
  用户: 与 systemd 运行 whiteboard service 相同的 Linux 用户（默认 root）
  目录: /opt/feishu-bridge

说明:
  该命令默认调用云端常驻 whiteboard service，
  不再直接本地拼装写入逻辑。
  无参数时：使用云端已落盘 token 直接重放。
  传 oauth_code 时：先用该 code 交换，再执行写入。
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

cd "$ROOT_DIR"

CODE="${1:-}"

AUTH_HEADER=()
if [[ -n "$SERVICE_TOKEN" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer ${SERVICE_TOKEN}")
fi

if [[ "${1:-}" == "--dry-run" ]]; then
  exec curl -sS -X POST \
    "${AUTH_HEADER[@]}" \
    -H "Content-Type: application/json; charset=utf-8" \
    "${SERVICE_BASE_URL%/}/feishu-whiteboard/replay" \
    --data "{\"whiteboardId\":\"${WHITEBOARD_ID}\",\"dryRun\":true}"
fi

if [[ -z "$CODE" ]]; then
  exec curl -sS -X POST \
    "${AUTH_HEADER[@]}" \
    -H "Content-Type: application/json; charset=utf-8" \
    "${SERVICE_BASE_URL%/}/feishu-whiteboard/replay" \
    --data "{\"whiteboardId\":\"${WHITEBOARD_ID}\"}"
fi

exec curl -sS -X POST \
  "${AUTH_HEADER[@]}" \
  -H "Content-Type: application/json; charset=utf-8" \
  "${SERVICE_BASE_URL%/}/feishu-whiteboard/replay" \
  --data "{\"whiteboardId\":\"${WHITEBOARD_ID}\",\"oauthCode\":\"${CODE}\",\"redirectUri\":\"${REDIRECT_URI}\"}"
