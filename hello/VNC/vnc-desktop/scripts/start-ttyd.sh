#!/usr/bin/env bash
set -euo pipefail

RUN_USER="${RUN_USER:-operator}"
RUN_HOME="${RUN_HOME:-/home/operator}"
PROJECTS_DIR="${PROJECTS_DIR:-/projects}"
OPERATOR_DIR="${OPERATOR_DIR:-${PROJECTS_DIR%/}/operator}"
TERM_SESSION_DIR="${TERM_SESSION_DIR:-$OPERATOR_DIR}"
TERM_SESSION_ID="${TERM_SESSION_ID:-operator}"
TTYD_SESSION="${TTYD_SESSION:-$TERM_SESSION_ID}"
TTYD_PORT="${TTYD_PORT:-7681}"
TTYD_BASE_PATH="${TTYD_BASE_PATH:-/terminal}"
TTYD_PING_INTERVAL="${TTYD_PING_INTERVAL:-30}"
TTYD_AUTH_HEADER="${TTYD_AUTH_HEADER:-}"
ENABLE_VIEWER_TERMINAL="${ENABLE_VIEWER_TERMINAL:-1}"

if [ "$ENABLE_VIEWER_TERMINAL" != "1" ]; then
  exec sleep infinity
fi

if [ -z "$TTYD_SESSION" ]; then
  TTYD_SESSION="operator"
fi

cmd=(
  ttyd
  -p "$TTYD_PORT"
  -b "$TTYD_BASE_PATH"
  -W
  -O
  -P "$TTYD_PING_INTERVAL"
)

if [ -n "$TTYD_AUTH_HEADER" ]; then
  cmd+=(-H "$TTYD_AUTH_HEADER")
fi

cmd+=(
  tmux
  new
  -A
  -s "$TTYD_SESSION"
  -c "$TERM_SESSION_DIR"
)

exec runuser -u "$RUN_USER" -- env HOME="$RUN_HOME" USER="$RUN_USER" LOGNAME="$RUN_USER" "${cmd[@]}"
