#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:0}"

RUN_USER="${RUN_USER:-operator}"
RUN_HOME="${RUN_HOME:-/home/operator}"
WORKSPACE_DIR="${WORKSPACE_DIR:-${RUN_HOME}/Desktop}"
PROJECTS_DIR="${PROJECTS_DIR:-/projects}"
OPERATOR_DIR="${OPERATOR_DIR:-${PROJECTS_DIR%/}/Operator}"
EDITOR_BIN="${EDITOR_BIN:-/opt/lite-xl/lite-xl}"
EDITOR_WORKSPACE_DIR="${EDITOR_WORKSPACE_DIR:-}"
EDITOR_MATCH_PATTERN="${EDITOR_MATCH_PATTERN:-lite-xl}"
EDITOR_EXTRA_FLAGS="${EDITOR_EXTRA_FLAGS:-}"
BROWSER_BIN="${BROWSER_BIN:-chromium}"
BROWSER_PROFILE_DIR="${BROWSER_PROFILE_DIR:-$RUN_HOME/.config/chromium}"
BROWSER_MATCH_PATTERN="${BROWSER_MATCH_PATTERN:-chromium}"
BROWSER_URL="${BROWSER_URL:-about:blank}"
BROWSER_DEBUG_PORT="${BROWSER_DEBUG_PORT:-9222}"
BROWSER_DEBUG_ADDRESS="${BROWSER_DEBUG_ADDRESS:-0.0.0.0}"
BROWSER_LD_LIBRARY_PATH="${BROWSER_LD_LIBRARY_PATH:-/opt/chromium-libs/lib}"
BROWSER_CDP_PROXY_HOST="${BROWSER_CDP_PROXY_HOST:-0.0.0.0}"
BROWSER_CDP_PROXY_PORT="${BROWSER_CDP_PROXY_PORT:-9223}"
BROWSER_CDP_TARGET_HOST="${BROWSER_CDP_TARGET_HOST:-127.0.0.1}"
CHECK_INTERVAL="${CHECK_INTERVAL:-${RELAYOUT_INTERVAL:-5}}"
LAYOUT_STATE_FILE="${LAYOUT_STATE_FILE:-${RUN_HOME}/.config/window-layout.env}"
RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-${RUN_USER}}"
LAYOUT_APPLY_RETRIES="${LAYOUT_APPLY_RETRIES:-3}"
LAYOUT_APPLY_DELAY="${LAYOUT_APPLY_DELAY:-3}"
LAYOUT_SAVE_DELAY="${LAYOUT_SAVE_DELAY:-5}"
LOW_MEMORY_MODE="${LOW_MEMORY_MODE:-1}"
BROWSER_RENDERER_LIMIT="${BROWSER_RENDERER_LIMIT:-}"
BROWSER_MAX_MEM_MB="${BROWSER_MAX_MEM_MB:-}"
BROWSER_DISABLE_EXTENSIONS="${BROWSER_DISABLE_EXTENSIONS:-}"
BROWSER_EXTRA_FLAGS="${BROWSER_EXTRA_FLAGS:-}"
MEMORY_LOG_INTERVAL="${MEMORY_LOG_INTERVAL:-60}"
MEMORY_LOG_FILE="${MEMORY_LOG_FILE:-${RUN_HOME}/.logs/memory.log}"
TRASH_DIR="${TRASH_DIR:-/trash}"
TRASH_CLEAN_INTERVAL="${TRASH_CLEAN_INTERVAL:-7200}"
ENABLE_DESKTOP_EXTRAS="${ENABLE_DESKTOP_EXTRAS:-0}"
ENABLE_DESKTOP_ICONS="${ENABLE_DESKTOP_ICONS:-1}"
APP_RELAUNCH_DELAY="${APP_RELAUNCH_DELAY:-8}"
STATUS_LOG_INTERVAL="${STATUS_LOG_INTERVAL:-60}"
COMPOSITOR_CHECK_INTERVAL="${COMPOSITOR_CHECK_INTERVAL:-30}"
BLACK_BG_REFRESH_INTERVAL="${BLACK_BG_REFRESH_INTERVAL:-30}"

if [ "$WORKSPACE_DIR" = "${RUN_HOME}/workspace" ]; then
  WORKSPACE_DIR="${RUN_HOME}/Desktop"
fi
if [ -z "$EDITOR_WORKSPACE_DIR" ]; then
  if [ -n "$OPERATOR_DIR" ]; then
    EDITOR_WORKSPACE_DIR="$OPERATOR_DIR"
  else
    EDITOR_WORKSPACE_DIR="$WORKSPACE_DIR"
  fi
