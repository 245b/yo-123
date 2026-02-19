import crypto from "node:crypto"
import path from "node:path"
import type { HostHealthEvent } from "@operator/contracts/host-health"
import { HeadTailBuffer } from "@operator/execution/head-tail-buffer"
import { UNIFIED_EXEC_ENV_DEFAULTS } from "@operator/execution/process-env"
import { spawnSafe } from "@operator/execution/spawn-safe"
import { terminalCapture, terminalExec, terminalOpen, terminalResize, terminalSend, terminalTerminate } from "../../terminal/client"
import { PtyHostClient } from "../pty-host/client"

type ExecDeltaEvent = {
  processId: string
  chunk: string
}

type ExecExitEvent = {
  chatId: string
  processId: string
  exitCode: number
  output: string
  wallTimeMs: number
}

type ProcessInfo = {
  processId: string
  sessionId: string
  command: string
  tty: boolean
  acceptsStdin: boolean
  startedAt: number
  lastUsedAt: number
  process: Bun.Subprocess
  buf: HeadTailBuffer
  transcript: HeadTailBuffer
  exited: boolean
  exitCode?: number
  exitAt?: number
  exitEmitted?: boolean
  backgrounded?: boolean
}

type TermAgentProcessInfo = {
  processId: string
  sessionId: string
  targetPane: string
  lastUsedAt: number
}

type PtyHostProcessInfo = {
  processId: string
  sessionId: string
  lastUsedAt: number
}

export type ExecCommandRequest = {
  sessionId: string
  command: string
  workdir?: string
  timeoutMs?: number
  maxChars?: number
  processId?: string
  tty?: boolean
  requestId?: string
}

export type ExecCommandResult = {
  processId?: string
  output: string
  exitCode?: number
  wallTimeMs: number
  truncated: boolean
  running?: boolean
  backgrounded?: boolean
  background_reason?: "timeout" | "stalled"
  error?: string
  errorCode?: string
}

export type WriteStdinRequest = {
  processId: string
  chars: string
  yieldTimeMs?: number
  maxChars?: number
  requestId?: string
}

export type WriteStdinResult = {
  processId?: string
  output: string
  exitCode?: number
  wallTimeMs: number
  truncated: boolean
  running?: boolean
  backgrounded?: boolean
  background_reason?: "timeout" | "stalled"
  error?: string
  errorCode?: string
}

export type ResizePtyResult = {
  ok: boolean
  processId?: string
  cols?: number
  rows?: number
  error?: string
}

const VNC_CONTAINER =
  (process.env.VNC_CONTAINER_NAME || process.env.OPERATOR_VNC_CONTAINER || "vnc-desktop").trim() || "vnc-desktop"
const VNC_WORKDIR =
  (process.env.VNC_WORKDIR || process.env.OPERATOR_VNC_WORKDIR || "/projects/_workspaces").trim() || "/projects/_workspaces"
const ENFORCED_ROOT0 = (process.env.OPERATOR_ENFORCED_ROOT || "").trim()
const ENFORCED_ROOT = ENFORCED_ROOT0 ? path.posix.normalize(ENFORCED_ROOT0.replace(/\\/g, "/")) : ""
const DOCKER_START_DIR = "/"
const DOCKER_API_VERSION = (process.env.DOCKER_API_VERSION || "").trim()
const DOCKER_HOST = (process.env.DOCKER_HOST || "").trim()
const MAX_PROCESSES = Number.parseInt((process.env.OPERATOR_PTY_MAX_PROCESSES || "64").trim(), 10) || 64
const KEEP_RECENT = 8
const PTY_BACKEND_RAW = (process.env.OPERATOR_PTY_BACKEND || "").trim().toLowerCase()
const USE_TERM_AGENT_PTY = PTY_BACKEND_RAW === "term-agent-pty"
const USE_PTY_HOST_V2 = PTY_BACKEND_RAW === "pty-host-v2"
const BACKGROUND_AFTER_MS_RAW = Number.parseInt((process.env.OPERATOR_EXEC_BACKGROUND_AFTER_MS || "").trim(), 10)
const BACKGROUND_STALL_MS_RAW = Number.parseInt((process.env.OPERATOR_EXEC_BACKGROUND_STALL_MS || "").trim(), 10)
const BACKGROUND_POLL_MS = 150
const EXEC_V3_RAW = (process.env.OPERATOR_EXEC_V3 || "").trim()
const EXEC_DELTA_MAX_CHARS_RAW = Number.parseInt((process.env.OPERATOR_EXEC_DELTA_MAX_CHARS || "").trim(), 10)
const EXEC_OUTPUT_MAX_BYTES_RAW = Number.parseInt((process.env.OPERATOR_EXEC_OUTPUT_MAX_BYTES || "").trim(), 10)
const EXEC_EXIT_GRACE_MS = 100
const COMPLETED_TTL_MS = 60_000

const flagOn = (raw: string, fallback: boolean) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim().toLowerCase()

  if (!text) {
    return fallback
  }

  if (text === "0" || text === "false" || text === "off" || text === "no") {
    return false
  }

  return true
}

const EXEC_V3 = flagOn(EXEC_V3_RAW, false)
const EXEC_DELTA_MAX_CHARS = Number.isFinite(EXEC_DELTA_MAX_CHARS_RAW) && EXEC_DELTA_MAX_CHARS_RAW > 0 ? Math.floor(EXEC_DELTA_MAX_CHARS_RAW) : 8192
const EXEC_OUTPUT_MAX_BYTES = Number.isFinite(EXEC_OUTPUT_MAX_BYTES_RAW) && EXEC_OUTPUT_MAX_BYTES_RAW > 0 ? Math.floor(EXEC_OUTPUT_MAX_BYTES_RAW) : 1024 * 1024

