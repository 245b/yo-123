#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="${1:-}"
if [ -z "$CONFIG_PATH" ] || [ ! -f "$CONFIG_PATH" ]; then
  exit 0
fi

python - "$CONFIG_PATH" <<'PY'
import re
import sys

path = sys.argv[1]
text = open(path, "r", encoding="utf-8").read()
updated = False

pattern = r"\\s*<!-- codex:custom-keybinds -->\\n(?:\\s*<keybind\\b[\\s\\S]*?</keybind>\\n)+"
text, count = re.subn(pattern, "", text, count=1)
if count:
    updated = True

title_pattern = re.compile(r"<titleLayout>([^<]*)</titleLayout>")
match = title_pattern.search(text)
if match:
    layout = match.group(1).strip()
    # Remove label/title, iconify (minimize), and window icon buttons.
    remove_chars = {"L", "I", "N"}
    new_layout = "".join(ch for ch in layout if ch not in remove_chars)
    if "C" not in new_layout:
        new_layout += "C"
    if not new_layout:
        new_layout = "C"
    if new_layout != layout:
        text = text.replace(match.group(0), f"<titleLayout>{new_layout}</titleLayout>")
        updated = True

if updated:
    open(path, "w", encoding="utf-8").write(text)
PY
