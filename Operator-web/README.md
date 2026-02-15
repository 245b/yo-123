# Operator (Snapshot + Vite + Bun)

Last updated: 2026-02-09

Operator-web is a snapshot wrapper UI that renders captured HTML in two iframes (`public/snapshot.html` and
`public/sidebar.html`) and injects an Operator chat and controls layer. A Bun API server powers a DeepSeek chat
runtime with a Codex-style websocket event loop, PTY-backed terminal execution, and context compaction.

Terminology: "agent" and "operator" refer to the DeepSeek assistant/runtime.

**Major Updates**
- 2026-02-09: Hard cutover to websocket-only chat streaming (`/api/chat/ws`), PTY terminal defaults for VNC Docker,
  and `/api/chat` decommission (`410 Gone`).
- 2026-02-03: Chat runtime refresh, attachment extraction with OCR (PDF/DOCX/text/image), and Playwright stress suite updates.
- 2026-02-02: Web lookup pipeline with recency gating, Playwright render fallback for JS-heavy pages, and MCP search integration.
- 2026-01-26: Chat persistence and sidebar task list bridging.
- 2026-01-23: Attachment viewer and drag/drop attachment UI.

**Stack**
- Frontend: React 18, Vite 6, Tailwind CSS v4
- Backend: Bun (`Bun.serve`)
- Attachments: pdfjs-dist (PDF), mammoth (DOCX), tesseract.js (OCR)
- Tests: Playwright (Chromium)

**Requirements**
- Bun (server, scripts, and dependency install)
- Playwright browser install for tests and optional `WEB_RENDER` (`bun run stress:install`)

**Setup**
1. `bun install`
2. Optional: copy `.env.example` to `.env` and set `DEEPSEEK_API_KEY`
3. Optional: set `TERM_AGENT_TOKEN` if using terminal-only mode

**Development**
- All-in-one: `bun run dev` (API on `http://localhost:3000`, Vite on `http://localhost:5173`)
- Split processes: `bun run dev:server` + `bun run dev:web`
- Same as `bun run dev`: `bun run dev:all`

**Production**
1. `bun install`
2. `bun run check`
3. `bun run start` (`http://localhost:3000`)

**Routes**
- `/` snapshot wrapper UI
- `/t/:id` task route
- `GET /api/health` -> `{ ok: true, ts: string }`
- `GET /api/chat/ws` websocket endpoint for all chat turns/events
- `POST /api/chat` -> `410 Gone` (legacy endpoint removed)

**Behavior Notes**
- Chat history and task metadata are stored in `localStorage`; server logs and transcripts are written under
  `OPERATOR_DATA_DIR` (default `./data`).
- Attachments support PDF, DOCX, images, and text. Images and PDFs can be OCR-processed via `tesseract.js`.
- Built-in lookup uses Brave (if key is set), DuckDuckGo, Wikipedia, MDN, StackOverflow, and GDELT, with recency gating.
- Set `SEARCH_MODE=terminal` to disable built-in web lookup and route search through terminal tools (for example
  `terminal_exec` with `mcp-search`).

**Environment Variables**
Core:
- `PORT` default `3000`
- `CORS_ORIGIN` default `*`
- `OPERATOR_DATA_DIR` default `./data`
- `REQUEST_TIMEOUT_MS` default `120000`
- `OPERATOR_TURN_TIMEOUT_MS` default `0` (`0` disables runtime hard turn cutoff; positive values enforce a max per-turn runtime)

DeepSeek:
- `DEEPSEEK_API_KEY` required for websocket runtime turns
- `DEEPSEEK_MODEL` default `deepseek-chat`
- `DEEPSEEK_VERIFIER_MODEL` default `deepseek-chat` (second-pass truthfulness auditor model; falls back to `DEEPSEEK_MODEL`)
- `DEEPSEEK_BASE_URL` default `https://api.deepseek.com`
- `DEEPSEEK_TIMEOUT_MS` default `120000`
- `DEEPSEEK_TURN_TIMEOUT_MS` default `0` (`0` disables provider tool-loop turn cutoff; positive values enforce a max loop time)
- `OPERATOR_TRUTH_AUDIT_TIMEOUT_MS` default `8000` (caps the post-answer truthfulness audit latency budget per turn)
- `OPERATOR_REASONING_TIMEOUT_MS` default `0` (`0` disables reasoning timeout; positive values cap model “thinking/reasoning” stage per turn before fallback/error)
- `DEEPSEEK_MAX_STEPS` default `0` (tool loop limit)
- `DEEPSEEK_TOOL_STEPS` legacy alias for `DEEPSEEK_MAX_STEPS`
- `DEEPSEEK_CONTEXT_WINDOW` default `128000`
- `DEEPSEEK_AUTO_COMPACT_TOKEN_LIMIT` default `context_window * 0.9`

