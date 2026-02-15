import { createInterface } from "node:readline"
import { existsSync } from "node:fs"
import path from "node:path"
import { spawn, type IPty } from "node-pty"
import { decodeRuntimeEnvelope, makeRuntimeFrameBase, type RuntimeEnvelope, type RuntimeRequest } from "@operator/contracts/runtime-ipc"
import type { TerminalSnapshot } from "@operator/contracts/terminal"
import { HeadTailBuffer } from "@operator/execution/head-tail-buffer"
import { UNIFIED_EXEC_ENV_DEFAULTS } from "@operator/execution/process-env"

type PtyRuntime = {
  processId: string
  sessionId: string
  command: string
  cwd: string
  cols: number
  rows: number
  pty: IPty
  buf: HeadTailBuffer
  running: boolean
  updatedAt: number
}

const entries = new Map<string, PtyRuntime>()

const nowId = () => {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 10)
  return `${t}-${r}`
}

const encoder = new TextEncoder()

const VNC_CONTAINER =
  (process.env.VNC_CONTAINER_NAME || process.env.OPERATOR_VNC_CONTAINER || "").trim()
const VNC_WORKDIR =
  (process.env.VNC_WORKDIR || process.env.OPERATOR_VNC_WORKDIR || "/projects/_workspaces").trim() || "/projects/_workspaces"
const ENFORCED_ROOT0 = (process.env.OPERATOR_ENFORCED_ROOT || "").trim()
const ENFORCED_ROOT = ENFORCED_ROOT0 ? path.posix.normalize(ENFORCED_ROOT0.replace(/\\/g, "/")) : ""
const DOCKER_START_DIR = "/"
const DOCKER_API_VERSION = (process.env.DOCKER_API_VERSION || "").trim()
const DOCKER_HOST = (process.env.DOCKER_HOST || "").trim()
const MODE_RAW = (process.env.OPERATOR_PTY_HOST_MODE || "").trim().toLowerCase()

const resolveMode = () => {
  if (MODE_RAW === "docker" || MODE_RAW === "local") {
    return MODE_RAW
  }

  if (VNC_CONTAINER) {
    return "docker"
  }

  return "local"
}

const MODE = resolveMode()

const dockerEnv = () => {
  const out: Record<string, string> = {}

  if (DOCKER_API_VERSION) {
    out.DOCKER_API_VERSION = DOCKER_API_VERSION
  }

  if (DOCKER_HOST) {
    out.DOCKER_HOST = DOCKER_HOST
  }

  return out
}

const dockerContainerEnvArgs = () => {
  const out: string[] = []

  for (var i = 0; i < UNIFIED_EXEC_ENV_DEFAULTS.length; i++) {
    const row = UNIFIED_EXEC_ENV_DEFAULTS[i]

    if (!row) {
      continue
    }

    const key = row[0]
    const value = row[1]

    if (key === "NO_COLOR") {
      continue
    }

    if (key === "COLORTERM") {
      continue
    }

    if (key === "TERM") {
      out.push("-e", "TERM=xterm-256color")
      continue
    }

    out.push("-e", `${key}=${value}`)
  }

  return out
}

const sessionTag = (raw: string) => {
  const t0 = typeof raw === "string" ? raw : ""
  const t1 = t0.trim().replace(/[^a-zA-Z0-9_.-]+/g, "_")
  const t = t1.trim()

  if (!t) {
    return "operator"
  }

  return t
}

const toPosix = (raw: string) => {
  return raw.replace(/\\/g, "/")
}

const inBase = (target: string, base: string) => {
  return target === base || target.startsWith(`${base}/`)
}

const workspaceBaseRoot = () => {
  if (ENFORCED_ROOT) {
    return ENFORCED_ROOT
  }

  return path.posix.normalize(VNC_WORKDIR)
}

const sessionBase = (sessionId: string) => {
  const sid = sessionTag(sessionId)
  const root = workspaceBaseRoot()
  const last = path.posix.basename(root)

  if (last === sid) {
    return root
  }

  return path.posix.normalize(`${root}/${sid}`)
}

const scopedWorkdir = (sessionId: string, raw?: string) => {
  const base = sessionBase(sessionId)
  const input0 = typeof raw === "string" ? raw : ""
  const input = input0.trim()

  if (!input || input === ".") {
    return base
  }

  const posix = toPosix(input)
  const joined = posix.startsWith("/") ? path.posix.normalize(posix) : path.posix.normalize(path.posix.join(base, posix))

  if (!inBase(joined, base)) {
    return base
  }

  return joined
}

const safeParse = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim()

  if (!text) {
    return null
  }

  var parsed: unknown = null

  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return null
  }

  const out = decodeRuntimeEnvelope(parsed)

  if (!out.success) {
    return null
  }

  if (out.data.kind !== "request") {
    return null
  }

  return out.data as RuntimeRequest
}

const emit = (payload: RuntimeEnvelope) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

const response = (req: RuntimeRequest, ok: boolean, result?: unknown, error?: string) => {
  emit({
    ...makeRuntimeFrameBase({
      id: req.id,
      requestId: req.requestId,
      sessionId: req.sessionId,
      role: "pty-host",
      channel: "terminal",
      method: req.method,
    }),
    version: "v1",
    kind: "response",
    ok,
    result,
    error,
  })
}

