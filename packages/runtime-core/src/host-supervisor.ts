import type { HostHealthEvent } from "@operator/contracts/host-health"
import { decodeRuntimeEnvelope, makeRuntimeFrameBase, type RuntimeEnvelope, type RuntimeRole } from "@operator/contracts/runtime-ipc"
import { spawnSafe } from "@operator/execution/spawn-safe"
import type { HostStartInput, IHostSupervisor } from "./interfaces"
import { createEmitter, randomId, safeJsonParse } from "./utils"

type HostRuntime = {
  role: RuntimeRole
  config: HostStartInput
  process: Bun.Subprocess | null
  state: "starting" | "ready" | "degraded" | "stopped"
  restarts: number[]
  heartbeatAt: number
  lastReason: string
  outBuffer: string
  errBuffer: string
}

const now = () => Date.now()

const toHealth = (row: HostRuntime): HostHealthEvent => {
  const lag = Math.max(0, now() - row.heartbeatAt)
  const restartLimit = Math.max(1, row.config.restartLimit)
  const windowMs = Math.max(1, row.config.restartWindowMs)
  const restartCount = row.restarts.length
  return {
    id: randomId(),
    hostRole: row.role,
    state: row.state,
    heartbeatLagMs: lag,
    restartCount,
    restartLimit,
    windowMs,
    ts: new Date().toISOString(),
    reason: row.lastReason || undefined,
  }
}

const parseLine = (line: string) => {
  const json = safeJsonParse(line)

  if (!json) {
    return null
  }

  const parsed = decodeRuntimeEnvelope(json)

  if (!parsed.success) {
    return null
  }

  return parsed.data as RuntimeEnvelope
}

const cleanTimestamps = (input: number[], windowMs: number, at: number) => {
  const out: number[] = []

  for (var i = 0; i < input.length; i++) {
    const ts = input[i] ?? 0

    if (at - ts > windowMs) {
      continue
    }

    out.push(ts)
  }

  return out
}

const defaultConfig = (input: HostStartInput): HostStartInput => {
  const restartLimit = Number.isFinite(input.restartLimit) && input.restartLimit > 0 ? Math.floor(input.restartLimit) : 3
  const restartWindowMs =
    Number.isFinite(input.restartWindowMs) && input.restartWindowMs > 1000 ? Math.floor(input.restartWindowMs) : 300000
  const heartbeatTimeoutMs =
    Number.isFinite(input.heartbeatTimeoutMs) && input.heartbeatTimeoutMs > 1000 ? Math.floor(input.heartbeatTimeoutMs) : 15000
  return {
    ...input,
    restartLimit,
    restartWindowMs,
    heartbeatTimeoutMs,
  }
}

export class HostSupervisor implements IHostSupervisor {
  private readonly hosts = new Map<RuntimeRole, HostRuntime>()
  private readonly healthEmitter = createEmitter<HostHealthEvent>()
  private readonly envelopeEmitter = createEmitter<{ role: RuntimeRole; envelope: RuntimeEnvelope }>()
  private readonly timer: ReturnType<typeof setInterval>

  readonly onHealth = this.healthEmitter.event
  readonly onEnvelope = this.envelopeEmitter.event

  constructor() {
    this.timer = setInterval(() => {
      this.tick()
    }, 1000)
  }

  async start(input: HostStartInput) {
    const cfg = defaultConfig(input)
    const existing = this.hosts.get(cfg.role)

    if (existing?.process) {
      return true
    }

    const row: HostRuntime = {
      role: cfg.role,
      config: cfg,
      process: null,
      state: "starting",
      restarts: [],
      heartbeatAt: now(),
      lastReason: "",
      outBuffer: "",
      errBuffer: "",
    }

    this.hosts.set(cfg.role, row)
    this.spawn(row)
    this.emitHealth(row)
    return true
  }

  restart(role: RuntimeRole, reason?: string) {
    const row = this.hosts.get(role)

    if (!row) {
      return false
    }

    const note0 = typeof reason === "string" ? reason : ""
    const note = note0.trim() || "restart_requested"
    row.lastReason = note

    if (!row.process) {
      this.handleRestart(row)
      return true
    }

    row.process.kill()
    return true
  }

  stop(role: RuntimeRole) {
    const row = this.hosts.get(role)

    if (!row) {
      return
    }

    const proc = row.process

    if (proc) {
      proc.kill()
    }

    row.process = null
    row.state = "stopped"
    row.lastReason = "stopped"
    this.emitHealth(row)
  }

  stopAll() {
    for (const role of this.hosts.keys()) {
      this.stop(role)
    }

    clearInterval(this.timer)
  }

