# Codex Feedback Loop Analysis

## Scope
This analysis is execution-plane parity only:

- turn orchestration
- runtime tool loop
- approval/user-input pauses
- PTY lifecycle and resize
- runtime event protocol and frontend interaction

Out of scope: full Codex account/config/cloud/admin API surface.

## Current Parity Status

### 1) Feedback Loop Control
Implemented:

- `approve` now resolves real pending tool calls.
- `request_user_input_response` resumes paused turns.
- pending maps are tracked per `chat_id + call_id`.
- timeout behavior is explicit for both approval and user-input waits.

### 2) Turn State Signaling
Implemented:

- explicit turn states in runtime session:
  - `running`
  - `waiting_approval`
  - `waiting_user_input`
  - `completed`
  - `interrupted`
  - `failed`
- `turn_status` events emitted to websocket clients.
- `session_state` now reports `turn_state`.

### 3) Tool Runtime Surface
Implemented in runtime worker:

- terminal tools
- `request_user_input`
- full `fs_*` tool set
- `project_*` tool set
- `editor_open`

Also implemented:

- post-mutation verification hook with auto `project_test` attempt (`OPERATOR_AUTO_PROJECT_TEST`, enabled by default).

### 4) PTY Lifecycle
Implemented:

- interactive process reuse with `process_id`
- `write_stdin`
- `terminate_command`
- `resize_pty` routed end-to-end (`ws -> supervisor -> worker -> unified exec manager`)
- `pty_resized` event emitted

Term-agent parity additions:

- `/v1/terminal/open`
- `/v1/terminal/resize`
- `/v1/terminal/terminate`
- optional interactive backend preference: `OPERATOR_PTY_BACKEND=term-agent-pty` (docker-subprocess remains fallback/default).

### 5) Frontend Runtime Interaction
Implemented in websocket stream handler:

- renders approval prompts and sends `approve_tool`
- renders request-user-input forms and sends `request_user_input_response`
- interactive running-terminal controls:
  - send stdin
  - terminate process
  - resize observer emits `resize_pty`

Legacy event rendering remains compatible.

### 6) DeepSeek Runtime Integration
Implemented:

- env-first key resolution:
  - `DEEPSEEK_API_KEY`
  - `OPERATOR_DEEPSEEK_API_KEY`
  - `DEEPSEEK_KEY`
- compaction/token/runtime events preserved.

### 7) Rust Runtime Track
Implemented:

- runtime selector in supervisor:
  - default Bun runtime
  - `OPERATOR_RUNTIME_IMPL=rust` for Rust path
- Rust runtime binary now protocol-bridges stdin/stdout to Bun worker for execution-plane behavior parity.

## Remaining Caveats

- Rust runtime is currently a bridge wrapper, not a native independent execution engine.
- PTY resize in docker-subprocess backend uses shell `stty` semantics; this is practical parity, not a true kernel PTY API.
- Old clients can ignore additive events, but won't render approval/user-input UI unless updated frontend code is active.

## Validation Evidence
Verified on this pass:

- `bun run typecheck`
- `bun test ./server/agent/runtime`
- `bun run build`
- `bunx playwright test tests/smoke.pw.ts tests/chat-tabs-isolation.pw.ts`
- `python -m py_compile hello/VNC/vnc-desktop/scripts/term-agent.py`
