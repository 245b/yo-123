import { spawnSafe } from "@operator/execution/spawn-safe"
import path from "node:path"
import { mkdir } from "node:fs/promises"

const clean = (raw: unknown) => {
  const t0 = typeof raw === "string" ? raw : ""
  return t0.trim()
}

const dataDir = () => {
  const env0 = clean(process.env.OPERATOR_DATA_DIR || process.env.DATA_DIR || "")
  return env0 || "test-results/server-data"
}

const ensureTestExecPolicy = async () => {
  const dir = dataDir()
  const fp = path.join(dir, "rules", "policy.rules")
  const rules = 'prefix_rule(pattern=["echo"], decision="prompt", justification="echo requires approval")\n'
  await mkdir(path.dirname(fp), { recursive: true })
  const cur0 = await Bun.file(fp).text().catch(() => "")
  const cur = typeof cur0 === "string" ? cur0 : ""

  if (cur.trim() === rules.trim()) {
    return
  }

  await Bun.write(fp, rules)
}

const bin = process.execPath

await ensureTestExecPolicy()

const proc = spawnSafe({
  kind: "host",
  cmd: [bin, "server/index.ts"],
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})

var die = false

const stop = () => {
  if (die) {
    return
  }

  die = true
  const pid = proc.pid

  if (!pid) {
    process.exit(0)
    return
  }

  if (process.platform === "win32") {
    spawnSafe({ kind: "host", cmd: ["taskkill", "/PID", String(pid), "/T", "/F"], stdout: "ignore", stderr: "ignore" })
    process.exit(0)
    return
  }

  proc.kill("SIGTERM")
  setTimeout(() => proc.kill("SIGKILL"), 1500)
}

process.on("SIGTERM", stop)
process.on("SIGINT", stop)

proc.exited.then((code) => {
  process.exit(code ?? 0)
})

export {}
