const bin = process.execPath

const proc = Bun.spawn({
  cmd: [bin, "server/index.ts"],
  env: process.env,
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
    Bun.spawn({
      cmd: ["taskkill", "/PID", String(pid), "/T", "/F"],
      stdout: "ignore",
      stderr: "ignore",
    })
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
