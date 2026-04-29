#!/usr/bin/env bash
set -euo pipefail

DISPLAY_NUM="${DISPLAY_NUM:-:99}"
XVFB_SCREEN="${XVFB_SCREEN:-1440x900x24}"
VNC_PORT="${VNC_PORT:-5900}"
TARGET_URL="${1:-${TARGET_URL:-}}"
STATE_DIR="${STATE_DIR:-/opt/feishu-bridge/var/feishu-browser-vnc}"
mkdir -p "$STATE_DIR"
DISPLAY_ID="${DISPLAY_NUM#:}"
X_LOCK_FILE="/tmp/.X${DISPLAY_ID}-lock"
X_SOCKET_FILE="/tmp/.X11-unix/X${DISPLAY_ID}"

XVFB_PID_FILE="$STATE_DIR/xvfb.pid"
X11VNC_PID_FILE="$STATE_DIR/x11vnc.pid"
LOGIN_PID_FILE="$STATE_DIR/login.pid"
XVFB_LOG="$STATE_DIR/xvfb.log"
X11VNC_LOG="$STATE_DIR/x11vnc.log"
LOGIN_LOG="$STATE_DIR/login.log"

if [[ -f "$XVFB_PID_FILE" ]] && kill -0 "$(cat "$XVFB_PID_FILE")" 2>/dev/null; then
  echo "Xvfb already running on $DISPLAY_NUM"
else
  if [[ -f "$X_LOCK_FILE" ]] && ! pgrep -f "Xvfb $DISPLAY_NUM -screen 0 $XVFB_SCREEN" >/dev/null 2>&1; then
    rm -f "$X_LOCK_FILE"
    rm -f "$X_SOCKET_FILE"
  fi
  Xvfb "$DISPLAY_NUM" -screen 0 "$XVFB_SCREEN" >"$XVFB_LOG" 2>&1 &
  echo $! >"$XVFB_PID_FILE"
  sleep 1
fi

if [[ -f "$X11VNC_PID_FILE" ]] && kill -0 "$(cat "$X11VNC_PID_FILE")" 2>/dev/null; then
  echo "x11vnc already running on localhost:$VNC_PORT"
else
  x11vnc \
    -display "$DISPLAY_NUM" \
    -rfbport "$VNC_PORT" \
    -localhost \
    -forever \
    -shared \
    -rfbauth "$STATE_DIR/passwd" \
    >"$X11VNC_LOG" 2>&1 &
  echo $! >"$X11VNC_PID_FILE"
  sleep 1
fi

if [[ -f "$LOGIN_PID_FILE" ]] && kill -0 "$(cat "$LOGIN_PID_FILE")" 2>/dev/null; then
  echo "login helper already running"
else
  LOGIN_CMD=(python3 /opt/feishu-bridge/scripts/feishu-browser-login.py)
  if [[ -n "$TARGET_URL" ]]; then
    LOGIN_CMD+=(--url "$TARGET_URL")
  fi
  DISPLAY="$DISPLAY_NUM" "${LOGIN_CMD[@]}" >"$LOGIN_LOG" 2>&1 &
  echo $! >"$LOGIN_PID_FILE"
  sleep 2
fi

cat <<EOF
VNC login session started.

1. On your local machine, open a new terminal and create an SSH tunnel:
   ssh -L ${VNC_PORT}:127.0.0.1:${VNC_PORT} root@$(hostname -I | awk '{print $1}')

2. Open your VNC client and connect to:
   127.0.0.1:${VNC_PORT}

3. In the virtual desktop, complete the target login/authorization once.

4. When done, stop the session on the server:
   /opt/feishu-bridge/scripts/feishu-browser-vnc-stop.sh

Logs:
  Xvfb:    $XVFB_LOG
  x11vnc:  $X11VNC_LOG
  login:   $LOGIN_LOG
EOF
