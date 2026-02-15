# Start-new Audit Report (2026-02-14)

## Context
- Workspace: `C:\Users\Khali\Desktop\start-new`
- Branch: `publish-main-20260206`
- HEAD: `b5ad70e`
- Timestamp: `2026-02-14T18:30:31.0678895-05:00`

## Baseline Commands (Root)
- `bun run typecheck`: PASS
- `bun test`: PASS
- `bun run build`: PASS
- `bun run stress`: PASS (Playwright)

## Largest Git-Tracked Files (Top 15)
- `0.84 MB` `Operator-web/public/sidebar.html`
- `0.84 MB` `Operator-web/public/snapshot.html`
- `0.08 MB` `Operator-web/Screenshot 2025-12-18 224059.png`
- `0.06 MB` `Operator-web/src/ms/chat/response.ts`
- `0.05 MB` `hello/VNC/vnc-desktop/scripts/term-agent.py`
- `0.04 MB` `hello/VNC/vnc-desktop/scripts/mcp-search.js`
- `0.03 MB` `hello/VNC/vnc-desktop/config/backgrounds/arch_lightweight.webp`
- `0.03 MB` `Operator-web/server/chat/index.ts`
- `0.03 MB` `Operator-web/bun.lock`
- `0.02 MB` `Operator-web/src/ms/chat/session.ts`
- `0.02 MB` `Operator-web/server/web/sources.ts`
- `0.02 MB` `hello/VNC/vnc-desktop/config/openbox/rc.xml`
- `0.02 MB` `Operator-web/server/terminal/client.ts`
- `0.02 MB` `Operator-web/server/web/mcp.ts`
- `0.02 MB` `Operator-web/server/chat/deepseek.ts`

## Git-Tracked Runtime Artifacts
- Pattern scan over `git ls-files` for `data/`, `logs/`, `transcripts/`, `sessions/`, `chromium/`, `*.db`, `*.sqlite`, `*.exe`, `*.log`: no matches in the current index.
- Bulk removal in progress (staged deletions in working tree):
  - `data/`: `95` files
  - `hello/VNC/vnc-desktop/config/chromium/`: `749` files
  - `hello/VNC/vnc-desktop/data/Downloads/Installer_Copy.exe`: `1` file
  - `data/workspace/*`: `2` files

## Spawn Inventory
- `rg "Bun.spawn("` outside `packages/execution/src/spawn-safe.ts`: no matches.

## Untracked Bulk Observations (Should Not Be Committed)
- `Operator-web/vendor/codex-rs` (previously ~`46.23 MiB`) was removed from the workspace.
  - Runtime prompt templates were moved to `agents/templates/*`.
  - Third-party attribution remains in `THIRD_PARTY_NOTICES.md` while referencing upstream paths (instead of a vendored repo).