  send(role: RuntimeRole, envelope: RuntimeEnvelope) {
    const row = this.hosts.get(role)

    if (!row) {
      return false
    }

    const proc = row.process

    if (!proc) {
      return false
    }

    const stream = proc.stdin && typeof proc.stdin === "object" ? (proc.stdin as { write?: (raw: string) => unknown } | null) : null

    if (!stream || typeof stream.write !== "function") {
      return false
    }

    const raw = `${JSON.stringify(envelope)}\n`
    stream.write(raw)
    return true
  }

  state(role: RuntimeRole) {
    const row = this.hosts.get(role)

    if (!row) {
      return "stopped"
    }

    return row.state
  }

  private spawn(row: HostRuntime) {
    const proc = spawnSafe({
      kind: "host",
      cmd: row.config.cmd,
      cwd: row.config.cwd,
      env: row.config.env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })

    row.process = proc
    row.state = "starting"
    row.lastReason = "spawned"
    row.heartbeatAt = now()
    this.emitHealth(row)

    const stdout = proc.stdout

    if (stdout) {
      this.readStream(row, stdout, "stdout")
    }

    const stderr = proc.stderr

    if (stderr) {
      this.readStream(row, stderr, "stderr")
    }

    void proc.exited.then((code) => {
      row.process = null

      if (row.state === "stopped") {
        return
      }

      row.lastReason = `exited:${code}`
      this.handleRestart(row)
    })
  }

  private async readStream(row: HostRuntime, stream: ReadableStream<Uint8Array>, kind: "stdout" | "stderr") {
    const reader = stream.getReader()
    const decoder = new TextDecoder()

    for (;;) {
      const chunk = await reader.read()

      if (chunk.done) {
        break
      }

      const text = decoder.decode(chunk.value, { stream: true })

      if (!text) {
        continue
      }

      if (kind === "stdout") {
        row.outBuffer += text
        this.drainStdout(row)
      }

      if (kind === "stderr") {
        row.errBuffer += text
        this.drainStderr(row)
      }
    }

    const tail = decoder.decode()

    if (!tail) {
      return
    }

    if (kind === "stdout") {
      row.outBuffer += tail
      this.drainStdout(row)
    }

    if (kind === "stderr") {
      row.errBuffer += tail
      this.drainStderr(row)
    }
  }

  private drainStdout(row: HostRuntime) {
    for (;;) {
      const idx = row.outBuffer.indexOf("\n")

      if (idx < 0) {
        return
      }

      const line = row.outBuffer.slice(0, idx)
      row.outBuffer = row.outBuffer.slice(idx + 1)
      const envelope = parseLine(line)

      if (!envelope) {
        continue
      }

      row.heartbeatAt = now()

      if (row.state !== "ready") {
        row.state = "ready"
        row.lastReason = "online"
        this.emitHealth(row)
      }

      this.envelopeEmitter.fire({ role: row.role, envelope })

      if (envelope.kind === "request") {
        if (envelope.method !== "heartbeat") {
          continue
        }

        const base = makeRuntimeFrameBase({
          id: envelope.id,
          requestId: envelope.requestId,
          sessionId: envelope.sessionId,
          role: row.role,
          channel: envelope.channel,
          method: envelope.method,
        })

        this.send(row.role, {
          ...base,
          version: "v1",
          kind: "response",
          ok: true,
          result: { ok: true },
        })
      }

      if (envelope.kind === "event") {
        if (envelope.event !== "heartbeat") {
          continue
        }

        row.heartbeatAt = now()
      }
    }
  }

  private drainStderr(row: HostRuntime) {
    for (;;) {
      const idx = row.errBuffer.indexOf("\n")

      if (idx < 0) {
        return
      }

      const line = row.errBuffer.slice(0, idx)
      row.errBuffer = row.errBuffer.slice(idx + 1)
      const text0 = typeof line === "string" ? line : ""
      const text = text0.trim()

      if (!text) {
        continue
      }

      row.lastReason = text
    }
  }

  private handleRestart(row: HostRuntime) {
    const at = now()
    row.restarts.splice(0, row.restarts.length, ...cleanTimestamps(row.restarts, row.config.restartWindowMs, at))

    if (row.restarts.length >= row.config.restartLimit) {
      row.state = "degraded"
      row.lastReason = "restart_budget_exhausted"
      this.emitHealth(row)
      return
    }

    row.restarts.push(at)
    row.state = "starting"
    row.lastReason = "restarting"
    this.emitHealth(row)
    this.spawn(row)
  }

  private tick() {
    const at = now()

    for (const row of this.hosts.values()) {
      if (row.state === "stopped") {
        continue
      }

      const lag = at - row.heartbeatAt

      if (lag <= row.config.heartbeatTimeoutMs) {
        continue
      }

      row.lastReason = `heartbeat_timeout:${lag}`
      this.emitHealth(row)

      if (row.process) {
        row.process.kill()
      }
    }
  }

  private emitHealth(row: HostRuntime) {
    this.healthEmitter.fire(toHealth(row))
  }
}
