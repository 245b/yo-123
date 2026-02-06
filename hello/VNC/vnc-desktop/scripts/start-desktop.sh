#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:0}"
RUN_USER="${RUN_USER:-operator}"
RUN_HOME="${RUN_HOME:-/home/operator}"
WORKSPACE_DIR="${WORKSPACE_DIR:-${RUN_HOME}/Desktop}"
DATA_DIR="${DATA_DIR:-${RUN_HOME}/Data}"
DOWNLOAD_DIR="${DOWNLOAD_DIR:-${DATA_DIR}/Downloads}"
PROJECTS_DIR="${PROJECTS_DIR:-/projects}"
OPERATOR_DIR="${OPERATOR_DIR:-${PROJECTS_DIR%/}/Operator}"
TRASH_DIR="${TRASH_DIR:-/trash}"
RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-${RUN_USER}}"
OPENBOX_DIR="${RUN_HOME}/.config/openbox"

if [ "$WORKSPACE_DIR" = "${RUN_HOME}/workspace" ]; then
  WORKSPACE_DIR="${RUN_HOME}/Desktop"
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

wait_for_display || true

# Seed desktop/data folders so the VM feels less empty and stays organized.
DESKTOP_DIR="${RUN_HOME}/Desktop"
TEMP_DIR="${DATA_DIR}/Temp Files"
DOCS_DIR="${DATA_DIR}/Documents"
MUSIC_DIR="${DATA_DIR}/Music"
PICTURES_DIR="${DATA_DIR}/Pictures"
VIDEOS_DIR="${DATA_DIR}/Videos"
TEMPLATES_DIR="${DATA_DIR}/Templates"
PUBLIC_DIR="${DATA_DIR}/Public"
INSTALLER_FILE="${DOWNLOAD_DIR}/Installer_Copy.exe"
mkdir -p "$DESKTOP_DIR" "$DATA_DIR" "$DOWNLOAD_DIR" "$TEMP_DIR" "$DOCS_DIR" \
  "$MUSIC_DIR" "$PICTURES_DIR" "$VIDEOS_DIR" "$TEMPLATES_DIR" "$PUBLIC_DIR"
mkdir -p "$PROJECTS_DIR"
mkdir -p "$OPERATOR_DIR"

