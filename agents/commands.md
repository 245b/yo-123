# Commands

## Root
- Dev (all): `bun run dev`
- Typecheck: `bun run typecheck`
- Unit tests: `bun test`
- Build: `bun run build`
- UI stress (Playwright): `bun run stress`
- Full verification gate: `bun run verify`

## Operator-web (direct)
- Dev (server + web): `bun run --cwd Operator-web dev`
- Dev (web only): `bun run --cwd Operator-web dev:web`
- Dev (server only): `bun run --cwd Operator-web dev:server`
- Typecheck: `bun run --cwd Operator-web typecheck`
- Unit tests: `bun run --cwd Operator-web test`
- Build: `bun run --cwd Operator-web build`
- UI stress (Playwright): `bun run --cwd Operator-web stress`

## Docker (local)
- Start: `docker compose up --build`
- Stop: `docker compose down`

