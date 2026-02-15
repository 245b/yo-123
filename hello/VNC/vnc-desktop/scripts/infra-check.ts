#!/usr/bin/env bun
import { readdirSync } from "node:fs"
import { spawnSafe } from "../../../../packages/execution/src/spawn-safe"

const run = async (cmd: string[]) => {
  const p = spawnSafe({ kind: "tool", cmd, stdout: "inherit", stderr: "inherit" })
  const code = await p.exited

  if (code === 0) {
    return
  }

  process.exit(code)
}

await run(["docker", "compose", "-f", "docker-compose.yml", "config"])

const list = readdirSync("scripts")
  .filter((x) => x.endsWith(".sh"))
  .sort()

if (list.length === 0) {
  console.error("No shell scripts found for syntax checks")
  process.exit(1)
}

for (const x of list) {
  await run(["bash", "-n", `scripts/${x}`])
}

await run(["python", "-m", "py_compile", "scripts/term-agent.py"])
await run(["node", "--check", "scripts/mcp-search.js"])
await run(["node", "--check", "scripts/mcp-read.js"])

console.log("infra:vnc:check passed")
