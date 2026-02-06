# Operator (Snapshot + Vite + Bun)

Last updated: 2026-02-05

Operator-web is a snapshot wrapper UI that renders captured HTML in two iframes (`public/snapshot.html` and
`public/sidebar.html`) and injects an Operator chat and controls layer. A Bun API server powers a DeepSeek chat
proxy with optional streaming, web lookup, and terminal tool calls.

Terminology: "agent" and "operator" refer to the DeepSeek assistant/runtime.

**Major Updates**
- 2026-02-03: Chat runtime refresh, attachment extraction with OCR (PDF/DOCX/text/image), terminal tool integration with SSE
  streaming, and Playwright stress suite updates.
- 2026-02-02: Web lookup pipeline with recency gating, Playwright render fallback for JS-heavy pages, and MCP search integration.
- 2026-01-26: Chat persistence and sidebar task list bridging.
- 2026-01-23: Attachment viewer and drag/drop attachment UI.

**Stack**
- Frontend: React 18, Vite 6, Tailwind CSS v4
- Backend: Bun (`Bun.serve`)
- Attachments: pdfjs-dist (PDF), mammoth (DOCX), tesseract.js (OCR)
- Tests: Playwright (Chromium)

**Requirements**
- Node.js + npm (Vite and Playwright)
- Bun (server and scripts)
- Playwright browser install for tests and optional `WEB_RENDER` (`npm run stress:install`)

**Setup**
1. `npm install`
2. Optional: copy `.env.example` to `.env` and set `DEEPSEEK_API_KEY`
3. Optional: set `TERM_AGENT_TOKEN` if using terminal-only mode

**Development**
- All-in-one: `npm run dev` (API on `http://localhost:3000`, Vite on `http://localhost:5173`)
- Split processes: `npm run dev:server` + `npm run dev:web`
- Same as `npm run dev`: `npm run dev:all`

**Production**
1. `npm install`
2. `npm run check`
3. `npm run start` (`http://localhost:3000`)

**Routes**
- `/` snapshot wrapper UI
- `/t/:id` task route
- `GET /api/health` -> `{ ok: true, ts: string }`
- `POST /api/chat` -> `{ ok: true, text: string, model: string }` (accepts `msg` or `messages`, optional `model`, `chatId`, `sessionId`, `allow_terminal_exec`)
- Streaming: send `Accept: text/event-stream` or `x-stream: 1` to receive SSE events (`run`, `work`, `search`, `delta`,
  `term`, `done`, `error`)

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

DeepSeek:
- `DEEPSEEK_API_KEY` required for `/api/chat`
- `DEEPSEEK_MODEL` default `deepseek-chat`
- `DEEPSEEK_BASE_URL` default `https://api.deepseek.com`
- `DEEPSEEK_TIMEOUT_MS` default `120000`
- `DEEPSEEK_MAX_STEPS` default `0` (tool loop limit)
- `DEEPSEEK_TOOL_STEPS` legacy alias for `DEEPSEEK_MAX_STEPS`

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

Terminal agent:
- `TERM_AGENT_TOKEN` required when `SEARCH_MODE=terminal`
- `TERM_AGENT_URL` default `http://workspace:7682`
- `WORKSPACE_TERM_AGENT` optional fallback URL
- `TERM_AGENT_TIMEOUT_MS` default `20000` (falls back to `REQUEST_TIMEOUT_MS` if set)
- `TERM_SESSION_ID` optional; leave empty to use per-chat session IDs
- `WORKSPACE_ROOT` default `/workspace` (filesystem jail root)
- `TRASH_DIR` optional override (defaults to `${WORKSPACE_ROOT}/.trash`)
- `TERM_AGENT_PERMS` optional `read`, `write`, `exec`, or `all` (default `all`)

Terminal tools:
- File ops: `fs_list`, `fs_stat`, `fs_read`, `fs_write`, `fs_move`, `fs_copy`, `fs_delete`, `fs_mkdir`, `fs_purge`
- Edit ops: `fs_apply_patch`, `fs_replace_ranges`, `editor_open`
- Project ops: `project_detect`, `project_setup`, `project_install`, `project_run`, `project_test`
- File ops are jailed to `WORKSPACE_ROOT`; deletes default to trash under `.trash/`.

Streaming:
- `STREAM_WORD_DELAY_MS` default `8`
- `STREAM_WORD_GROUP` default `1`

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
- `MCP_SEARXNG_*` optional provider (same shape as above)

Vite:
- `VITE_API_BASE` optional API origin when the UI is hosted separately

Playwright:
- `PW_PORT` default `4174`

**Tests**
1. `npm run stress:install`
2. `npm run stress`

Artifacts go to `test-results/`.

**Repo map**
- `src/app/`: React app shell (frames, attachments, overlay bridge)
- `src/ms/`: Snapshot DOM patchers and chat UI injected into the snapshot iframe
- `server/`: Bun API server and DeepSeek proxy
- `scripts/`: dev and Playwright server runners
- `public/`: snapshot HTML files
- `tests/`: Playwright tests
