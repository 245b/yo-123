# Repository Guidelines

## Project Structure & Module Organization
- `vnc-desktop/` contains the headless desktop container definition.
- `vnc-desktop/scripts/` includes startup, layout, and patch scripts used by `supervisord.conf`.
- `vnc-desktop/config/` holds persisted desktop/app settings; `vnc-desktop/desktop`, `vnc-desktop/data`, and `vnc-desktop/workspace` are host-mounted persistence.

## Build, Test, and Development Commands
- `cd vnc-desktop` then `docker compose up -d --build` to build and start the VNC/noVNC services.
- `docker compose down` stops the container; `docker compose logs -f` tails logs for debugging.
- `docker compose exec vnc bash` opens a shell inside the running VM container.

## Coding Style & Naming Conventions
- JavaScript/CSS use 2-space indentation and semicolons; match existing formatting.
- Shell scripts are Bash with `set -euo pipefail`; keep that pattern.
- Script filenames in `vnc-desktop/scripts/` use kebab-case (e.g., `start-xvfb.sh`).

## Testing Guidelines
- No automated tests are present.
- Manual checks: open `http://localhost:6080/vnc.html` to confirm the desktop and terminal appear.
- Terminal tool calls should execute in the container via `TERMINAL_MODE=docker`, with `/projects` as the default root.

## Commit & Pull Request Guidelines
- No established history; use Conventional Commits (e.g., `feat:`, `fix:`, `chore:`).
- PRs should include a brief summary, verification commands (or "not run"), and screenshots for UI or layout changes.

## Security & Configuration Tips
- Keep secrets in `vnc-desktop/.env`; never commit real API keys.

## Agent-Specific Instructions
- Requests about changes, terminal commands, or system behavior are intended for the VNC container, not the local machine.
- Terminal tool access targets the `diy-vnc` container by default; update `DOCKER_CONTAINER` only if the container name changes.

## Important

- do everything for me don't tell me the next step and do it. Put a feedback loop into it. Everytak

- don't set tool usage limit or any limit at all thats my personal agent so do not add limits