fi

if [ "$LOW_MEMORY_MODE" = "1" ]; then
  BROWSER_MAX_MEM_MB="${BROWSER_MAX_MEM_MB:-384}"
  BROWSER_RENDERER_LIMIT="${BROWSER_RENDERER_LIMIT:-2}"
fi
if [ -z "$BROWSER_DISABLE_EXTENSIONS" ]; then
  BROWSER_DISABLE_EXTENSIONS="$LOW_MEMORY_MODE"
fi
if ! [[ "$MEMORY_LOG_INTERVAL" =~ ^[0-9]+$ ]]; then
  MEMORY_LOG_INTERVAL=0
fi
if ! [[ "$TRASH_CLEAN_INTERVAL" =~ ^[0-9]+$ ]]; then
  TRASH_CLEAN_INTERVAL=0
fi
if ! [[ "$APP_RELAUNCH_DELAY" =~ ^[0-9]+$ ]]; then
  APP_RELAUNCH_DELAY=8
fi
if ! [[ "$STATUS_LOG_INTERVAL" =~ ^[0-9]+$ ]]; then
  STATUS_LOG_INTERVAL=0
fi
if ! [[ "$COMPOSITOR_CHECK_INTERVAL" =~ ^[0-9]+$ ]]; then
  COMPOSITOR_CHECK_INTERVAL=30
fi
if ! [[ "$BLACK_BG_REFRESH_INTERVAL" =~ ^[0-9]+$ ]]; then
  BLACK_BG_REFRESH_INTERVAL=30
fi

mkdir -p "$WORKSPACE_DIR" "$PROJECTS_DIR" "$OPERATOR_DIR" "$EDITOR_WORKSPACE_DIR" "$BROWSER_PROFILE_DIR" "$RUN_HOME/.logs" "$RUNTIME_DIR"