const heartbeat = () => {
  emit({
    ...makeRuntimeFrameBase({
      role: "pty-host",
      channel: "terminal",
      method: "heartbeat",
      sessionId: "operator",
    }),
    version: "v1",
    kind: "event",
    event: "heartbeat",
    chat_id: "operator",
    payload: {
      ok: true,
      mode: MODE,
    },
  })
}

const truncateText = (raw: string, maxChars: number) => {
  if (maxChars <= 0 || raw.length <= maxChars) {
    return raw
  }

  const start = raw.slice(0, Math.floor(maxChars / 2))
  const end = raw.slice(Math.max(0, raw.length - Math.floor(maxChars / 2)))
  return `${start}\n... output truncated ...\n${end}`
}

const snapshotOf = (row: PtyRuntime): TerminalSnapshot => {
  const decoder = new TextDecoder()
  const output = decoder.decode(row.buf.toBytes())
  return {
    sessionId: row.sessionId,
    processId: row.processId,
    command: row.command,
    cwd: row.cwd,
    cols: row.cols,
    rows: row.rows,
    running: row.running,
    output,
    updatedAt: new Date(row.updatedAt).toISOString(),
  }
}

const shellForPlatform = () => {
  if (process.platform === "win32") {
    return {
      command: "powershell.exe",
      args: ["-NoLogo"],
    }
  }

  return {
    command: process.env.SHELL || "/bin/bash",
    args: ["-l"],
  }
}

const dockerShellForSession = (sessionId: string, cwd?: string) => {
  const workdir = scopedWorkdir(sessionId, cwd)
  const bootstrap = `mkdir -p \"${workdir}\" && cd \"${workdir}\" && exec bash -li`
  const envArgs = dockerContainerEnvArgs()
  return {
    command: "docker",
    args: ["exec", "-it", ...envArgs, "-w", DOCKER_START_DIR, VNC_CONTAINER, "/bin/bash", "-lc", bootstrap],
    cwd: workdir,
  }
}

const spawnPty = (input: {
  sessionId: string
  processId?: string
  cwd?: string
  cols?: number
  rows?: number
}) => {
  const processId = (input.processId || nowId()).trim() || nowId()
  const sessionId = (input.sessionId || "operator").trim() || "operator"
  const cwd0 = (input.cwd || "").trim()
  const cols = Number.isFinite(input.cols) && (input.cols || 0) > 1 ? Math.floor(input.cols || 120) : 120
  const rows = Number.isFinite(input.rows) && (input.rows || 0) > 1 ? Math.floor(input.rows || 36) : 36
  const dockerMode = MODE === "docker" && !!VNC_CONTAINER

  const attach = (row: PtyRuntime) => {
    row.pty.onData((chunk) => {
      row.buf.pushChunk(encoder.encode(chunk))
      row.updatedAt = Date.now()
    })

    row.pty.onExit((ev) => {
      row.running = false
      row.updatedAt = Date.now()
      const code = typeof ev?.exitCode === "number" ? Math.floor(ev.exitCode) : 0
      emit({
        ...makeRuntimeFrameBase({
          role: "pty-host",
          channel: "terminal",
          method: "pty_exit",
          sessionId: row.sessionId,
        }),
        version: "v1",
        kind: "event",
        event: "pty_exit",
        chat_id: row.sessionId,
        payload: {
          processId: row.processId,
          exitCode: code,
          snapshot: snapshotOf(row),
          final: true,
        },
      })
    })
  }

  if (dockerMode) {
    const shell = dockerShellForSession(sessionId, cwd0)
    const pty = spawn(shell.command, shell.args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...dockerEnv(),
      },
    })

    const row: PtyRuntime = {
      processId,
      sessionId,
      command: shell.command,
      cwd: shell.cwd,
      cols,
      rows,
      pty,
      buf: new HeadTailBuffer(),
      running: true,
      updatedAt: Date.now(),
    }

    attach(row)
    entries.set(processId, row)
    return row
  }

  const shell = shellForPlatform()
  const cwd = cwd0 && existsSync(cwd0) ? cwd0 : process.cwd()
  const pty = spawn(shell.command, shell.args, {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    env: {
      ...process.env,
    },
  })

  const row: PtyRuntime = {
    processId,
    sessionId,
    command: shell.command,
    cwd,
    cols,
    rows,
    pty,
    buf: new HeadTailBuffer(),
    running: true,
    updatedAt: Date.now(),
  }

  attach(row)
  entries.set(processId, row)
  return row
}

