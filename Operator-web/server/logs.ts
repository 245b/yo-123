import path from "node:path"
import { mkdir } from "node:fs/promises"

export type LogDir = "logs" | "transcripts" | "sessions"

export type LogWrite = (dir: LogDir, kind: string, data: unknown) => Promise<void>

export type LogStore = {
  base: string
  logs: string
  transcripts: string
  sessions: string
  write: LogWrite
}

const clean = (s: string) => s.replace(/[:.]/g, "-")

const stamp = () => clean(new Date().toISOString())

const uid = () => {
  const id0 = globalThis.crypto?.randomUUID?.() ?? ""
  const id = typeof id0 === "string" ? id0 : ""
  return id || `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

const ensureDir = async (p: string, seen: Set<string>) => {
  if (seen.has(p)) {
    return
  }

  await mkdir(p, { recursive: true }).catch(() => {})
  seen.add(p)
}

export const createLogger = (root: string): LogStore => {
  const base0 = (process.env.OPERATOR_DATA_DIR ?? "").trim()
  const base = base0 || path.join(root, "data")
  const logs = path.join(base, "logs")
  const transcripts = path.join(base, "transcripts")
  const sessions = path.join(base, "sessions")
  const seen = new Set<string>()

  const write = async (dir: LogDir, kind: string, data: unknown) => {
    const d = dir === "transcripts" ? transcripts : dir === "sessions" ? sessions : logs
    await ensureDir(d, seen)
    const name = `${stamp()}_${kind}_${uid()}.json`
    const fp = path.join(d, name)
    const body = JSON.stringify(data, null, 2)
    await Bun.write(fp, body)
  }

  return { base, logs, transcripts, sessions, write }
}