for entry in "$PROJECTS_DIR"/* "$PROJECTS_DIR"/.[!.]* "$PROJECTS_DIR"/..?*; do
  if [ ! -e "$entry" ]; then
    continue
  fi

  if [ "$entry" = "$OPERATOR_DIR" ]; then
    continue
  fi

  rm -rf "$entry" 2>/dev/null || true
done

mkdir -p "$(dirname "$LAYOUT_STATE_FILE")"
mkdir -p "$(dirname "$MEMORY_LOG_FILE")"
if [ -n "$TRASH_DIR" ] && [ "$TRASH_DIR" != "/" ]; then
  mkdir -p "$TRASH_DIR/files" "$TRASH_DIR/info"
  chown -R "$RUN_USER:$RUN_USER" "$TRASH_DIR" 2>/dev/null || true
fi
chmod 700 "$RUNTIME_DIR" || true
if id "$RUN_USER" >/dev/null 2>&1; then
  chown -R "$RUN_USER:$RUN_USER" "$WORKSPACE_DIR" "$PROJECTS_DIR" "$OPERATOR_DIR" "$EDITOR_WORKSPACE_DIR" "$RUN_HOME" 2>/dev/null || true
  chown "$RUN_USER:$RUN_USER" "$RUNTIME_DIR" 2>/dev/null || true
fi

wait_for_display() {
  for _ in {1..60}; do
    if xdpyinfo >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

has_window() {
  local pattern="$1"
  if [ -z "${window_list:-}" ]; then
    window_list="$(wmctrl -lx 2>/dev/null || true)"
  fi
  if [ -z "$window_list" ]; then
    return 1
  fi
  awk -v pat="$pattern" 'BEGIN{IGNORECASE=1} $3 ~ pat {found=1} END{exit !found}' <<< "$window_list"
}

has_browser_window() {
  has_window "$BROWSER_MATCH_PATTERN"
}

run_as_user() {
  runuser -u "$RUN_USER" -- env \
    HOME="$RUN_HOME" \
    USER="$RUN_USER" \
    LOGNAME="$RUN_USER" \
    XDG_RUNTIME_DIR="$RUNTIME_DIR" \
    "$@"
}

log_event() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

mark_layout_pending() {
  pending_layout=true
  layout_retries="$LAYOUT_APPLY_RETRIES"
  layout_pending_since=$(date +%s)
}

set_black_bg() {
  local now="$1"
  if [ "$ENABLE_DESKTOP_ICONS" = "1" ]; then
    return
  fi
  if [ $((now - last_bg_set)) -lt "$BLACK_BG_REFRESH_INTERVAL" ]; then
    return
  fi
  xsetroot -solid "#000000" >/dev/null 2>&1 || true
  last_bg_set="$now"
}

disable_xfce_extras() {
  if [ "$ENABLE_DESKTOP_EXTRAS" != "1" ]; then
    pkill -u "$RUN_USER" xfce4-panel >/dev/null 2>&1 || true
  fi
  if [ "$ENABLE_DESKTOP_ICONS" != "1" ]; then
    pkill -u "$RUN_USER" xfdesktop >/dev/null 2>&1 || true
  fi
}

disable_compositing() {
  local now="$1"
  if [ "${ENABLE_COMPOSITOR:-0}" = "1" ]; then
    return
  fi
  if [ $((now - last_compositor_check)) -lt "$COMPOSITOR_CHECK_INTERVAL" ]; then
    return
  fi
  last_compositor_check="$now"
  pkill -u "$RUN_USER" xcompmgr >/dev/null 2>&1 || true
  run_as_user xfconf-query -c xfwm4 -p /general/use_compositing -s false >/dev/null 2>&1 || true
}

log_memory() {
  if [ "$MEMORY_LOG_INTERVAL" -le 0 ]; then
    return
  fi
  {
    echo "=== $(date -u +'%Y-%m-%dT%H:%M:%SZ') ==="
    free -m || true
    ps -o pid,user,comm,rss --sort=-rss | head -n 10 || true
    echo
  } >> "$MEMORY_LOG_FILE" 2>/dev/null || true
}

clean_trash() {
  if [ "$TRASH_CLEAN_INTERVAL" -le 0 ]; then
    return
  fi
  if [ -z "$TRASH_DIR" ] || [ "$TRASH_DIR" = "/" ]; then
    return
  fi
  local files_dir="$TRASH_DIR/files"
  local info_dir="$TRASH_DIR/info"
  if [ ! -d "$files_dir" ] || [ ! -d "$info_dir" ]; then
    return
  fi
  find "$files_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
  find "$info_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
}

ensure_single_terminal() {
  local term_pids term_ids
  mapfile -t term_pids < <(pgrep -u "$RUN_USER" -x xterm 2>/dev/null || true)
  if [ "${#term_pids[@]}" -gt 1 ]; then
    for pid in "${term_pids[@]:1}"; do
      kill "$pid" >/dev/null 2>&1 || true
    done
  fi
  mapfile -t term_ids < <(printf '%s\n' "$window_list" | awk 'BEGIN{IGNORECASE=1} $3 ~ /xterm/ {print $1}' 2>/dev/null || true)
  if [ "${#term_ids[@]}" -gt 1 ]; then
    for id in "${term_ids[@]:1}"; do
      wmctrl -i -c "$id" >/dev/null 2>&1 || true
    done
  fi
}

is_process_running() {
  local name="$1"
  pgrep -u "$RUN_USER" -x "$name" >/dev/null 2>&1
}

launch_editor() {
  local editor_bin="$EDITOR_BIN"
  local -a editor_cmd extra_flags

  if [ -z "$editor_bin" ] || [ ! -x "$editor_bin" ]; then
    editor_bin="$(command -v lite-xl || true)"
  fi
  if [ -z "$editor_bin" ]; then
    return
  fi

  log_event "launching editor"
  editor_cmd=("$editor_bin")
  if [ -n "$EDITOR_EXTRA_FLAGS" ]; then
    read -r -a extra_flags <<< "$EDITOR_EXTRA_FLAGS"
    editor_cmd+=("${extra_flags[@]}")
  fi
  editor_cmd+=("$EDITOR_WORKSPACE_DIR")

  run_as_user \
    LIBGL_ALWAYS_SOFTWARE=1 \
    GALLIUM_DRIVER=llvmpipe \
    "${editor_cmd[@]}" >/tmp/lite-xl.log 2>&1 &
}

launch_browser() {
  local browser_bin="$BROWSER_BIN"
  local browser_ld_library_path="$BROWSER_LD_LIBRARY_PATH"
  local -a browser_cmd extra_flags
  if [ -n "${LD_LIBRARY_PATH:-}" ]; then
    if [ -n "$browser_ld_library_path" ]; then
      browser_ld_library_path="${browser_ld_library_path}:${LD_LIBRARY_PATH}"
    else
      browser_ld_library_path="$LD_LIBRARY_PATH"
    fi
  fi
  if ! command -v "$browser_bin" >/dev/null 2>&1; then
    browser_bin="chromium"
  fi

  log_event "launching browser"
  browser_cmd=(
    "$browser_bin"
    --no-sandbox
    --disable-dev-shm-usage
    --disable-gpu
    --disable-session-crashed-bubble
    --no-first-run
    --no-default-browser-check
    --user-data-dir="$BROWSER_PROFILE_DIR"
    --remote-debugging-port="$BROWSER_DEBUG_PORT"
    --remote-debugging-address="$BROWSER_DEBUG_ADDRESS"
  )

  if [ "$LOW_MEMORY_MODE" = "1" ]; then
    browser_cmd+=(
      --disable-background-networking
      --disable-client-side-phishing-detection
      --disable-component-update
      --disable-default-apps
      --disable-sync
      --metrics-recording-only
      --no-pings
      --disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints,GlobalMediaControls
    )
  fi
  if [ "$BROWSER_DISABLE_EXTENSIONS" = "1" ]; then
    browser_cmd+=(--disable-extensions)
  fi
  if [ -n "$BROWSER_RENDERER_LIMIT" ]; then
    browser_cmd+=(--renderer-process-limit="$BROWSER_RENDERER_LIMIT" --process-per-site)
  fi
  if [ -n "$BROWSER_MAX_MEM_MB" ]; then
    browser_cmd+=(--js-flags="--max-old-space-size=${BROWSER_MAX_MEM_MB}")
  fi
  if [ -n "$BROWSER_EXTRA_FLAGS" ]; then
    read -r -a extra_flags <<< "$BROWSER_EXTRA_FLAGS"
    browser_cmd+=("${extra_flags[@]}")
  fi
  browser_cmd+=("$BROWSER_URL")

  run_as_user \
    LIBGL_ALWAYS_SOFTWARE=1 \
    GALLIUM_DRIVER=llvmpipe \
    LD_LIBRARY_PATH="$browser_ld_library_path" \
    "${browser_cmd[@]}" >/tmp/chromium.log 2>&1 &
}

ensure_cdp_proxy() {
  if [ -n "${cdp_proxy_pid:-}" ] && kill -0 "$cdp_proxy_pid" 2>/dev/null; then
    return
  fi
  if [ ! -x /opt/scripts/start-cdp-proxy.sh ]; then
    return
  fi
  run_as_user /opt/scripts/start-cdp-proxy.sh >/tmp/cdp-proxy.log 2>&1 &
  cdp_proxy_pid=$!
}

launch_terminal() {
  local term_dir="$OPERATOR_DIR"
  if [ ! -d "$term_dir" ]; then
    term_dir="$WORKSPACE_DIR"
  fi
  log_event "launching terminal"
  run_as_user xterm -fa "DejaVu Sans Mono" -fs 12 -bg black -fg white \
    -e bash -lc "cd \"$term_dir\"; exec bash" >/tmp/terminal.log 2>&1 &    
}

get_geom_by_id() {
  local win_id="$1"
  wmctrl -lG | awk -v id="$win_id" '$1 == id {print $3","$4","$5","$6; exit}' || true
}

get_editor_window_id() {
  local id=""
  id=$(wmctrl -lx | awk -v pat="$EDITOR_MATCH_PATTERN" 'BEGIN{IGNORECASE=1} $3 ~ pat {print $1; exit}' || true)
  echo "$id"
}

get_browser_window_id() {
  local id=""
  id=$(wmctrl -lx | awk -v pat="$BROWSER_MATCH_PATTERN" 'BEGIN{IGNORECASE=1} $3 ~ pat {print $1; exit}' || true)
  echo "$id"
}

save_layout() {
  local editor_id browser_id term_id
  local editor_geom browser_geom term_geom

  editor_id=$(get_editor_window_id || true)
  browser_id=$(get_browser_window_id || true)
  term_id=$(wmctrl -lx | awk 'BEGIN{IGNORECASE=1} $3 ~ /xterm/ {print $1; exit}' || true)

  editor_geom=""
  browser_geom=""
  term_geom=""

  if [ -n "$editor_id" ]; then
    editor_geom=$(get_geom_by_id "$editor_id" || true)
  fi
  if [ -n "$browser_id" ]; then
    browser_geom=$(get_geom_by_id "$browser_id" || true)
  fi
  if [ -n "$term_id" ]; then
    term_geom=$(get_geom_by_id "$term_id" || true)
  fi

  if [ -n "$editor_geom" ] || [ -n "$browser_geom" ] || [ -n "$term_geom" ]; then
    cat > "$LAYOUT_STATE_FILE" <<EOF
EDITOR_GEOM="$editor_geom"
BROWSER_GEOM="$browser_geom"
TERM_GEOM="$term_geom"
EOF
  fi
}

wait_for_display || true

disable_xfce_extras
last_compositor_check=0
last_bg_set=0

pending_layout=true
layout_initialized=false
layout_last_applied=0
layout_pending_since=0
layout_retries=0
editor_was_present=false
browser_was_present=false
term_was_present=false
cdp_proxy_pid=""
last_memory_log=0
last_trash_cleanup=$(date +%s)
last_status_log=0
last_editor_launch=0
last_browser_launch=0
last_term_launch=0
window_list=""

launch_editor
launch_browser
ensure_cdp_proxy
launch_terminal
last_editor_launch=$(date +%s)
last_browser_launch="$last_editor_launch"
last_term_launch="$last_editor_launch"
sleep 2

set_black_bg "$(date +%s)"

while true; do
  now=$(date +%s)
  editor_present=false
  browser_present=false
  term_present=false

  window_list="$(wmctrl -lx 2>/dev/null || true)"
  ensure_single_terminal
  ensure_cdp_proxy

  if [ "$MEMORY_LOG_INTERVAL" -gt 0 ] && [ $((now - last_memory_log)) -ge "$MEMORY_LOG_INTERVAL" ]; then
    log_memory
    last_memory_log="$now"
  fi
  if [ "$TRASH_CLEAN_INTERVAL" -gt 0 ] && [ $((now - last_trash_cleanup)) -ge "$TRASH_CLEAN_INTERVAL" ]; then
    clean_trash
    last_trash_cleanup="$now"
  fi

  if has_window "$EDITOR_MATCH_PATTERN"; then
    editor_present=true
  fi
  if has_browser_window; then
    browser_present=true
  fi
  if has_window "xterm"; then
    term_present=true
  fi

  if [ "$editor_present" = true ] && [ "$editor_was_present" = false ]; then
    mark_layout_pending
  fi
  if [ "$browser_present" = true ] && [ "$browser_was_present" = false ]; then
    mark_layout_pending
  fi
  if [ "$term_present" = true ] && [ "$term_was_present" = false ]; then
    mark_layout_pending
  fi

  editor_was_present="$editor_present"
  browser_was_present="$browser_present"
  term_was_present="$term_present"

  if [ "$STATUS_LOG_INTERVAL" -gt 0 ] && [ $((now - last_status_log)) -ge "$STATUS_LOG_INTERVAL" ]; then
    log_event "status editor=$editor_present browser=$browser_present term=$term_present pending_layout=$pending_layout"
    last_status_log="$now"
  fi

  all_windows_present=false
  if [ "$editor_present" = true ] && [ "$browser_present" = true ] && [ "$term_present" = true ]; then
    all_windows_present=true
  fi

  if [ "$pending_layout" = true ] && { [ "$editor_present" = true ] || [ "$browser_present" = true ] || [ "$term_present" = true ]; }; then
    if [ $((now - layout_pending_since)) -ge "$LAYOUT_APPLY_DELAY" ]; then
      /opt/scripts/layout.sh || true
      layout_last_applied="$now"
      if [ "$layout_retries" -gt 1 ]; then
        layout_retries=$((layout_retries - 1))
        layout_pending_since="$now"
        pending_layout=true
      else
        layout_retries=0
        pending_layout=false
        if [ "$all_windows_present" = true ]; then
          layout_initialized=true
        fi
      fi
    fi
  fi

  if [ "$editor_present" = false ] && ! is_process_running "lite-xl"; then
    if [ $((now - last_editor_launch)) -ge "$APP_RELAUNCH_DELAY" ]; then
      log_event "editor missing; relaunching"
      launch_editor
      last_editor_launch="$now"
      mark_layout_pending
    fi
  fi
  if [ "$browser_present" = false ] && ! is_process_running "chromium"; then
    if [ $((now - last_browser_launch)) -ge "$APP_RELAUNCH_DELAY" ]; then
      log_event "browser missing; relaunching"
      launch_browser
      ensure_cdp_proxy
      last_browser_launch="$now"
      mark_layout_pending
    fi
  fi
  if [ "$term_present" = false ] && ! is_process_running "xterm"; then
    if [ $((now - last_term_launch)) -ge "$APP_RELAUNCH_DELAY" ]; then
      log_event "terminal missing; relaunching"
      launch_terminal
      last_term_launch="$now"
      mark_layout_pending
    fi
  fi

  set_black_bg "$now"
  disable_compositing "$now"
  if [ "$layout_initialized" = true ] && [ "$pending_layout" = false ]; then
    if [ $((now - layout_last_applied)) -ge "$LAYOUT_SAVE_DELAY" ]; then
      save_layout || true
    fi
  fi
  sleep_interval="$CHECK_INTERVAL"
  if [ "$pending_layout" = true ]; then
    sleep_interval=1
  fi
  sleep "$sleep_interval"
done
