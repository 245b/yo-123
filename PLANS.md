# VS Code-Grade Isolation Refactor Plan Tracker

This file is the authoritative execution plan for the runtime isolation refactor.

## Objectives
- Isolate runtime responsibilities into independent processes with bounded restart policies.
- Keep external HTTP/WS behavior stable while migrating internal protocols and hosts.
- Port proven VS Code patterns for service wiring, command routing, host lifecycle, and error containment.

## Phase Checklist
- [x] Phase 0: Baseline and architecture guardrails started.
- [x] Phase 1: Shared runtime foundation complete.
- [x] Phase 2: Role-based host supervisor baseline complete.
- [x] Phase 3: PTY host v2 baseline complete.
- [x] Phase 4: Extension host + LSP host contracts complete.
- [x] Phase 5: Data service hardening baseline complete.
- [x] Phase 6: Operator-web UI module boundary refactor complete.
- [x] Phase 7: Operator runtime enforcement in vnc-desktop baseline complete.
- [x] Phase 8: Rollout + legacy cleanup complete.

## Runtime Flags
- `OPERATOR_RUNTIME_V2=0|1`
- `OPERATOR_PTY_BACKEND=legacy|term-agent-pty|pty-host-v2`
- `OPERATOR_EXTENSION_HOST_V1=0|1`
- `OPERATOR_LSP_HOST_V1=0|1`
- `TERM_AGENT_IMPL=python|ts`

## Acceptance Gates
- Control plane remains healthy when exec/pty/extension/lsp hosts fail.
- PTY sessions can be restored after host restart.
- WS/API contracts remain backward-compatible.
- `bun run verify` and `bun run stress` pass with v2 flags enabled.

---

# Codex-Grade Execution Architecture Rollout Tracker

This section tracks the Codex reference extraction + wiring rollout (no Rust binaries in production; TS ports only).

## Status Checklist
- [x] Add `@operator/execution` (`packages/execution`) with Codex-derived primitives (HeadTailBuffer, spawn env hardening, restart budget, spawnSafe).
- [x] Wire TS path aliases for `@operator/execution/*`.
- [x] Migrate core host spawns to `spawnSafe` (runtime-core HostSupervisor, runtime supervisor, pty-host client, dev scripts).
- [x] Add backward-compatible WS event schema `exec_process_exit` and extend host role enums with `data-host`.
- [x] Implement Unified Exec Manager v3 (HeadTailBuffer, delta cap, trailing-output grace, deterministic exit watcher, docker env defaults) behind `OPERATOR_EXEC_V3=0|1`.
- [x] Wire worker -> WS forwarding for `exec_process_exit`.
- [x] Upgrade PTY host v2 to production docker mode + buffering + heartbeat/exit events and client restart budget.
- [x] Add `data-host` isolation for cleanup behind `OPERATOR_DATA_HOST_V1=0|1` (stdio IPC + restart budget).
- [x] Implement ToolRegistry/ToolOrchestrator v2 behind `OPERATOR_TOOL_REGISTRY_V2=0|1` (mutating gate + approval/fallback semantics).
- [x] Implement Bun/TS term-agent server behind `TERM_AGENT_IMPL=ts` + parity harness vs python; keep python default until gates are green.
- [x] UI wiring: handle `runtime_host_health` + `exec_process_exit`.
- [x] UI tests: add Playwright assertions for runtime health + `exec_process_exit` (and run stress gate).
- [x] Enforce `spawnSafe` everywhere (no stray `Bun.spawn` outside `packages/execution/src/spawn-safe.ts`), update compose dev flags, run `verify`/`stress`/`infra` gates, and update third-party notices for ports.

## Rollout Flags
- `OPERATOR_RUNTIME_V2=0|1`
- `OPERATOR_EXEC_V3=0|1`
- `OPERATOR_TOOL_REGISTRY_V2=0|1`
- `OPERATOR_PTY_BACKEND=legacy|term-agent-pty|pty-host-v2`
- `OPERATOR_PTY_HOST_MODE=local|docker`
- `OPERATOR_DATA_HOST_V1=0|1`
- `OPERATOR_EXTENSION_HOST_V1=0|1`
- `OPERATOR_LSP_HOST_V1=0|1`
- `TERM_AGENT_IMPL=python|ts`

## Acceptance Gates (Codex Rollout)
- No control-plane crash when exec-host/pty-host/data-host fail.
- Backgrounded commands emit deterministic `exec_process_exit` with final head/tail output.
- PTY sessions survive pty-host restarts via snapshot + restore path.
- UI remains responsive and reflects degraded host states.
- `bun run verify` passes twice consecutively with dev rollout flags enabled.
