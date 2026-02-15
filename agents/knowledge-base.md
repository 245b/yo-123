# Knowledge Base

## Runtime Topology (v2)
- Control plane: `Operator-web/server/app.ts`
- Runtime supervisor: `Operator-web/server/agent/runtime/supervisor.ts`
- Runtime worker: `Operator-web/server/agent/runtime/worker.ts`
- Exec manager: `Operator-web/server/agent/unified-exec/manager.ts`
- PTY host: `Operator-web/server/agent/pty-host/host.ts`

## Contracts
- WS contracts: `packages/contracts/src/ws.ts`

## Rollout Flags
- `OPERATOR_RUNTIME_V2=0|1`
- `OPERATOR_EXEC_V3=0|1`
- `OPERATOR_TOOL_REGISTRY_V2=0|1`
- `OPERATOR_DATA_HOST_V1=0|1`
- `OPERATOR_PTY_BACKEND=legacy|term-agent-pty|pty-host-v2`
- `OPERATOR_PTY_HOST_MODE=local|docker`
- `OPERATOR_EXTENSION_HOST_V1=0|1`
- `OPERATOR_LSP_HOST_V1=0|1`
- `TERM_AGENT_IMPL=python|ts`

## Guardrails
See `docs/runtime-architecture-guardrails.md`.

