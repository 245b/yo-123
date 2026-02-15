# Operator-web Codex Runtime Migration

## Summary
`operator-web` runs chat turns through a websocket-to-runtime bridge.

- Public transport: `WS /api/chat/ws`
- Deprecated transport: `POST /api/chat` (`410 Gone`)
- Runtime owner: `server/agent/runtime/worker.ts`
- Supervisor: `server/agent/runtime/supervisor.ts`

This now includes execution-plane parity features for approval pausing, user-input pausing, PTY resize, richer tool runtime, and turn-state events.

## Runtime Protocol
All runtime traffic is line-delimited JSON envelopes over stdio.

- Request: `{"kind":"request","id":"...","method":"...","params":{}}`
- Response: `{"kind":"response","id":"...","ok":true,"result":{}}`
- Event: `{"kind":"event","chat_id":"...","payload":{"type":"..."}}`

## Methods
Supported runtime control methods:

- `submit_user_turn`
- `approve`
- `request_user_input_response`
- `interrupt`
- `list_sessions`
- `resume_session`
- `write_stdin`
- `resize_pty`
- `terminate_command`
- `upload_feedback`
- `exec_command` (compat direct command path)

## Event Surface
Core runtime events plus additive parity events:

- `runtime_capabilities`
- `turn_status`
- `tool_approval_requested`
- `request_user_input_requested`
- `pty_resized`
- `task_started`, `turn_started`, `item_started`
- `agent_message_content_delta`, `reasoning_content_delta`
- `exec_command_begin`, `exec_command_output_delta`, `terminal_interaction`, `exec_command_end`
- `token_count`, `context_compacted`
- `task_complete`, `turn_complete`
- `warning`, `error`

## Turn State Machine
Per-session turn state is tracked and emitted:

- `running`
- `waiting_approval`
- `waiting_user_input`
- `completed`
- `interrupted`
- `failed`

Pending approvals/user-input requests are stored and resolved deterministically, including timeout behavior.

## Tool Runtime
Runtime worker tool loop now supports:

- Terminal: `session_ensure`, `terminal_exec`, `terminal_send`, `terminal_capture`, `terminate_command`
- User input gate: `request_user_input`
- FS: `fs_list`, `fs_stat`, `fs_read`, `fs_write`, `fs_move`, `fs_copy`, `fs_delete`, `fs_mkdir`, `fs_purge`, `fs_apply_patch`, `fs_replace_ranges`
- Project: `project_detect`, `project_setup`, `project_install`, `project_run`, `project_test`
- Editor: `editor_open`

Post-mutation verification hook:

- After successful mutating tools, runtime can auto-run `project_test` (default enabled).
- Disable with `OPERATOR_AUTO_PROJECT_TEST=0`.

## PTY / Terminal
Unified exec manager keeps interactive process lifecycle:

- process cap: `64`
- protect-recent set: `8`
- interactive `process_id` reuse
- `resize_pty` mapped to interactive shell resize (`stty cols/rows`)
- `terminate_command` for active process cleanup

Term-agent updates (additive):

- `/v1/terminal/open`
- `/v1/terminal/resize`
- `/v1/terminal/terminate`
- backend selector: `OPERATOR_PTY_BACKEND=term-agent-pty` to prefer term-agent for interactive PTY flow (falls back to docker-subprocess on failure).

Legacy term-agent endpoints remain supported.

## DeepSeek Runtime
Runtime uses DeepSeek as the active provider and resolves key env-first:

- `DEEPSEEK_API_KEY` (preferred)
- `OPERATOR_DEEPSEEK_API_KEY`
- `DEEPSEEK_KEY`

Compaction/token lifecycle remains active and emitted over runtime events.

## Runtime Selection
Bun worker remains default runtime.

- Default: Bun worker (`server/agent/runtime/worker.ts`)
- Rust selector: `OPERATOR_RUNTIME_IMPL=rust`
- Explicit command override: `OPERATOR_RUNTIME_CMD="..."`

Rust runtime is optional. Enable with `OPERATOR_RUNTIME_IMPL=rust` and set `OPERATOR_RUNTIME_RUST_MANIFEST` to a local Codex (codex-rs) `Cargo.toml` path.

## Validation
Verified on current migration pass:

- `bun run typecheck`
- `bun test ./server/agent/runtime`
- `bun run build`
- `bunx playwright test tests/smoke.pw.ts tests/chat-tabs-isolation.pw.ts`
- `python -m py_compile hello/VNC/vnc-desktop/scripts/term-agent.py`
