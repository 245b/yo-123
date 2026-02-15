# Agent Instructions

Repo-wide agent/operator instructions live under `agents/`.

- Rules (source of truth): `agents/rules/`
- Knowledge base: `agents/knowledge-base.md`
- Commands / workflows: `agents/commands.md`
- Execution plan tracker (authoritative for non-trivial work): `PLANS.md`

Implementation note: `Operator-web/server/agent/instructions/index.ts` loads `agents/rules/**/*.md` deterministically.

