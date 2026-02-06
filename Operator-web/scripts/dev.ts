const run = async () => {
  const win = process.platform === "win32"
  const sh = win ? "cmd.exe" : "sh"
  const web = win ? [sh, "/c", "npm", "run", "dev:web"] : [sh, "-lc", "npm run dev:web"]
  const api = win ? [sh, "/c", "npm", "run", "dev:server"] : [sh, "-lc", "npm run dev:server"]

  const p0 = Bun.spawn({ cmd: web, stdout: "inherit", stderr: "inherit" })
  const p1 = Bun.spawn({ cmd: api, stdout: "inherit", stderr: "inherit" })

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
