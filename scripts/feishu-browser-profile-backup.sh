#!/usr/bin/env bash
set -euo pipefail

PROFILE_DIR="${PROFILE_DIR:-/root/.feishu-browser-profile}"
BACKUP_DIR="${BACKUP_DIR:-/opt/feishu-bridge/var/backups/feishu-browser-profile}"
KEEP_COUNT="${KEEP_COUNT:-7}"
TS="$(date +%Y%m%d_%H%M%S)"
ARCHIVE_PATH="$BACKUP_DIR/feishu-browser-profile-$TS.tar.gz"

if [[ ! -d "$PROFILE_DIR" ]]; then
  echo "profile directory not found: $PROFILE_DIR" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

tar -C "$(dirname "$PROFILE_DIR")" -czf "$ARCHIVE_PATH" "$(basename "$PROFILE_DIR")"
chmod 600 "$ARCHIVE_PATH"

mapfile -t archives < <(ls -1t "$BACKUP_DIR"/feishu-browser-profile-*.tar.gz 2>/dev/null || true)
if (( ${#archives[@]} > KEEP_COUNT )); then
  for old in "${archives[@]:$KEEP_COUNT}"; do
    rm -f "$old"
  done
fi

echo "backup created: $ARCHIVE_PATH"
echo "retention kept: $KEEP_COUNT"