for entry in "$PROJECTS_DIR"/* "$PROJECTS_DIR"/.[!.]* "$PROJECTS_DIR"/..?*; do
  if [ ! -e "$entry" ]; then
    continue
  fi

  if [ "$entry" = "$OPERATOR_DIR" ]; then
    continue
  fi

  rm -rf "$entry" 2>/dev/null || true
done

chown root:operator "$PROJECTS_DIR" 2>/dev/null || true
chmod 2775 "$PROJECTS_DIR" 2>/dev/null || true
chown root:operator "$OPERATOR_DIR" 2>/dev/null || true
chmod 2775 "$OPERATOR_DIR" 2>/dev/null || true
ensure_symlink() {
  local target="$1"
  local link_path="$2"
  if [ -L "$link_path" ]; then
    local current
    current="$(readlink "$link_path" || true)"
    if [ "$current" != "$target" ]; then
      rm -f "$link_path"
      ln -s "$target" "$link_path"
    fi
  elif [ ! -e "$link_path" ]; then
    ln -s "$target" "$link_path"
  fi
}
if [ -n "$TRASH_DIR" ] && [ "$TRASH_DIR" != "/" ]; then
  mkdir -p "$TRASH_DIR/files" "$TRASH_DIR/info"
  mkdir -p "$RUN_HOME/.local/share"
  chown -R "$RUN_USER:$RUN_USER" "$TRASH_DIR" 2>/dev/null || true
  trash_link="$RUN_HOME/.local/share/Trash"
  if [ -L "$trash_link" ]; then
    current_trash="$(readlink "$trash_link" || true)"
    if [ "$current_trash" != "$TRASH_DIR" ]; then
      rm -f "$trash_link"
    fi
  elif [ -d "$trash_link" ]; then
    if [ -d "$trash_link/files" ]; then
      find "$trash_link/files" -mindepth 1 -maxdepth 1 -exec mv -t "$TRASH_DIR/files" {} + 2>/dev/null || true
    fi
    if [ -d "$trash_link/info" ]; then
      find "$trash_link/info" -mindepth 1 -maxdepth 1 -exec mv -t "$TRASH_DIR/info" {} + 2>/dev/null || true
    fi
    rm -rf "$trash_link" 2>/dev/null || true
  fi
  if [ ! -e "$trash_link" ]; then
    ln -s "$TRASH_DIR" "$trash_link"
  fi
else
  mkdir -p "$RUN_HOME/.local/share/Trash/files" "$RUN_HOME/.local/share/Trash/info"
fi
if [ ! -f "$TEMP_DIR/README.txt" ]; then
  cat > "$TEMP_DIR/README.txt" <<'EOF'
Temp Files
Drop scratch files here; this folder is safe to delete anytime.
EOF
fi
if [ ! -f "$TEMP_DIR/example.txt" ]; then
  printf 'Sample temp file.\n' > "$TEMP_DIR/example.txt"
fi
ensure_symlink "$TEMP_DIR" "$DESKTOP_DIR/Temp Files"
ensure_symlink "$DATA_DIR" "$DESKTOP_DIR/Data"
ensure_symlink "$DOWNLOAD_DIR" "$DESKTOP_DIR/Downloads"
ensure_symlink "$OPERATOR_DIR" "$DESKTOP_DIR/Projects"
if [ ! -f "$INSTALLER_FILE" ]; then
  dd if=/dev/zero of="$INSTALLER_FILE" bs=1M count=100 status=none || true
fi
ensure_symlink "$DOWNLOAD_DIR" "$RUN_HOME/Downloads"
ensure_symlink "$DOCS_DIR" "$RUN_HOME/Documents"
ensure_symlink "$MUSIC_DIR" "$RUN_HOME/Music"
ensure_symlink "$PICTURES_DIR" "$RUN_HOME/Pictures"
ensure_symlink "$VIDEOS_DIR" "$RUN_HOME/Videos"
ensure_symlink "$TEMPLATES_DIR" "$RUN_HOME/Templates"
ensure_symlink "$PUBLIC_DIR" "$RUN_HOME/Public"
ensure_symlink "$OPERATOR_DIR" "$RUN_HOME/Projects"

if [ -d "$DESKTOP_DIR/Projects" ] && [ ! -L "$DESKTOP_DIR/Projects" ]; then
  if [ -z "$(ls -A "$DESKTOP_DIR/Projects" 2>/dev/null)" ]; then
    rmdir "$DESKTOP_DIR/Projects" 2>/dev/null || true
    ensure_symlink "$OPERATOR_DIR" "$DESKTOP_DIR/Projects"
  fi
fi
if [ -d "$RUN_HOME/Projects" ] && [ ! -L "$RUN_HOME/Projects" ]; then
  if [ -z "$(ls -A "$RUN_HOME/Projects" 2>/dev/null)" ]; then
    rmdir "$RUN_HOME/Projects" 2>/dev/null || true
    ensure_symlink "$OPERATOR_DIR" "$RUN_HOME/Projects"
  fi
fi

# Disable screensaver and power management.
if xdpyinfo >/dev/null 2>&1; then
  xset -dpms || true
  xset s noblank || true
  xset s off || true
  xsetroot -solid "#000000" >/dev/null 2>&1 || true
fi

if [ -d /tmp ]; then
  find /tmp -mindepth 1 -maxdepth 1 \
    ! -name '.X11-unix' \
    ! -name '.ICE-unix' \
    ! -name '.XIM-unix' \
    ! -name '.font-unix' \
    -exec rm -rf {} + 2>/dev/null || true
fi
rm -rf /var/tmp/* 2>/dev/null || true

mkdir -p "$RUNTIME_DIR"
chmod 700 "$RUNTIME_DIR"
if id "$RUN_USER" >/dev/null 2>&1; then
  chown "$RUN_USER:$RUN_USER" "$RUNTIME_DIR" 2>/dev/null || true
  chown -R "$RUN_USER:$RUN_USER" "$DATA_DIR" "$DESKTOP_DIR" "$RUN_HOME/.local" \
    2>/dev/null || true
fi

mkdir -p "$OPENBOX_DIR"
if [ ! -f "$OPENBOX_DIR/rc.xml" ]; then
  if [ -f /etc/xdg/openbox/rc.xml ]; then
    cp /etc/xdg/openbox/rc.xml "$OPENBOX_DIR/rc.xml"
  elif [ -f /usr/share/openbox/rc.xml ]; then
    cp /usr/share/openbox/rc.xml "$OPENBOX_DIR/rc.xml"
  fi
fi
if [ -x /opt/scripts/patch-openbox.sh ] && [ -f "$OPENBOX_DIR/rc.xml" ]; then
  /opt/scripts/patch-openbox.sh "$OPENBOX_DIR/rc.xml" || true
fi
if [ -f "$OPENBOX_DIR/autostart" ]; then
  chmod +x "$OPENBOX_DIR/autostart" 2>/dev/null || true
fi
if id "$RUN_USER" >/dev/null 2>&1; then
  chown -R "$RUN_USER:$RUN_USER" "$OPENBOX_DIR" 2>/dev/null || true
fi

if id "$RUN_USER" >/dev/null 2>&1; then
  exec runuser -u "$RUN_USER" -- env \
    HOME="$RUN_HOME" \
    USER="$RUN_USER" \
    LOGNAME="$RUN_USER" \
    XDG_RUNTIME_DIR="$RUNTIME_DIR" \
    dbus-run-session -- openbox-session
fi
exec dbus-run-session -- openbox-session
