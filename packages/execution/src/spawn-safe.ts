import { applyUnifiedExecEnvDefaults, sanitizeSpawnEnv } from "./process-env"

type SpawnKind = "host" | "tool"

type SpawnSafeInput = {
  cmd: string[]
  cwd?: string
  env?: Record<string, string | undefined>
  stdin?: "pipe" | "inherit" | "ignore" | Uint8Array
  stdout?: "pipe" | "inherit" | "ignore"
  stderr?: "pipe" | "inherit" | "ignore"
  kind: SpawnKind
}

const toEnv = (input: Record<string, string | undefined> | undefined) => {
  const out: Record<string, string> = {}
  const src = input ?? {}
  const keys = Object.keys(src)

  for (var i = 0; i < keys.length; i++) {
    const key = keys[i] ?? ""

    if (!key) {
      continue
    }

    const value = src[key]

    if (typeof value !== "string") {
      continue
    }

    out[key] = value
  }

  return out
}

export const spawnSafe = (input: SpawnSafeInput) => {
  const merged = {
    ...toEnv(process.env),
    ...toEnv(input.env),
  }
  const sanitized = sanitizeSpawnEnv(merged)
  const env = input.kind === "tool" ? applyUnifiedExecEnvDefaults(sanitized) : sanitized

  return Bun.spawn({
    cmd: input.cmd,
    cwd: input.cwd,
    env,
    stdin: input.stdin,
    stdout: input.stdout,
    stderr: input.stderr,
  })
}

