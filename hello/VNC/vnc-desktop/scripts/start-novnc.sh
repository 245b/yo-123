#!/usr/bin/env bash
set -euo pipefail

NOVNC_PORT="${NOVNC_PORT:-6080}"
VNC_HOST="${VNC_HOST:-localhost}"
VNC_PORT="${VNC_PORT:-5900}"
WEB_DIR="${NOVNC_WEB_DIR:-/usr/share/novnc}"

if [ -x /opt/scripts/patch-novnc.sh ]; then
  /opt/scripts/patch-novnc.sh || true
fi

exec websockify --web="$WEB_DIR" "$NOVNC_PORT" "$VNC_HOST:$VNC_PORT"