const toInt = (raw: unknown, fallback: number, min: number, max: number) => {
  const n0 = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : NaN
  const n1 = Number.isFinite(n0) ? Math.floor(n0) : fallback

  if (n1 < min) {
    return min
  }

  if (n1 > max) {
    return max
  }

  return n1
}

const backgroundAfterMs = () => {
  return toInt(BACKGROUND_AFTER_MS_RAW, 120000, 30000, 900000)
}

const backgroundStallMs = () => {
  return toInt(BACKGROUND_STALL_MS_RAW, 45000, 5000, 300000)
}

export const backgroundDecision = (input: {
  timeoutMs: number
  elapsedMs: number
  idleMs: number
}) => {
  const timeoutMs = toInt(input.timeoutMs, 20000, 1000, 120000)
  const elapsedMs = Math.max(0, Math.floor(input.elapsedMs))
  const idleMs = Math.max(0, Math.floor(input.idleMs))
  const timeoutThreshold = backgroundAfterMs()
  const stallThreshold = backgroundStallMs()
  const byTimeout = timeoutMs >= timeoutThreshold && elapsedMs >= timeoutThreshold

  if (byTimeout) {
    return { background: true, reason: "timeout" as const }
  }

  const byStall = idleMs >= stallThreshold && elapsedMs >= stallThreshold

  if (byStall) {
    return { background: true, reason: "stalled" as const }
  }

  return { background: false as const }
}

const backgroundMessage = (pid: string, reason: "timeout" | "stalled") => {
  const why = reason === "timeout" ? "it exceeded 2 minutes" : "it appears stalled with no new output"
  return `Command is still running in the background (process_id: ${pid}) because ${why}. Continue with other terminal work now; use terminal_send/terminal_capture to check progress and terminate_command to stop it.`
}

const processId = () => {
  return crypto.randomInt(1000, 99999).toString()
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

const unquoteToken = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim()

  if (text.length < 2) {
    return text
  }

  const head = text[0] ?? ""
  const tail = text[text.length - 1] ?? ""

  if (head === '"' && tail === '"') {
    return text.slice(1, -1)
  }

  if (head === "'" && tail === "'") {
    return text.slice(1, -1)
  }

  return text
}

const commandTokens = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim()

  if (!text) {
    return []
  }

  const parts = text.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
  const out: string[] = []

  for (var i = 0; i < parts.length; i++) {
    const row = parts[i] ?? ""
    const token = unquoteToken(row)

    if (!token) {
      continue
    }

    out.push(token)
  }

  return out
}

const tokenCandidates = (raw: string) => {
  const token0 = typeof raw === "string" ? raw : ""
  const token = token0.trim()

  if (!token) {
    return []
  }

  const out: string[] = [token]
  const eq = token.indexOf("=")

  if (eq > 0 && eq < token.length - 1) {
    out.push(token.slice(eq + 1))
  }

  return out
}

