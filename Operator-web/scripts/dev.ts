import { spawnSafe } from "@operator/execution/spawn-safe"

const run = async () => {
  const bin = process.execPath
  const web = [bin, "run", "dev:web"]
  const api = [bin, "run", "dev:server"]

  const p0 = spawnSafe({ kind: "host", cmd: web, stdout: "inherit", stderr: "inherit" })
  const p1 = spawnSafe({ kind: "host", cmd: api, stdout: "inherit", stderr: "inherit" })

  const kill = () => {
    p0.kill()
    p1.kill()
  }

  process.on("SIGINT", kill)
  process.on("SIGTERM", kill)

  await Promise.race([p0.exited, p1.exited])
  kill()
}

run()
