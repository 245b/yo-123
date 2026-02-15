# Runtime Architecture Guardrails

## Process Boundaries
- Control plane: `Operator-web/server/app.ts` and HTTP/WS routes.
- Runtime supervisor: host orchestration and restart budgeting only.
- Exec host: command/task execution and tool orchestration.
- PTY host: interactive process management and buffering.
- Extension host: internal extension API v1 handlers.
- LSP host: language-server process lifecycle.

## Layering Rules
- UI rendering modules must not spawn processes or perform execution control.
- Runtime hosts must communicate only through typed IPC envelopes in `@operator/contracts`.
- Contract versions are additive and backward compatible.
- Shared services resolve dependencies through `@operator/runtime-core` service container.

## Restart and Error Containment
- Host failures are isolated and surfaced as structured health events.
- Restart policy is bounded by role-specific budgets.
- Degraded state is explicit and observable.
- No implicit fallback loops without state transitions.

## Logging and Correlation
Every runtime log event must include:
- `requestId`
- `sessionId`
- `chatId`
- `hostRole`
- `channel`
- `event`
- `ts`