const cleanCandidate = (raw: string) => {
  const t0 = typeof raw === "string" ? raw : ""
  const t1 = t0.trim()
  const t2 = t1.replace(/^[`"'(){}\[\];|&]+/, "").replace(/[`"'(){}\[\];|&]+$/, "")
  return t2.trim()
}

const commandBoundaryError = (raw: string, base: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim()
  const traversed = /(^|[\s;|&(){}])\.\.([/\\]|$|[\s;|&(){}])/.test(text)

  if (!text) {
    return ""
  }

  if (traversed) {
    return "Session boundary violation: '..'"
  }

  const root = path.posix.normalize(base)
  const list = commandTokens(text)

  for (var i = 0; i < list.length; i++) {
    const token = list[i] ?? ""
    const candidates = tokenCandidates(token)

    for (var j = 0; j < candidates.length; j++) {
      const row = candidates[j] ?? ""
      const cleaned = cleanCandidate(row)
      const path0 = cleaned.replace(/\\/g, "/")
      const p = path0.trim()

      if (!p) {
        continue
      }

      if (p.startsWith("~")) {
        return `Session boundary violation: '${token}'`
      }

      if (p === ".." || p.startsWith("../") || p.endsWith("/..") || p.includes("/../")) {
        return `Session boundary violation: '${token}'`
      }

      if (!p.startsWith("/")) {
        continue
      }

      const normalized = path.posix.normalize(p)

      if (inBase(normalized, root)) {
        continue
      }

      return `Session boundary violation: '${token}'`
    }
  }

  return ""
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

const dockerContainerEnvArgs = (input?: { tty?: boolean }) => {
  if (!EXEC_V3) {
    return [] as string[]
  }

  const tty = input?.tty === true
  const out: string[] = []

  for (var i = 0; i < UNIFIED_EXEC_ENV_DEFAULTS.length; i++) {
    const row = UNIFIED_EXEC_ENV_DEFAULTS[i]

    if (!row) {
      continue
    }

    const key = row[0]
    const value = row[1]

    if (tty && key === "NO_COLOR") {
      continue
    }

    if (tty && key === "COLORTERM") {
      continue
    }

    if (tty && key === "TERM") {
      out.push("-e", "TERM=xterm-256color")
      continue
    }

    out.push("-e", `${key}=${value}`)
  }

  return out
}

const buildDockerExecCommand = (sessionId: string, command: string, cwd?: string) => {
  const safeCommand = (command || "").trim()
  const workdir = scopedWorkdir(sessionId, cwd)
  const quoted = safeCommand.replace(/"/g, '\\"')
  const script = `mkdir -p \"${workdir}\" && cd \"${workdir}\" && ${quoted}`
  const envArgs = dockerContainerEnvArgs({ tty: false })

  return ["docker", "exec", "-i", ...envArgs, "-w", DOCKER_START_DIR, VNC_CONTAINER, "/bin/bash", "-lc", script]
}

const buildDockerShellCommand = (sessionId: string, cwd?: string) => {
  const workdir = scopedWorkdir(sessionId, cwd)
  const bootstrap = `mkdir -p \"${workdir}\" && cd \"${workdir}\" && exec bash -li`
  const envArgs = dockerContainerEnvArgs({ tty: true })
  return ["docker", "exec", "-i", ...envArgs, "-w", DOCKER_START_DIR, VNC_CONTAINER, "/bin/bash", "-lc", bootstrap]
}

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

const truncateText = (raw: string, maxChars: number) => {
  if (maxChars <= 0 || raw.length <= maxChars) {
    return { text: raw, truncated: false }
  }

  const start = raw.slice(0, Math.floor(maxChars / 2))
  const end = raw.slice(Math.max(0, raw.length - Math.floor(maxChars / 2)))
  return {
    text: `${start}\n... output truncated ...\n${end}`,
    truncated: true,
  }
}

const formatOmitted = (output: string, omittedBytes: number) => {
  const text0 = typeof output === "string" ? output : ""
  const text = text0
  const n0 = Number.isFinite(omittedBytes) ? Math.floor(omittedBytes) : 0
  const n = n0 > 0 ? n0 : 0

  if (!n) {
    return text
  }

  const note = `[output truncated: omitted ${n} bytes]`

  if (!text.trim()) {
    return note
  }

  return `${text}\n\n${note}`
}

const asReadable = (value: unknown) => {
  const row = value && typeof value === "object" ? (value as { getReader?: unknown } | null) : null
  const fn = row?.getReader

  if (typeof fn !== "function") {
    return null
  }

  return value as ReadableStream<Uint8Array>
}

const writeStdin = (value: unknown, text: string) => {
  const row = value && typeof value === "object" ? (value as { write?: unknown } | null) : null
  const fn = row?.write

  if (typeof fn !== "function") {
    return false
  }

  ;(row as { write: (chunk: string) => unknown }).write(text)
  return true
}

const streamChunks = async (
  stream: ReadableStream<Uint8Array> | null,
  onChunk: (chunk: string) => void,
  done: Promise<void>
) => {
  if (!stream) {
    await done
    return
  }

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const exitSignal = done
    .then(() => ({ kind: "exit" as const }))
    .catch(() => ({ kind: "exit" as const }))
  var exiting = false
  var deadline = 0

  for (;;) {
    const read = reader.read().then((row) => ({ kind: "read" as const, row }))

    if (!exiting) {
      const out = await Promise.race([read, exitSignal])

      if (out.kind === "exit") {
        exiting = true
        deadline = Date.now() + EXEC_EXIT_GRACE_MS
        const left = Math.max(0, deadline - Date.now())

        if (left <= 0) {
          void reader.cancel()
          break
        }

        const out2 = await Promise.race([
          read,
          Bun.sleep(left).then(() => ({ kind: "timeout" as const })),
        ])

        if (out2.kind === "timeout") {
          void reader.cancel()
          break
        }

        const res = out2.row

        if (res.done) {
          break
        }

        const value = res.value

        if (value) {
          const chunk = decoder.decode(value, { stream: true })

          if (chunk) {
            onChunk(chunk)
          }
        }

        continue
      }

      const res = out.row

      if (res.done) {
        break
      }

      const value = res.value

      if (value) {
        const chunk = decoder.decode(value, { stream: true })

        if (chunk) {
          onChunk(chunk)
        }
      }

      continue
    }

    const left = Math.max(0, deadline - Date.now())

    if (left <= 0) {
      void reader.cancel()
      break
    }

    const out = await Promise.race([
      read,
      Bun.sleep(left).then(() => ({ kind: "timeout" as const })),
    ])

    if (out.kind === "timeout") {
      void reader.cancel()
      break
    }

    const res = out.row

    if (res.done) {
      break
    }

    const value = res.value

    if (!value) {
      continue
    }

    const chunk = decoder.decode(value, { stream: true })

    if (!chunk) {
      continue
    }

    onChunk(chunk)
  }

  const tail = decoder.decode()

  if (tail) {
    onChunk(tail)
  }
}

class UnifiedExecManager {
  private readonly sessions = new Map<string, string[]>()
  private readonly processes = new Map<string, ProcessInfo>()
  private readonly completed = new Map<
    string,
    { sessionId: string; output: string; exitCode: number; wallTimeMs: number; expiresAt: number }
  >()
  private readonly termAgentProcesses = new Map<string, TermAgentProcessInfo>()
  private readonly ptyHostProcesses = new Map<string, PtyHostProcessInfo>()
  private readonly ptyHost = new PtyHostClient(path.resolve(import.meta.dir, "../../.."))
  private readonly exitListeners = new Set<(event: ExecExitEvent) => void>()
  private readonly encoder = new TextEncoder()

  onExit(listener: (event: ExecExitEvent) => void) {
    this.exitListeners.add(listener)
    return () => {
      this.exitListeners.delete(listener)
    }
  }

  onPtyHealth(listener: (health: HostHealthEvent) => void) {
    return this.ptyHost.onHealth(listener)
  }

  private fireExit(event: ExecExitEvent) {
    for (const listener of this.exitListeners) {
      listener(event)
    }
  }

  ensureSession(sessionId: string) {
    const sid = sessionTag(sessionId)

    if (!this.sessions.has(sid)) {
      this.sessions.set(sid, [])
    }

    return sid
  }

  capture(sessionId: string, tailLines?: number) {
    const sid = this.ensureSession(sessionId)
    const rows = this.sessions.get(sid) || []
    const tail = toInt(tailLines, 200, 20, 5000)
    const text = rows.slice(Math.max(0, rows.length - tail)).join("\n")
    return text
  }

  private record(sessionId: string, text: string) {
    const sid = this.ensureSession(sessionId)
    const rows = this.sessions.get(sid) || []
    const lines = text.split(/\r?\n/)

    for (var i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ""
      rows.push(line)
    }

    if (rows.length > 20000) {
      const keep = rows.slice(rows.length - 20000)
      this.sessions.set(sid, keep)
      return
    }

    this.sessions.set(sid, rows)
  }

  private pruneCompleted() {
    const at = Date.now()
    const keys = Array.from(this.completed.keys())

    for (var i = 0; i < keys.length; i++) {
      const key = keys[i] ?? ""
      const row = this.completed.get(key)

      if (!row) {
        continue
      }

      if (row.expiresAt > at) {
        continue
      }

      this.completed.delete(key)
    }
  }

  private completedResult(processId: string) {
    this.pruneCompleted()
    return this.completed.get(processId) || null
  }

  private drainOutput(process: ProcessInfo) {
    const omitted = process.buf.omittedBytes()
    const chunks = process.buf.drainChunks()
    const text = this.decodeChunks(chunks)
    return formatOmitted(text, omitted)
  }

  private decodeChunks(chunks: Uint8Array[]) {
    const decoder = new TextDecoder()
    var out = ""

    for (var i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]

      if (!chunk) {
        continue
      }

      out += decoder.decode(chunk, { stream: true })
    }

    out += decoder.decode()
    return out
  }

  private bufferToText(buf: HeadTailBuffer) {
    const bytes = buf.toBytes()
    const decoder = new TextDecoder()
    return decoder.decode(bytes)
  }

  private emitDelta(processId: string, chunk: string, onDelta?: (event: ExecDeltaEvent) => void) {
    if (!onDelta) {
      return
    }

    const cap = Math.max(256, Math.min(131072, EXEC_DELTA_MAX_CHARS))
    const text0 = typeof chunk === "string" ? chunk : ""
    const text = text0

    if (!text) {
      return
    }

    if (text.length <= cap) {
      onDelta({ processId, chunk: text })
      return
    }

    for (var i = 0; i < text.length; i += cap) {
      const part = text.slice(i, i + cap)

      if (!part) {
        continue
      }

      onDelta({ processId, chunk: part })
    }
  }

  private scheduleExit(process: ProcessInfo) {
    if (process.exitEmitted) {
      return
    }

    process.exitEmitted = true

    void Bun.sleep(EXEC_EXIT_GRACE_MS).then(() => {
      const code = typeof process.exitCode === "number" ? process.exitCode : 0
      const at = typeof process.exitAt === "number" ? process.exitAt : Date.now()
      const wall = Math.max(0, at - process.startedAt)
      const omitted = process.transcript.omittedBytes()
      const output0 = this.bufferToText(process.transcript)
      const output = formatOmitted(output0, omitted)
      this.completed.set(process.processId, {
        sessionId: process.sessionId,
        output,
        exitCode: code,
        wallTimeMs: wall,
        expiresAt: Date.now() + COMPLETED_TTL_MS,
      })
      this.pruneCompleted()

      if (process.backgrounded && EXEC_V3) {
        this.fireExit({
          chatId: process.sessionId,
          processId: process.processId,
          exitCode: code,
          output,
          wallTimeMs: wall,
        })
      }

      this.processes.delete(process.processId)
    })
  }

  private attachReaders(process: ProcessInfo, onDelta?: (event: ExecDeltaEvent) => void) {
    const done = process.process.exited.then(() => undefined)
    const append = (chunk: string) => {
      const bytes = this.encoder.encode(chunk)
      process.buf.pushChunk(bytes)
      process.transcript.pushChunk(bytes)
      this.record(process.sessionId, chunk)
      process.lastUsedAt = Date.now()

      this.emitDelta(process.processId, chunk, onDelta)
    }

    const outStream = asReadable(process.process.stdout)
    const errStream = asReadable(process.process.stderr)
    void streamChunks(outStream, append, done)
    void streamChunks(errStream, append, done)

    void process.process.exited.then((code) => {
      process.exited = true
      process.exitCode = code
      process.exitAt = Date.now()
      this.scheduleExit(process)
    })
  }

  private pruneIfNeeded() {
    this.pruneCompleted()

    if (this.processes.size < MAX_PROCESSES) {
      return
    }

    const list = Array.from(this.processes.values())
    list.sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    const keep = new Set(list.slice(0, KEEP_RECENT).map((row) => row.processId))
    const candidates = list
      .filter((row) => !keep.has(row.processId))
      .sort((a, b) => a.lastUsedAt - b.lastUsedAt)

    const exited = candidates.find((row) => row.exited)
    const target = exited || candidates[0]

    if (!target) {
      return
    }

    target.process.kill()
    this.processes.delete(target.processId)
  }

  private pruneTermAgentIfNeeded() {
    if (this.termAgentProcesses.size < MAX_PROCESSES) {
      return
    }

    const list = Array.from(this.termAgentProcesses.values())
    list.sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    const keep = new Set(list.slice(0, KEEP_RECENT).map((row) => row.processId))
    const candidates = list
      .filter((row) => !keep.has(row.processId))
      .sort((a, b) => a.lastUsedAt - b.lastUsedAt)
    const target = candidates[0]

    if (!target) {
      return
    }

    this.termAgentProcesses.delete(target.processId)
    void terminalTerminate({ processId: target.processId })
  }

  private prunePtyHostIfNeeded() {
    if (this.ptyHostProcesses.size < MAX_PROCESSES) {
      return
    }

    const list = Array.from(this.ptyHostProcesses.values())
    list.sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    const keep = new Set(list.slice(0, KEEP_RECENT).map((row) => row.processId))
    const candidates = list
      .filter((row) => !keep.has(row.processId))
      .sort((a, b) => a.lastUsedAt - b.lastUsedAt)
    const target = candidates[0]

    if (!target) {
      return
    }

    this.ptyHostProcesses.delete(target.processId)
    void this.ptyHost.terminate({ processId: target.processId })
  }

  private async execCommandTermAgent(request: ExecCommandRequest, onDelta?: (event: ExecDeltaEvent) => void) {
    if (request.tty !== true) {
      return null
    }

    const sessionId = this.ensureSession(request.sessionId)
    const command = (request.command || "").trim()
    const timeoutMs = toInt(request.timeoutMs, 20000, 1000, 120000)
    const maxChars = toInt(request.maxChars, 20000, 1000, 200000)

    if (!command) {
      return {
        output: "",
        wallTimeMs: 0,
        truncated: false,
      } as ExecCommandResult
    }

    const processId0 = typeof request.processId === "string" ? request.processId : ""
    const processId = processId0.trim()
    var managed = processId ? this.termAgentProcesses.get(processId) || null : null

    if (!managed) {
      this.pruneTermAgentIfNeeded()
      const opened = await terminalOpen({
        sessionId,
        cwd: request.workdir,
        requestId: request.requestId,
      })

      if (!opened.ok || !opened.processId) {
        return null
      }

      const target0 = typeof opened.targetPane === "string" ? opened.targetPane : opened.processId
      const target = target0.trim() || opened.processId
      managed = {
        processId: opened.processId,
        sessionId,
        targetPane: target,
        lastUsedAt: Date.now(),
      }
      this.termAgentProcesses.set(managed.processId, managed)
    }

    const send = await terminalSend({
      sessionId: managed.sessionId,
      keys: command,
      enter: true,
      targetPane: managed.targetPane,
      requestId: request.requestId,
    })

    if (!send.ok) {
      return null
    }

    const start = Date.now()
    await Bun.sleep(Math.min(timeoutMs, 30000))
    const tailLines = Math.max(50, Math.floor(maxChars / 40))
    const cap = await terminalCapture({
      sessionId: managed.sessionId,
      tailLines,
      targetPane: managed.targetPane,
      requestId: request.requestId,
    })

    if (!cap.ok) {
      return null
    }

    managed.lastUsedAt = Date.now()
    const output = typeof cap.text === "string" ? cap.text : ""
    this.record(sessionId, output)
    const truncated = truncateText(output, maxChars)

    this.emitDelta(managed.processId, truncated.text, onDelta)

    return {
      processId: managed.processId,
      output: truncated.text,
      wallTimeMs: Date.now() - start,
      truncated: truncated.truncated,
    } as ExecCommandResult
  }

  private async execCommandTermAgentDirect(request: ExecCommandRequest) {
    if (request.tty === true) {
      return null
    }

    const sessionId = this.ensureSession(request.sessionId)
    const command = (request.command || "").trim()
    const timeoutMs = toInt(request.timeoutMs, 20000, 1000, 120000)
    const maxChars = toInt(request.maxChars, 20000, 1000, 200000)
    const start = Date.now()

    if (!command) {
      return {
        output: "",
        wallTimeMs: 0,
        truncated: false,
      } as ExecCommandResult
    }

    const out = await terminalExec({
      sessionId,
      command,
      timeoutMs,
      maxChars,
      cwd: request.workdir,
      requestId: request.requestId,
    })

    if (!out.ok) {
      return null
    }

    const output = typeof out.output === "string" ? out.output : ""
    const exitCode = typeof out.exitCode === "number" ? out.exitCode : undefined
    const truncated = out.truncated === true
    this.record(sessionId, output)

    return {
      output,
      exitCode,
      wallTimeMs: Date.now() - start,
      truncated,
    } as ExecCommandResult
  }

  private async writeStdinTermAgent(request: WriteStdinRequest) {
    const managed = this.termAgentProcesses.get(request.processId)

    if (!managed) {
      return null
    }

    const input = typeof request.chars === "string" ? request.chars : ""
    const start = Date.now()
    const waitMs = toInt(request.yieldTimeMs, input ? 250 : 5000, 50, 30000)
    const maxChars = toInt(request.maxChars, 20000, 1000, 200000)
    const send = await terminalSend({
      sessionId: managed.sessionId,
      keys: input,
      enter: false,
      targetPane: managed.targetPane,
      requestId: request.requestId,
    })

    if (!send.ok) {
      return null
    }

    await Bun.sleep(waitMs)
    const tailLines = Math.max(50, Math.floor(maxChars / 40))
    const cap = await terminalCapture({
      sessionId: managed.sessionId,
      tailLines,
      targetPane: managed.targetPane,
      requestId: request.requestId,
    })

    if (!cap.ok) {
      return null
    }

    managed.lastUsedAt = Date.now()
    const output = typeof cap.text === "string" ? cap.text : ""
    this.record(managed.sessionId, output)
    const truncated = truncateText(output, maxChars)

    return {
      processId: managed.processId,
      output: truncated.text,
      wallTimeMs: Date.now() - start,
      truncated: truncated.truncated,
    } as WriteStdinResult
  }

  private async execCommandPtyHost(request: ExecCommandRequest, onDelta?: (event: ExecDeltaEvent) => void) {
    if (request.tty !== true) {
      return null
    }

    const sessionId = this.ensureSession(request.sessionId)
    const command = (request.command || "").trim()
    const timeoutMs = toInt(request.timeoutMs, 20000, 1000, 120000)
    const maxChars = toInt(request.maxChars, 20000, 1000, 200000)

    if (!command) {
      return {
        output: "",
        wallTimeMs: 0,
        truncated: false,
      } as ExecCommandResult
    }

    const processId0 = typeof request.processId === "string" ? request.processId : ""
    const processId = processId0.trim()
    var managed = processId ? this.ptyHostProcesses.get(processId) || null : null

    if (!managed) {
      this.prunePtyHostIfNeeded()
      const opened = await this.ptyHost.open({
        sessionId,
        processId: processId || undefined,
        cwd: request.workdir,
      })

      if (!opened.ok) {
        return null
      }

      const row = opened.result && typeof opened.result === "object" ? (opened.result as { processId?: unknown } | null) : null
      const pid0 = typeof row?.processId === "string" ? row.processId : ""
      const pid = pid0.trim()

      if (!pid) {
        return null
      }

      managed = {
        processId: pid,
        sessionId,
        lastUsedAt: Date.now(),
      }
      this.ptyHostProcesses.set(pid, managed)
    }

    const start = Date.now()
    const sent = await this.ptyHost.write({ processId: managed.processId, chars: `${command}\n` })

    if (!sent.ok) {
      return null
    }

    await Bun.sleep(Math.min(timeoutMs, 30000))
    const cap = await this.ptyHost.capture({ processId: managed.processId, maxChars })

    if (!cap.ok) {
      return null
    }

    managed.lastUsedAt = Date.now()
    const row = cap.result && typeof cap.result === "object" ? (cap.result as { output?: unknown } | null) : null
    const output = typeof row?.output === "string" ? row.output : ""
    this.record(sessionId, output)

    this.emitDelta(managed.processId, output, onDelta)

    return {
      processId: managed.processId,
      output,
      wallTimeMs: Date.now() - start,
      truncated: output.length >= maxChars,
    } as ExecCommandResult
  }

  private async writeStdinPtyHost(request: WriteStdinRequest) {
    const managed = this.ptyHostProcesses.get(request.processId)

    if (!managed) {
      return null
    }

    const input = typeof request.chars === "string" ? request.chars : ""
    const start = Date.now()
    const waitMs = toInt(request.yieldTimeMs, input ? 250 : 5000, 50, 30000)
    const maxChars = toInt(request.maxChars, 20000, 1000, 200000)
    const sent = await this.ptyHost.write({ processId: managed.processId, chars: input })

    if (!sent.ok) {
      return null
    }

    await Bun.sleep(waitMs)
    const cap = await this.ptyHost.capture({ processId: managed.processId, maxChars })

    if (!cap.ok) {
      return null
    }

    const row = cap.result && typeof cap.result === "object" ? (cap.result as { output?: unknown } | null) : null
    const output = typeof row?.output === "string" ? row.output : ""
    managed.lastUsedAt = Date.now()
    this.record(managed.sessionId, output)

    return {
      processId: managed.processId,
      output,
      wallTimeMs: Date.now() - start,
      truncated: output.length >= maxChars,
    } as WriteStdinResult
  }

  async execCommand(request: ExecCommandRequest, onDelta?: (event: ExecDeltaEvent) => void): Promise<ExecCommandResult> {
    const sessionId = this.ensureSession(request.sessionId)
    const command = (request.command || "").trim()
    const timeoutMs = toInt(request.timeoutMs, 20000, 1000, 120000)
    const maxChars = toInt(request.maxChars, 20000, 1000, 200000)
    const useTty = request.tty === true
    const boundary = commandBoundaryError(command, scopedWorkdir(sessionId, "."))

    if (!command) {
      return { output: "", wallTimeMs: 0, truncated: false }
    }

    if (boundary) {
      return {
        output: boundary,
        exitCode: 126,
        wallTimeMs: 0,
        truncated: false,
        error: boundary,
        errorCode: "SESSION_BOUNDARY_VIOLATION",
      }
    }

    if (USE_PTY_HOST_V2 && useTty) {
      const out = await this.execCommandPtyHost(request, onDelta)

      if (out) {
        return out
      }
    }

    if (USE_TERM_AGENT_PTY && useTty) {
      const out = await this.execCommandTermAgent(request, onDelta)

      if (out) {
        return out
      }
    }

    if (request.processId) {
      const existing = this.processes.get(request.processId)

      if (existing && !existing.exited) {
        if (!existing.acceptsStdin) {
          const note = `Process ${existing.processId} is running as a non-interactive background command. Start new work with terminal_exec (without process_id), poll output with terminal_send (empty keys) or terminal_capture, and stop with terminate_command.`
          const truncated = truncateText(note, maxChars)
          return {
            processId: existing.processId,
            output: truncated.text,
            wallTimeMs: 0,
            truncated: truncated.truncated,
            running: true,
            backgrounded: true,
          }
        }

        existing.lastUsedAt = Date.now()
        writeStdin(existing.process.stdin, `${command}\n`)
        const start = Date.now()
        await Bun.sleep(Math.min(timeoutMs, 30000))
        const output = this.drainOutput(existing)
        const truncated = truncateText(output, maxChars)

        if (existing.exited) {
          this.processes.delete(existing.processId)
          return {
            output: truncated.text,
            exitCode: existing.exitCode,
            wallTimeMs: Date.now() - start,
            truncated: truncated.truncated,
          }
        }

        return {
          processId: existing.processId,
          output: truncated.text,
          wallTimeMs: Date.now() - start,
          truncated: truncated.truncated,
        }
      }
    }

    if (USE_TERM_AGENT_PTY && !useTty) {
      const out = await this.execCommandTermAgentDirect(request)

      if (out) {
        return out
      }
    }

    if (!useTty) {
      const cmd = buildDockerExecCommand(sessionId, command, request.workdir)
      const proc = spawnSafe({
        kind: "tool",
        cmd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          ...dockerEnv(),
        },
      })
      this.pruneIfNeeded()
      const pid0 = request.processId || `${proc.pid ?? ""}`
      const pid1 = pid0.trim()
      const pid = pid1 || processId()
      const managed: ProcessInfo = {
        processId: pid,
        sessionId,
        command,
        tty: false,
        acceptsStdin: false,
        startedAt: Date.now(),
        lastUsedAt: Date.now(),
        process: proc,
        buf: new HeadTailBuffer(EXEC_OUTPUT_MAX_BYTES),
        transcript: new HeadTailBuffer(EXEC_OUTPUT_MAX_BYTES),
        exited: false,
      }
      this.processes.set(pid, managed)
      this.attachReaders(managed, onDelta)

      for (;;) {
        const now = Date.now()
        const elapsed = now - managed.startedAt

        if (managed.exited) {
          const output = this.drainOutput(managed)
          this.processes.delete(pid)
          const truncated = truncateText(output, maxChars)
          return {
            output: truncated.text,
            exitCode: managed.exitCode,
            wallTimeMs: elapsed,
            truncated: truncated.truncated,
          }
        }

        const idle = now - managed.lastUsedAt
        const bg = backgroundDecision({
          timeoutMs,
          elapsedMs: elapsed,
          idleMs: idle,
        })

        if (bg.background) {
          managed.backgrounded = true
          const output = this.drainOutput(managed)
          const note = backgroundMessage(pid, bg.reason)
          const merged = output.trim() ? `${output}\n\n${note}` : note
          const truncated = truncateText(merged, maxChars)
          return {
            processId: pid,
            output: truncated.text,
            wallTimeMs: elapsed,
            truncated: truncated.truncated,
            running: true,
            backgrounded: true,
            background_reason: bg.reason,
          }
        }

        if (elapsed >= timeoutMs) {
          managed.process.kill()
          await managed.process.exited.catch(() => undefined)
          const output = this.drainOutput(managed)
          this.processes.delete(pid)
          const truncated = truncateText(output, maxChars)
          return {
            output: truncated.text,
            exitCode: -1,
            wallTimeMs: Date.now() - managed.startedAt,
            truncated: truncated.truncated,
          }
        }

        await Bun.sleep(BACKGROUND_POLL_MS)
      }
    }

    this.pruneIfNeeded()
    const pid = request.processId || processId()
    const cmd = buildDockerShellCommand(sessionId, request.workdir)
    const proc = spawnSafe({
      kind: "host",
      cmd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        ...dockerEnv(),
      },
    })
    const managed: ProcessInfo = {
      processId: pid,
      sessionId,
      command,
      tty: true,
      acceptsStdin: true,
      startedAt: Date.now(),
      lastUsedAt: Date.now(),
      process: proc,
      buf: new HeadTailBuffer(EXEC_OUTPUT_MAX_BYTES),
      transcript: new HeadTailBuffer(EXEC_OUTPUT_MAX_BYTES),
      exited: false,
    }
    this.processes.set(pid, managed)
    this.attachReaders(managed, onDelta)

    writeStdin(proc.stdin, `${command}\n`)
    const start = Date.now()
    await Bun.sleep(Math.min(timeoutMs, 30000))
    const output = this.drainOutput(managed)
    const truncated = truncateText(output, maxChars)

    if (managed.exited) {
      this.processes.delete(pid)
      return {
        output: truncated.text,
        exitCode: managed.exitCode,
        wallTimeMs: Date.now() - start,
        truncated: truncated.truncated,
      }
    }

    return {
      processId: pid,
      output: truncated.text,
      wallTimeMs: Date.now() - start,
      truncated: truncated.truncated,
    }
  }

  async writeStdin(request: WriteStdinRequest): Promise<WriteStdinResult> {
    const input = typeof request.chars === "string" ? request.chars : ""
    const termAgentManaged = this.termAgentProcesses.get(request.processId)
    const ptyHostManaged = this.ptyHostProcesses.get(request.processId)
    const localManaged = this.processes.get(request.processId)
    const sid0 = termAgentManaged ? termAgentManaged.sessionId : ptyHostManaged ? ptyHostManaged.sessionId : localManaged ? localManaged.sessionId : ""
    const sid = typeof sid0 === "string" ? sid0.trim() : ""
    const maxChars = toInt(request.maxChars, 20000, 1000, 200000)

    if (sid && input) {
      const boundary = commandBoundaryError(input, scopedWorkdir(sid, "."))

      if (boundary) {
        return {
          output: boundary,
          exitCode: 126,
          wallTimeMs: 0,
          truncated: false,
          error: boundary,
          errorCode: "SESSION_BOUNDARY_VIOLATION",
        }
      }
    }

    if (USE_TERM_AGENT_PTY) {
      const out = await this.writeStdinTermAgent(request)

      if (out) {
        return out
      }
    }

    if (USE_PTY_HOST_V2) {
      const out = await this.writeStdinPtyHost(request)

      if (out) {
        return out
      }
    }

    const managed = this.processes.get(request.processId)

    if (!managed) {
      const done = this.completedResult(request.processId)

      if (done) {
        const truncated = truncateText(done.output, maxChars)
        return {
          processId: request.processId,
          output: truncated.text,
          exitCode: done.exitCode,
          wallTimeMs: done.wallTimeMs,
          truncated: truncated.truncated,
        }
      }

      return {
        output: "Unknown process_id",
        exitCode: -1,
        wallTimeMs: 0,
        truncated: false,
        error: "Unknown process_id",
        errorCode: "UNKNOWN_PROCESS_ID",
      }
    }

    if (managed.exited) {
      const output = this.drainOutput(managed)
      this.processes.delete(managed.processId)
      const truncated = truncateText(output, maxChars)
      const at = typeof managed.exitAt === "number" ? managed.exitAt : Date.now()
      const wall = Math.max(0, at - managed.startedAt)
      return {
        output: truncated.text,
        exitCode: managed.exitCode,
        wallTimeMs: wall,
        truncated: truncated.truncated,
      }
    }

    if (!managed.acceptsStdin && input) {
      return {
        processId: managed.processId,
        output: "Process is non-interactive and cannot receive stdin. Use terminal_exec for new commands, terminal_send with empty keys to poll, or terminate_command to stop it.",
        wallTimeMs: 0,
        truncated: false,
        error: "Process does not accept stdin",
        errorCode: "NON_INTERACTIVE_PROCESS",
      }
    }

    if (input) {
      writeStdin(managed.process.stdin, input)
    }

    managed.lastUsedAt = Date.now()
    const start = Date.now()
    const waitMs = toInt(request.yieldTimeMs, input ? 250 : 5000, 50, 30000)
    await Bun.sleep(waitMs)
    const output = this.drainOutput(managed)
    const truncated = truncateText(output, maxChars)

    if (managed.exited) {
      this.processes.delete(managed.processId)
      return {
        output: truncated.text,
        exitCode: managed.exitCode,
        wallTimeMs: Date.now() - start,
        truncated: truncated.truncated,
      }
    }

    return {
      processId: managed.processId,
      output: truncated.text,
      wallTimeMs: Date.now() - start,
      truncated: truncated.truncated,
    }
  }

  resize(processId: string, cols?: number, rows?: number): ResizePtyResult {
    const id0 = typeof processId === "string" ? processId : ""
    const id = id0.trim()

    if (!id) {
      return { ok: false, error: "Missing process_id" }
    }

    const termAgent = this.termAgentProcesses.get(id)

    if (termAgent) {
      const c = toInt(cols, 120, 40, 500)
      const r = toInt(rows, 36, 10, 300)
      termAgent.lastUsedAt = Date.now()
      void terminalResize({
        processId: id,
        cols: c,
        rows: r,
      })
      return {
        ok: true,
        processId: id,
        cols: c,
        rows: r,
      }
    }

    const ptyHost = this.ptyHostProcesses.get(id)

    if (ptyHost) {
      const c = toInt(cols, 120, 40, 500)
      const r = toInt(rows, 36, 10, 300)
      ptyHost.lastUsedAt = Date.now()
      void this.ptyHost.resize({
        processId: id,
        cols: c,
        rows: r,
      })
      return {
        ok: true,
        processId: id,
        cols: c,
        rows: r,
      }
    }

    const managed = this.processes.get(id)

    if (!managed || managed.exited) {
      return { ok: false, error: "Unknown process_id" }
    }

    const c = toInt(cols, 120, 40, 500)
    const r = toInt(rows, 36, 10, 300)
    const ok = writeStdin(managed.process.stdin, `stty cols ${c} rows ${r}\n`)

    if (!ok) {
      return { ok: false, error: "Failed to write PTY resize command" }
    }

    managed.lastUsedAt = Date.now()
    return {
      ok: true,
      processId: id,
      cols: c,
      rows: r,
    }
  }

  terminate(processId: string) {
    const id0 = typeof processId === "string" ? processId : ""
    const id = id0.trim()

    if (!id) {
      return false
    }

    this.completed.delete(id)

    const termAgent = this.termAgentProcesses.get(id)

    if (termAgent) {
      this.termAgentProcesses.delete(id)
      void terminalTerminate({ processId: id })
      return true
    }

    const ptyHost = this.ptyHostProcesses.get(id)

    if (ptyHost) {
      this.ptyHostProcesses.delete(id)
      void this.ptyHost.terminate({ processId: id })
      return true
    }

    const managed = this.processes.get(id)

    if (!managed) {
      return false
    }

    managed.process.kill()
    this.processes.delete(id)
    return true
  }
}

export const unifiedExecManager = new UnifiedExecManager()

export const workspaceRootForSession = (sessionId: string) => {
  return scopedWorkdir(sessionId)
}