Assistant control:
- `AGENT_MAX_STEPS` default `0` (tool loop limit for the internal agent)
- `LOOKUP_GATE` default `0` (ask model whether lookup is needed when intent is unclear)
- `TOOL_PREFLIGHT` default `1` (planning gate; forces a JSON plan before any tool execution)
- `TOOL_BUDGET_WEB` default `2` (max web tool calls per request)
- `TOOL_BUDGET_TERMINAL` default `3` (max terminal tool calls per request)
- `ALLOW_TERMINAL_EXEC` default `0` (must be `1` to allow `terminal_exec`/`terminal_send`)
- `SEARCH_MODE` default `terminal` (set to any other value to enable built-in web lookup)
- `WEB_TIME_MAX_USES` default `1` (max time lookups; optional)

Web lookup:
- `WEB_FETCH_TIMEOUT_MS` default `30000`
- `WEB_RENDER` default off (set to `1`, `true`, `on`, or `auto` to enable Playwright render fallback)
- `BRAVE_API_KEY` or `BRAVE_SEARCH_API_KEY` optional
- `BRAVE_API_BASE` optional

PTY / Docker terminal runtime:
- `VNC_CONTAINER_NAME` default `vnc-desktop` (or `workspace` in compose)
- `VNC_WORKDIR` default `/projects/_workspaces`
- `OPERATOR_VNC_CONTAINER` and `OPERATOR_VNC_WORKDIR` are backward-compatible aliases
- `DOCKER_HOST` optional passthrough for remote daemon/socket configurations

Terminal tools:
- File ops: `fs_list`, `fs_stat`, `fs_read`, `fs_write`, `fs_move`, `fs_copy`, `fs_delete`, `fs_mkdir`, `fs_purge`
- Edit ops: `fs_apply_patch`, `fs_replace_ranges`, `editor_open`
- Project ops: `project_detect`, `project_setup`, `project_install`, `project_run`, `project_test`
- File ops are jailed to `WORKSPACE_ROOT`; deletes default to trash under `.trash/`.

Streaming:
- Websocket-only event loop on `/api/chat/ws` (no SSE fallback)
- Runtime responses use an internal JSON-based stance/evidence verifier pass before emitting final plain-text assistant output.
- Internal evidence is source-bound to real `message:*` / `tool:*` IDs before `supported` outputs are accepted.
- User assertions are treated as unsupported by default until source-bound evidence supports them.

MCP search (terminal tools):
- `MCP_PROTOCOL_VERSION` default `2024-11-05`
- `MCP_DDG_URL`, `MCP_DDG_TOOL`, `MCP_DDG_HEADERS`, `MCP_DDG_TOKEN`, `MCP_DDG_TOKEN_HEADER`, `MCP_DDG_TOKEN_PREFIX`,
  `MCP_DDG_TIMEOUT_MS`, `MCP_DDG_RETRIES`, `MCP_DDG_RETRY_DELAY_MS`, `MCP_DDG_PROTOCOL_VERSION`, `MCP_DDG_ARGS`,
  `MCP_DDG_QUERY_KEY`, `MCP_DDG_RESULTS_KEY`
- `MCP_CTX7_URL`, `MCP_CTX7_TOOL`, `MCP_CTX7_TOOL_RESOLVE`, `MCP_CTX7_TOOL_QUERY`, `MCP_CTX7_HEADERS`,
  `MCP_CTX7_TOKEN`, `MCP_CTX7_TOKEN_HEADER`, `MCP_CTX7_TOKEN_PREFIX`, `MCP_CTX7_TIMEOUT_MS`, `MCP_CTX7_RETRIES`,
  `MCP_CTX7_RETRY_DELAY_MS`, `MCP_CTX7_PROTOCOL_VERSION`, `MCP_CTX7_ARGS`, `MCP_CTX7_RESOLVE_ARGS`,
  `MCP_CTX7_QUERY_ARGS`, `MCP_CTX7_QUERY_KEY`, `MCP_CTX7_LIBRARY_NAME_KEY`, `MCP_CTX7_LIBRARY_KEY`,
  `MCP_CTX7_RESULTS_KEY`
- `MCP_YT_URL`, `MCP_YT_TOOL`, `MCP_YT_HEADERS`, `MCP_YT_TOKEN`, `MCP_YT_TOKEN_HEADER`, `MCP_YT_TOKEN_PREFIX`,
  `MCP_YT_TIMEOUT_MS`, `MCP_YT_RETRIES`, `MCP_YT_RETRY_DELAY_MS`, `MCP_YT_PROTOCOL_VERSION`, `MCP_YT_ARGS`,
  `MCP_YT_QUERY_KEY`, `MCP_YT_LANG_KEY`, `MCP_YT_LANG`, `MCP_YT_MAX_VIDEOS`
- `MCP_YT_MAX_VIDEOS` default `10` (script cap remains 20 when passed explicitly via `--max`)
- `MCP_SEARXNG_*` optional provider (same shape as above)

Vite:
- `VITE_API_BASE` optional API origin when the UI is hosted separately

Playwright:
- `PW_PORT` default `4174`

**Tests**
1. `bun run stress:install`
2. `bun run stress`

Artifacts go to `test-results/`.

**Repo map**
- `src/app/`: React app shell (frames, attachments, overlay bridge)
- `src/ms/`: Snapshot DOM patchers and chat UI injected into the snapshot iframe
- `server/`: Bun API server and DeepSeek proxy
- `scripts/`: dev and Playwright server runners
- `public/`: snapshot HTML files
- `tests/`: Playwright tests
