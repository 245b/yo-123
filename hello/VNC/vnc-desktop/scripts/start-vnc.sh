#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:0}"
VNC_PORT="${VNC_PORT:-5900}"
VNC_LISTEN="${VNC_LISTEN:-0.0.0.0}"
VNC_PASSWORD="${VNC_PASSWORD:-}"
VNC_PASSWORD_FILE="${VNC_PASSWORD_FILE:-}"
pass_file=""
pass_args=("-nopw")

for _ in {1..60}; do
  if xdpyinfo >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if [ -n "$VNC_PASSWORD_FILE" ]; then
  pass_file="$VNC_PASSWORD_FILE"
fi

if [ -n "$VNC_PASSWORD" ]; then
  if [ -z "$pass_file" ]; then
    pass_file="/tmp/vnc.pass"
  fi
  x11vnc -storepasswd "$VNC_PASSWORD" "$pass_file"
  chmod 600 "$pass_file"
fi

if [ -n "$pass_file" ] && [ ! -f "$pass_file" ] && [ -z "$VNC_PASSWORD" ]; then
  echo "VNC_PASSWORD_FILE not found: $pass_file" >&2
  exit 1
fi

if [ -n "$pass_file" ] && [ -f "$pass_file" ]; then
  pass_args=("-rfbauth" "$pass_file")
fi

exec x11vnc -display "$DISPLAY" -forever -shared "${pass_args[@]}" -rfbport "$VNC_PORT" -listen "$VNC_LISTEN"
