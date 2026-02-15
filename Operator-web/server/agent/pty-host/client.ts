import path from "node:path"
import { decodeRuntimeEnvelope, makeRuntimeFrameBase, type RuntimeEnvelope, type RuntimeRequest } from "@operator/contracts/runtime-ipc"
import type { HostHealthEvent } from "@operator/contracts/host-health"
import type { TerminalSnapshot } from "@operator/contracts/terminal"
import { createRestartBudget, recordRestart, trimRestarts } from "@operator/execution/restart-budget"
import { spawnSafe } from "@operator/execution/spawn-safe"

type Pending = {
  done: (value: RuntimeEnvelope) => void
  fail: (error?: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

const nowId = () => {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 10)
  return `${t}-${r}`
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

  if (out.success) {
    return out.data
  }

  return null
}

const writeLine = (stream: unknown, raw: string) => {
  const row = stream && typeof stream === "object" ? (stream as { write?: unknown } | null) : null
  const fn = row?.write

  if (typeof fn !== "function") {
    return false
  }

  ;(row as { write: (text: string) => unknown }).write(raw)
  return true
}

export class PtyHostClient {
  private process: Bun.Subprocess | null = null
  private boot: Promise<void> | null = null
  private stdoutBuffer = ""
  private stderrBuffer = ""
  private readonly pending = new Map<string, Pending>()
  private readonly snapshots = new Map<string, TerminalSnapshot>()
  private state: "starting" | "ready" | "degraded" | "stopped" = "stopped"
  private heartbeatAt = Date.now()
  private readonly budget = createRestartBudget({ limit: 5, windowMs: 10 * 60 * 1000 })
  private readonly healthListeners = new Set<(health: HostHealthEvent) => void>()
  private readonly timer: ReturnType<typeof setInterval>

  constructor(private readonly root: string) {
    this.timer = setInterval(() => {
      this.tick()
    }, 1000)
  }

  onHealth(listener: (health: HostHealthEvent) => void) {
    this.healthListeners.add(listener)
    return () => {
      this.healthListeners.delete(listener)
    }
  }

  private scriptPath() {
    return path.join(this.root, "server", "agent", "pty-host", "host.ts")
  }

  private fireHealth(reason?: string) {
    const lag = Math.max(0, Date.now() - this.heartbeatAt)
    const note0 = typeof reason === "string" ? reason : ""
    const note = note0.trim()
    const health: HostHealthEvent = {
      id: nowId(),
      hostRole: "pty-host",
      state: this.state,
      heartbeatLagMs: lag,
      restartCount: this.budget.restarts.length,
      restartLimit: this.budget.limit,
      windowMs: this.budget.windowMs,
      ts: new Date().toISOString(),
      reason: note ? note : undefined,
    }

    for (const listener of this.healthListeners) {
      listener(health)
    }
  }

  private online(reason?: string) {
    if (this.state === "ready") {
      this.heartbeatAt = Date.now()
      this.fireHealth(reason || "heartbeat")
      return
    }

    if (this.state === "degraded" || this.state === "stopped") {
      return
    }

    this.state = "ready"
    this.heartbeatAt = Date.now()
    this.fireHealth(reason || "online")
  }

  private async ensureStarted() {
    if (this.process) {
      return
    }

    if (this.state === "degraded") {
      return
    }

    if (this.boot) {
      await this.boot
      return
    }

    this.boot = this.spawn().finally(() => {
      this.boot = null
    })
    await this.boot
  }

  private async spawn() {
    this.state = "starting"
    this.heartbeatAt = Date.now()
    this.fireHealth("spawned")

    const proc = spawnSafe({
      kind: "host",
      cmd: ["bun", this.scriptPath()],
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        OPERATOR_PTY_HOST_ROOT: this.root,
      },
    })

    this.process = proc

    if (proc.stdout) {
      void this.readStdout(proc.stdout)
    }

    if (proc.stderr) {
      void this.readStderr(proc.stderr)
    }

    await this.restoreAll()

    void proc.exited.then((code) => {
      this.process = null
      const rows = Array.from(this.pending.values())
      this.pending.clear()

      for (const row of rows) {
        clearTimeout(row.timer)
        row.fail(new Error("PTY host exited"))
      }

      this.handleExit(typeof code === "number" ? code : null)
    })
  }

  private async readStdout(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader()
    const decoder = new TextDecoder()

    for (;;) {
      const part = await reader.read()

      if (part.done) {
        break
      }

      const text = decoder.decode(part.value, { stream: true })

      if (!text) {
        continue
      }

      this.stdoutBuffer += text
      this.drainStdout()
    }

    const tail = decoder.decode()

    if (!tail) {
      return
    }

    this.stdoutBuffer += tail
    this.drainStdout()
  }

  private async readStderr(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader()
    const decoder = new TextDecoder()

    for (;;) {
      const part = await reader.read()

      if (part.done) {
        break
      }

      const text = decoder.decode(part.value, { stream: true })

      if (!text) {
        continue
      }

      this.stderrBuffer += text
      this.drainStderr()
    }

    const tail = decoder.decode()

    if (!tail) {
      return
    }

    this.stderrBuffer += tail
    this.drainStderr()
  }

  private drainStdout() {
    for (;;) {
      const idx = this.stdoutBuffer.indexOf("\n")

      if (idx < 0) {
        return
      }

      const line = this.stdoutBuffer.slice(0, idx)
      this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1)
      const envelope = safeParse(line)

      if (!envelope) {
        continue
      }

      this.heartbeatAt = Date.now()

      if (envelope.kind === "event") {
        const ev0 = typeof envelope.event === "string" ? envelope.event : ""
        const ev = ev0.trim()

        if (ev === "heartbeat") {
          this.online("heartbeat")
          continue
        }

        if (ev === "pty_exit") {
          const payload = envelope.payload && typeof envelope.payload === "object" ? (envelope.payload as Record<string, unknown>) : null
          const snap0 = payload?.snapshot && typeof payload.snapshot === "object" ? (payload.snapshot as TerminalSnapshot) : null

          if (snap0 && typeof snap0.processId === "string") {
            const pid = snap0.processId.trim()

            if (pid) {
              this.snapshots.set(pid, snap0)
            }
          }
        }

        this.online(ev || "event")
        continue
      }

      if (envelope.kind !== "response") {
        this.online("envelope")
        continue
      }

      const row = this.pending.get(envelope.id)

      if (!row) {
        this.online("response")
        continue
      }

      clearTimeout(row.timer)
      this.pending.delete(envelope.id)
      row.done(envelope)
      this.online("response")
    }
  }

  private drainStderr() {
    for (;;) {
      const idx = this.stderrBuffer.indexOf("\n")

      if (idx < 0) {
        return
      }

      const line = this.stderrBuffer.slice(0, idx)
      this.stderrBuffer = this.stderrBuffer.slice(idx + 1)
      const text0 = typeof line === "string" ? line : ""
      const text = text0.trim()

      if (!text) {
        continue
      }

      console.error(`[pty-host] ${text}`)
    }
  }

  private scheduleRestart(reason: string) {
    if (this.state === "stopped" || this.state === "degraded") {
      return
    }

    if (this.boot) {
      return
    }

    const at = Date.now()
    trimRestarts(this.budget, at)

    if (this.budget.restarts.length >= this.budget.limit) {
      this.state = "degraded"
      this.fireHealth("restart_budget_exhausted")
      return
    }

    recordRestart(this.budget, at)
    this.state = "starting"
    this.fireHealth(reason || "restarting")
    this.boot = Bun.sleep(700)
      .then(() => {
        if (this.state === "stopped" || this.state === "degraded") {
          return
        }

        return this.spawn()
      })
      .finally(() => {
        this.boot = null
      })
    void this.boot
  }

  private handleExit(code: number | null) {
    const note = typeof code === "number" ? `exited:${code}` : "exited"

    if (this.state === "stopped") {
      this.fireHealth(note)
      return
    }

    if (this.state === "degraded") {
      this.fireHealth(note)
      return
    }

    this.scheduleRestart(note)
  }

  private tick() {
    const proc = this.process

    if (!proc) {
      return
    }

    if (this.state === "stopped" || this.state === "degraded") {
      return
    }

    const lag = Math.max(0, Date.now() - this.heartbeatAt)

    if (lag <= 15_000) {
      return
    }

    this.fireHealth(`heartbeat_timeout:${lag}`)
    proc.kill()
  }

  private async request(method: RuntimeRequest["method"], params: RuntimeRequest["params"], timeoutMs = 15000) {
    await this.ensureStarted()

    if (!this.process) {
      return { ok: false, error: "PTY host unavailable", result: null as unknown }
    }

    const id = nowId()
    const frame: RuntimeEnvelope = {
      ...makeRuntimeFrameBase({
        id,
        requestId: id,
        sessionId: "operator",
        role: "runtime-supervisor",
        channel: "terminal",
        method,
      }),
      version: "v1",
      kind: "request",
      method,
      params: params as never,
    }

    const promise = new Promise<RuntimeEnvelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`PTY host request timed out: ${method}`))
      }, timeoutMs)

      this.pending.set(id, {
        done: resolve,
        fail: reject,
        timer,
      })
    })

    const ok = writeLine(this.process.stdin, `${JSON.stringify(frame)}\n`)

    if (!ok) {
      const row = this.pending.get(id)

      if (row) {
        clearTimeout(row.timer)
      }

      this.pending.delete(id)
      return { ok: false, error: "PTY host stdin unavailable", result: null as unknown }
    }

    const out = await promise.catch((err) => {
      const row = err && typeof err === "object" ? (err as { message?: unknown } | null) : null
      const msg0 = typeof row?.message === "string" ? row.message : ""
      const msg = msg0.trim() || "PTY host request failed"
      return {
        ...makeRuntimeFrameBase({
          id,
          requestId: id,
          sessionId: "operator",
          role: "runtime-supervisor",
          channel: "terminal",
          method,
        }),
        version: "v1",
        kind: "response",
        ok: false,
        error: msg,
      } as RuntimeEnvelope
    })

    if (out.kind !== "response") {
      return { ok: false, error: "Invalid PTY host response", result: null as unknown }
    }

    if (out.ok !== true) {
      const err0 = typeof out.error === "string" ? out.error : ""
      const err = err0.trim() || "PTY host request failed"
      return { ok: false, error: err, result: out.result ?? null }
    }

    return { ok: true, error: "", result: out.result ?? null }
  }

  async open(input: { sessionId: string; processId?: string; cwd?: string; cols?: number; rows?: number }) {
    const out = await this.request("pty_open", input)

    if (!out.ok) {
      return out
    }

    const row = out.result && typeof out.result === "object" ? (out.result as { snapshot?: unknown } | null) : null
    const snap = row?.snapshot && typeof row.snapshot === "object" ? (row.snapshot as TerminalSnapshot) : null

    if (snap) {
      this.snapshots.set(snap.processId, snap)
    }

    return out
  }

  async write(input: { processId: string; chars: string }) {
    return this.request("pty_write", input)
  }

  async capture(input: { processId: string; maxChars?: number }) {
    return this.request("pty_capture", input)
  }

  async resize(input: { processId: string; cols?: number; rows?: number }) {
    return this.request("pty_resize", input)
  }

  async snapshot(input: { processId: string }) {
    const out = await this.request("pty_snapshot", input)

    if (!out.ok) {
      return out
    }

    const row = out.result && typeof out.result === "object" ? (out.result as { snapshot?: unknown } | null) : null
    const snap = row?.snapshot && typeof row.snapshot === "object" ? (row.snapshot as TerminalSnapshot) : null

    if (snap) {
      this.snapshots.set(snap.processId, snap)
    }

    return out
  }

  async terminate(input: { processId: string }) {
    const out = await this.request("pty_terminate", input)

    if (out.ok) {
      this.snapshots.delete(input.processId)
    }

    return out
  }

  async restoreAll() {
    const list = Array.from(this.snapshots.values())

    for (var i = 0; i < list.length; i++) {
      const row = list[i]

      if (!row) {
        continue
      }

      await this.request("pty_restore", {
        sessionId: row.sessionId,
        snapshot: {
          processId: row.processId,
          command: row.command,
          cwd: row.cwd,
          cols: row.cols,
          rows: row.rows,
          output: row.output,
          updatedAt: row.updatedAt,
        },
      })
    }
  }

  stop() {
    this.state = "stopped"
    this.fireHealth("stopped")
    clearInterval(this.timer)
    const proc = this.process

    if (!proc) {
      return
    }

    proc.kill()
    this.process = null
  }
}
