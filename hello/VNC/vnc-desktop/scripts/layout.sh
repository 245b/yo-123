#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:0}"

EDITOR_W_PCT="${EDITOR_W_PCT:-30}"
TERM_H_PCT="${TERM_H_PCT:-25}"
WINDOW_Y_OFFSET="${WINDOW_Y_OFFSET:-0}"
EDITOR_Y_OFFSET="${EDITOR_Y_OFFSET:-0}"
EDITOR_MATCH_PATTERN="${EDITOR_MATCH_PATTERN:-lite-xl}"
BROWSER_MATCH_PATTERN="${BROWSER_MATCH_PATTERN:-chromium}"
STATE_FILE="${LAYOUT_STATE_FILE:-/home/operator/.config/window-layout.env}"

wait_for_display() {
  for _ in {1..60}; do
    if xdpyinfo >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

get_window_id() {
  local pattern="$1"
  wmctrl -lx | awk -v pat="$pattern" 'BEGIN{IGNORECASE=1} $3 ~ pat {print $1; exit}'
}

get_browser_id() {
  local id=""
  id=$(get_window_id "$BROWSER_MATCH_PATTERN" || true)
  echo "$id"
}

parse_geom() {
  local geom="$1"
  local x y w h
  IFS=, read -r x y w h <<< "$geom"
  if [[ "$x" =~ ^[0-9]+$ && "$y" =~ ^[0-9]+$ && "$w" =~ ^[0-9]+$ && "$h" =~ ^[0-9]+$ ]]; then
    if [ "$w" -gt 0 ] && [ "$h" -gt 0 ]; then
      echo "${x},${y},${w},${h}"
      return 0
    fi
  fi
  return 1
}

apply_geometry() {
  local win_id="$1"
  local x="$2"
  local y="$3"
  local w="$4"
  local h="$5"
  local y_offset="${6:-$WINDOW_Y_OFFSET}"
  local y_adj
  y_adj=$((y - y_offset))
  xprop -id "$win_id" -f _NET_WM_WINDOW_TYPE 32a -set _NET_WM_WINDOW_TYPE _NET_WM_WINDOW_TYPE_NORMAL >/dev/null 2>&1 || true
  xprop -id "$win_id" -remove WM_NORMAL_HINTS >/dev/null 2>&1 || true
  wmctrl -i -r "$win_id" -b remove,maximized_vert,maximized_horz
  wmctrl -i -r "$win_id" -e "0,${x},${y_adj},${w},${h}"
}

wait_for_display || exit 0

# Load persisted geometry if present.
if [ -f "$STATE_FILE" ]; then
  # shellcheck disable=SC1090
  . "$STATE_FILE" || true
fi
EDITOR_GEOM="${EDITOR_GEOM:-}"
BROWSER_GEOM="${BROWSER_GEOM:-}"
TERM_GEOM="${TERM_GEOM:-}"

# Screen dimensions
screen_dims=$(xdpyinfo | awk '/dimensions:/{print $2; exit}')
if [ -z "$screen_dims" ]; then
  exit 0
fi
screen_w=${screen_dims%x*}
screen_h=${screen_dims#*x}

editor_w=$((screen_w * EDITOR_W_PCT / 100))
right_w=$((screen_w - editor_w))
right_x=$editor_w

term_h=$((screen_h * TERM_H_PCT / 100))
browser_h=$((screen_h - term_h))

editor_id=$(get_window_id "$EDITOR_MATCH_PATTERN" || true)
browser_id=$(get_browser_id || true)
term_id=$(get_window_id "xterm" || true)

if [ -n "$editor_id" ]; then
  if geom=$(parse_geom "$EDITOR_GEOM"); then
    IFS=, read -r editor_x editor_y editor_w_saved editor_h_saved <<< "$geom"
    apply_geometry "$editor_id" "$editor_x" "$editor_y" "$editor_w_saved" "$editor_h_saved" "$EDITOR_Y_OFFSET"
  else
    apply_geometry "$editor_id" 0 0 "$editor_w" "$screen_h" "$EDITOR_Y_OFFSET"
  fi
fi

if [ -n "$browser_id" ]; then
  if geom=$(parse_geom "$BROWSER_GEOM"); then
    IFS=, read -r browser_x browser_y browser_w_saved browser_h_saved <<< "$geom"
    apply_geometry "$browser_id" "$browser_x" "$browser_y" "$browser_w_saved" "$browser_h_saved"
  else
    apply_geometry "$browser_id" "$right_x" 0 "$right_w" "$browser_h"
  fi
fi

if [ -n "$term_id" ]; then
  if geom=$(parse_geom "$TERM_GEOM"); then
    IFS=, read -r term_x term_y term_w_saved term_h_saved <<< "$geom"
    apply_geometry "$term_id" "$term_x" "$term_y" "$term_w_saved" "$term_h_saved"
  else
    apply_geometry "$term_id" "$right_x" "$browser_h" "$right_w" "$term_h"
  fi
fi