const handle = async (req: RuntimeRequest) => {
  if (req.method === "heartbeat") {
    response(req, true, { ok: true })
    return
  }

  if (req.method === "pty_open") {
    const row = req.params && typeof req.params === "object" ? (req.params as { sessionId?: unknown; processId?: unknown; cwd?: unknown; cols?: unknown; rows?: unknown } | null) : null
    const sessionId = typeof row?.sessionId === "string" ? row.sessionId : "operator"
    const processId0 = typeof row?.processId === "string" ? row.processId : ""
    const processId = processId0.trim()

    if (processId) {
      const existing = entries.get(processId)

      if (existing) {
        response(req, true, { processId: existing.processId, snapshot: snapshotOf(existing) })
        return
      }
    }

    const created = spawnPty({
      sessionId,
      processId,
      cwd: typeof row?.cwd === "string" ? row.cwd : "",
      cols: typeof row?.cols === "number" ? row.cols : undefined,
      rows: typeof row?.rows === "number" ? row.rows : undefined,
    })
    response(req, true, { processId: created.processId, snapshot: snapshotOf(created) })
    return
  }

  if (req.method === "pty_write") {
    const row = req.params && typeof req.params === "object" ? (req.params as { processId?: unknown; chars?: unknown } | null) : null
    const processId = typeof row?.processId === "string" ? row.processId.trim() : ""
    const chars = typeof row?.chars === "string" ? row.chars : ""
    const target = entries.get(processId)

    if (!target) {
      response(req, false, null, "Unknown process_id")
      return
    }

    target.pty.write(chars)
    target.updatedAt = Date.now()
    response(req, true, { processId })
    return
  }

  if (req.method === "pty_capture") {
    const row = req.params && typeof req.params === "object" ? (req.params as { processId?: unknown; maxChars?: unknown } | null) : null
    const processId = typeof row?.processId === "string" ? row.processId.trim() : ""
    const maxChars = Number.isFinite(row?.maxChars as number) ? Math.max(1000, Math.floor(row?.maxChars as number)) : 20000
    const target = entries.get(processId)

    if (!target) {
      response(req, false, null, "Unknown process_id")
      return
    }

    const decoder = new TextDecoder()
    const text = decoder.decode(target.buf.toBytes())
    response(req, true, { processId, output: truncateText(text, maxChars), running: target.running })
    return
  }

  if (req.method === "pty_resize") {
    const row = req.params && typeof req.params === "object" ? (req.params as { processId?: unknown; cols?: unknown; rows?: unknown } | null) : null
    const processId = typeof row?.processId === "string" ? row.processId.trim() : ""
    const cols = Number.isFinite(row?.cols as number) ? Math.max(40, Math.floor(row?.cols as number)) : 120
    const rows = Number.isFinite(row?.rows as number) ? Math.max(10, Math.floor(row?.rows as number)) : 36
    const target = entries.get(processId)

    if (!target) {
      response(req, false, null, "Unknown process_id")
      return
    }

    target.pty.resize(cols, rows)
    target.cols = cols
    target.rows = rows
    target.updatedAt = Date.now()
    response(req, true, { processId, cols, rows })
    return
  }

  if (req.method === "pty_terminate") {
    const row = req.params && typeof req.params === "object" ? (req.params as { processId?: unknown } | null) : null
    const processId = typeof row?.processId === "string" ? row.processId.trim() : ""
    const target = entries.get(processId)

    if (!target) {
      response(req, false, null, "Unknown process_id")
      return
    }

    target.pty.kill()
    target.running = false
    target.updatedAt = Date.now()
    entries.delete(processId)
    response(req, true, { processId, terminated: true })
    return
  }

  if (req.method === "pty_snapshot") {
    const row = req.params && typeof req.params === "object" ? (req.params as { processId?: unknown } | null) : null
    const processId = typeof row?.processId === "string" ? row.processId.trim() : ""
    const target = entries.get(processId)

    if (!target) {
      response(req, false, null, "Unknown process_id")
      return
    }

    response(req, true, { processId, snapshot: snapshotOf(target) })
    return
  }

  if (req.method === "pty_restore") {
    const row = req.params && typeof req.params === "object" ? (req.params as { sessionId?: unknown; snapshot?: unknown } | null) : null
    const sessionId = typeof row?.sessionId === "string" ? row.sessionId : "operator"
    const snap = row?.snapshot && typeof row.snapshot === "object"
      ? (row.snapshot as { processId?: unknown; cwd?: unknown; cols?: unknown; rows?: unknown; output?: unknown })
      : null

    if (!snap) {
      response(req, false, null, "Missing snapshot")
      return
    }

    const created = spawnPty({
      sessionId,
      processId: typeof snap.processId === "string" ? snap.processId : undefined,
      cwd: typeof snap.cwd === "string" ? snap.cwd : undefined,
      cols: typeof snap.cols === "number" ? snap.cols : undefined,
      rows: typeof snap.rows === "number" ? snap.rows : undefined,
    })

    if (typeof snap.output === "string" && snap.output) {
      created.buf.pushChunk(encoder.encode(snap.output))
    }

    response(req, true, { processId: created.processId, snapshot: snapshotOf(created) })
    return
  }

  response(req, false, null, `Unsupported method: ${req.method}`)
}

const main = async () => {
  heartbeat()
  const timer = setInterval(() => {
    heartbeat()
  }, 2500)
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

  for await (const line of rl) {
    const parsed = safeParse(line)

    if (!parsed) {
      continue
    }

    await handle(parsed)
  }

  clearInterval(timer)
}

await main()

