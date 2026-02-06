#!/usr/bin/env bash
set -euo pipefail

WEB_DIR="${NOVNC_WEB_DIR:-/usr/share/novnc}"
UI_JS="${WEB_DIR}/app/ui.js"
VNC_HTML="${WEB_DIR}/vnc.html"

if [ ! -f "$UI_JS" ]; then
  exit 0
fi

python - "$UI_JS" <<'PY'
import sys
import re

path = sys.argv[1]
text = open(path, "r", encoding="utf-8").read()

updated = False

import_block = """import { isTouchDevice, isMac, isIOS, isAndroid, isChromeOS, isSafari,
         hasScrollbarGutter, dragThreshold }
    from '../core/util/browser.js';
"""

new_import_block = """import * as Browser from '../core/util/browser.js';
const { isTouchDevice, isMac, isIOS, isAndroid, isChromeOS, isSafari, hasScrollbarGutter } = Browser;
const dragThreshold = Browser.dragThreshold ?? (10 * (window.devicePixelRatio || 1));
"""

if "import * as Browser from '../core/util/browser.js';" not in text and import_block in text:
    text = text.replace(import_block, new_import_block)
    updated = True

old = """        document.getElementById("noVNC_control_bar_handle")
            .addEventListener('mousedown', UI.controlbarHandleMouseDown);
        document.getElementById("noVNC_control_bar_handle")
            .addEventListener('mouseup', UI.controlbarHandleMouseUp);
        document.getElementById("noVNC_control_bar_handle")
            .addEventListener('mousemove', UI.dragControlbarHandle);
"""

new = """        const controlBarHandle = document.getElementById("noVNC_control_bar_handle");
        if (controlBarHandle) {
            controlBarHandle.addEventListener('mousedown', UI.controlbarHandleMouseDown);
            controlBarHandle.addEventListener('mouseup', UI.controlbarHandleMouseUp);
            controlBarHandle.addEventListener('mousemove', UI.dragControlbarHandle);
        }
"""

if "const controlBarHandle" not in text and old in text:
    text = text.replace(old, new)
    updated = True

new_touch = """    addTouchSpecificHandlers() {
        const keyboardButton = document.getElementById("noVNC_keyboard_button");
        const keyboardInput = document.getElementById("noVNC_keyboardinput");
        const controlBar = document.getElementById("noVNC_control_bar");
        const controlBarHandle = document.getElementById("noVNC_control_bar_handle");

        if (keyboardButton && keyboardInput) {
            keyboardButton.addEventListener('click', UI.toggleVirtualKeyboard);

            UI.touchKeyboard = new Keyboard(keyboardInput);
            UI.touchKeyboard.onkeyevent = UI.keyEvent;
            UI.touchKeyboard.grab();
            keyboardInput.addEventListener('input', UI.keyInput);
            keyboardInput.addEventListener('focus', UI.onfocusVirtualKeyboard);
            keyboardInput.addEventListener('blur', UI.onblurVirtualKeyboard);
            keyboardInput.addEventListener('submit', () => false);

            document.documentElement
                .addEventListener('mousedown', UI.keepVirtualKeyboard, true);
        }

        if (controlBar) {
            controlBar.addEventListener('touchstart', UI.activateControlbar);
            controlBar.addEventListener('touchmove', UI.activateControlbar);
            controlBar.addEventListener('touchend', UI.activateControlbar);
            controlBar.addEventListener('input', UI.activateControlbar);

            controlBar.addEventListener('touchstart', UI.keepControlbar);
            controlBar.addEventListener('touchmove', UI.keepControlbar);
            controlBar.addEventListener('touchend', UI.keepControlbar);
            controlBar.addEventListener('input', UI.keepControlbar);
        }

        if (controlBarHandle) {
            controlBarHandle.addEventListener('touchstart', UI.controlbarHandleMouseDown);
            controlBarHandle.addEventListener('touchend', UI.controlbarHandleMouseUp);
            controlBarHandle.addEventListener('touchmove', UI.dragControlbarHandle);
        }
    },
"""

if "const keyboardButton = document.getElementById(\"noVNC_keyboard_button\");" not in text:
    pattern = r"    addTouchSpecificHandlers\(\)\s*\{[\s\S]*?\n    \},"
    match = re.search(pattern, text)
    if match:
        text = text[:match.start()] + new_touch + text[match.end():]
        updated = True
    else:
        print("patch-novnc: addTouchSpecificHandlers not found in ui.js", file=sys.stderr)

if updated:
    open(path, "w", encoding="utf-8").write(text)
PY

if [ -f "$VNC_HTML" ]; then
  python - "$VNC_HTML" <<'PY'
import sys
import time

path = sys.argv[1]
text = open(path, "r", encoding="utf-8").read()
updated = False

stamp = int(time.time())
ui_src = f'app/ui.js?patched={stamp}'

if 'src="app/ui.js"' in text:
    text = text.replace('src="app/ui.js"', f'src="{ui_src}"')
    updated = True
elif 'src="app/ui.js?patched=' in text:
    start = text.find('src="app/ui.js?patched=')
    end = text.find('"', start + 5)
    if start != -1 and end != -1:
        text = text[:start] + f'src="{ui_src}"' + text[end+1:]
        updated = True

meta_block = """    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
"""

if "http-equiv=\"Cache-Control\"" not in text:
    if "</head>" in text:
        text = text.replace("</head>", meta_block + "</head>")
        updated = True

if updated:
    open(path, "w", encoding="utf-8").write(text)
PY
fi
