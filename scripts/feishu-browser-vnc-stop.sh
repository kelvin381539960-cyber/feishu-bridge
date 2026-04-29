#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="${STATE_DIR:-/opt/feishu-bridge/var/feishu-browser-vnc}"
DISPLAY_NUM="${DISPLAY_NUM:-:99}"
DISPLAY_ID="${DISPLAY_NUM#:}"

stop_pid_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    local pid
    pid="$(cat "$file")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$file"
  fi
}

stop_pid_file "$STATE_DIR/login.pid"
stop_pid_file "$STATE_DIR/x11vnc.pid"
stop_pid_file "$STATE_DIR/xvfb.pid"

# Clean up stale processes when pid files are missing or outdated.
pkill -f "/opt/feishu-bridge/scripts/feishu-browser-login.py" 2>/dev/null || true
pkill -f "/root/.feishu-browser-profile" 2>/dev/null || true
pkill -f "x11vnc -display :99" 2>/dev/null || true
pkill -f "Xvfb :99 -screen 0" 2>/dev/null || true
rm -f "/tmp/.X${DISPLAY_ID}-lock" "/tmp/.X11-unix/X${DISPLAY_ID}"

echo "Stopped Feishu browser VNC session."
