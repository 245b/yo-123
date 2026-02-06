#!/usr/bin/env bash
set -euo pipefail

DISPLAY="${DISPLAY:-:0}"
VNC_RESOLUTION="${VNC_RESOLUTION:-1920x1080}"
VNC_COL_DEPTH="${VNC_COL_DEPTH:-24}"

exec /usr/bin/Xvfb "$DISPLAY" -screen 0 "${VNC_RESOLUTION}x${VNC_COL_DEPTH}" -ac -nolisten tcp
