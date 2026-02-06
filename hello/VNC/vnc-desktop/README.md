# DIY VNC Desktop (Lite XL + Chromium + Terminal)

This container provides a headless Arch Linux (x86_64) desktop exposed over noVNC with:
- Lite XL pinned on the left (30% width).
- Chromium on the right (top).
- Terminal on the bottom-right (25% height).

Windows are kept open; if you close one, it will relaunch.
No VNC password is set by default (set `VNC_PASSWORD` or `VNC_PASSWORD_FILE` to enable auth).
Openbox is used (panel and desktop icons enabled), with a pitch-black background and hidden window titles.
Tip: hold Alt and drag to move a window for quick repositioning.

## Quick start

```powershell
cd C:\Users\Khali\Desktop\start-new\hello\VNC\vnc-desktop
# Optional: set your DeepSeek key for apps/scripts
setx DEEPSEEK_API_KEY "YOUR_KEY"

# Build and run
docker compose up -d --build
```

Open noVNC in a browser:
- http://localhost:6080/vnc.html

Direct VNC:
- localhost:5900

## Layout and persistence

Window geometry is saved to:
- C:\Users\Khali\Desktop\start-new\hello\VNC\vnc-desktop\config\window-layout.env

If you move/resize windows, the layout is persisted and restored on refresh.    
To reset the layout, delete that file and restart the container.

Chromium profile data is persisted at:
- C:\Users\Khali\Desktop\start-new\hello\VNC\vnc-desktop\config\chromium

Desktop, data, and projects directories are persisted at:
- C:\Users\Khali\Desktop\start-new\hello\VNC\vnc-desktop\desktop
- C:\Users\Khali\Desktop\start-new\hello\VNC\vnc-desktop\data
- C:\Users\Khali\Desktop\start-new\hello\VNC\vnc-desktop\workspace (mounted to `/projects` and `/home/operator/workspace`)

## Key environment options (docker-compose.yml)

- VNC_RESOLUTION=1152x648
- VNC_COL_DEPTH=24
- VNC_LISTEN=0.0.0.0 (set to 127.0.0.1 to only expose on localhost)
- VNC_PASSWORD= (optional; set to require VNC auth)
- VNC_PASSWORD_FILE= (optional; path to x11vnc password file)
- EDITOR_W_PCT=30
- TERM_H_PCT=25
- BROWSER_URL=about:blank
- BROWSER_DEBUG_PORT=9222
- BROWSER_CDP_PROXY_PORT=9223 (host port 9222 forwards here for CDP access)
- EDITOR_EXTRA_FLAGS=
- ENABLE_DESKTOP_EXTRAS=0 (set to 1 to enable the XFCE panel)
- ENABLE_DESKTOP_ICONS=1 (set to 0 to disable desktop icons)
- APP_RELAUNCH_DELAY=8 (seconds before relaunching closed apps)
- STATUS_LOG_INTERVAL=60 (seconds between app supervisor status logs)
- COMPOSITOR_CHECK_INTERVAL=30 (seconds between compositor disable checks)
- BLACK_BG_REFRESH_INTERVAL=30 (seconds between background refreshes when icons are off)

## Memory tuning (docker-compose.yml)

Defaults enable low-memory mode and log snapshots to `/home/operator/.logs/memory.log`.

- LOW_MEMORY_MODE=1
- BROWSER_RENDERER_LIMIT=2
- BROWSER_MAX_MEM_MB=384
- BROWSER_DISABLE_EXTENSIONS=1
- BROWSER_EXTRA_FLAGS=
- ENABLE_COMPOSITOR=0
- MEMORY_LOG_INTERVAL=60 (set to 0 to disable)

## Notes on performance

This image targets x86_64 by default (`archlinux:latest`, `platform: linux/amd64`).
If you need ARM/aarch64 again, switch the base image back to `menci/archlinuxarm:latest`
and set `DEBIAN_ARCH=arm64` with `DEBIAN_LIB_DIR=aarch64-linux-gnu` in the Dockerfile.

## Stop

```powershell
docker compose down
```
