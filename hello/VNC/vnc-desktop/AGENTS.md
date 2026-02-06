# Repository Guidelines

## Project Structure & Module Organization
- `Dockerfile` and `docker-compose.yml` define the container image and runtime for the headless VNC desktop.
- `scripts/` contains startup and patch scripts (`start-xvfb.sh`, `start-vnc.sh`, `start-novnc.sh`, `layout.sh`) invoked by `supervisord.conf`.
- `config/` is bind-mounted for desktop settings (Openbox/Xfce/Thunar/Lite XL) and stores persisted layout in `config/window-layout.env`.
- `workspace/` is the user workspace mounted to `/home/operator/workspace` inside the container.

## Build, Test, and Development Commands
- `docker compose up -d --build` builds the image and starts the VNC/noVNC services.
- `docker compose down` stops and removes the running container.
- `docker compose logs -f` tails supervisor and service logs for debugging.
- Optional: `docker compose exec vnc bash` opens a shell in the running container.

## Coding Style & Naming Conventions
- Shell scripts use Bash (`#!/usr/bin/env bash`) and follow `set -euo pipefail`; keep that pattern.
- Indentation is 2 spaces in scripts and config files; preserve existing formatting.
- Name scripts with kebab-case verbs (`start-xvfb.sh`, `patch-novnc.sh`).
- Use uppercase environment variables in `docker-compose.yml` and scripts (for example, `VNC_RESOLUTION`, `EDITOR_W_PCT`).

## Testing Guidelines
- There are no automated tests in this repo.
- Manual smoke check: run `docker compose up -d --build`, open `http://localhost:6080/vnc.html`, and confirm the VNC port `5900` responds.

## Commit & Pull Request Guidelines
- No Git history is present in this workspace, so there is no established commit convention to summarize. Suggested default: Conventional Commits (`feat:`, `fix:`, `chore:`).
- PRs should include a short summary, the verification commands used (or "not run"), and screenshots for layout or UI changes.

## Configuration & Secrets
- Store local secrets like `DEEPSEEK_API_KEY` in `.env` or your shell environment; avoid committing real keys.
- If you change defaults in `docker-compose.yml`, update `README.md` to keep the quick-start instructions accurate.

## Execution Context
- When I request changes or actions, I mean in the VM (the VNC desktop/container), not the local machine.


## Important

- do everything for me don't tell me the next step and do it. Put a feedback loop into it. Everytak

- don't set tool usage limit or any limit at all thats my personal agent so do not add limits
