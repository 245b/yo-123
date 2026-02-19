import path from "node:path"
import { HostSupervisor } from "@operator/runtime-core/host-supervisor"
import { HostHandshakeCoordinator } from "./host-handshake"
import type { AgentWsServerEvent } from "../types"
import type { ChatCleanupResult } from "../../chat/cleanup"
import { decodeRuntimeEnvelope, makeRuntimeFrameBase } from "./protocol"
import { spawnSafe } from "@operator/execution/spawn-safe"
import { createRestartBudget, recordRestart, trimRestarts } from "@operator/execution/restart-budget"
import { logEvent } from "@operator/observability"
import type {
  RuntimeEnvelope,
  RuntimeExecCommandParams,
  RuntimeInterruptParams,
  RuntimeMethod,
  RuntimeMethodParams,
  RuntimeResizePtyParams,
  RuntimeResponse,
  RuntimeRequestUserInputResponseParams,
  RuntimeUploadFeedbackParams,
  RuntimeSubmitUserTurnParams,
  RuntimeTerminateCommandParams,
  RuntimeWriteStdinParams,
  RuntimeApproveParams,
  RuntimeResumeSessionParams,
} from "./protocol"
import type { HostHealthEvent } from "@operator/contracts/host-health"

type RuntimeListener = (chatId: string, payload: AgentWsServerEvent) => void

type PendingRequest = {
  done: (value: RuntimeResponse) => void
  fail: (reason?: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

const nowId = () => {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 10)
  return `${t}-${r}`
}

const findRepoRoot = async (cwd: string) => {
  const abs = path.resolve(cwd)
  var cur = abs

  for (;;) {
    const marker = path.join(cur, ".git")
    const exists = await Bun.file(marker).exists()
    const headExists = await Bun.file(path.join(marker, "HEAD")).exists()
    const plansExists = await Bun.file(path.join(cur, "PLANS.md")).exists()
    const agentsExists = await Bun.file(path.join(cur, "agents", "templates", "orchestrator.md")).exists()

    if (exists || headExists || plansExists || agentsExists) {
      return cur
    }

    const parent = path.dirname(cur)

    if (!parent || parent === cur) {
      return abs
    }

    cur = parent
  }
}

const REQUEST_TIMEOUT_OVERRIDE = Number.parseInt((process.env.OPERATOR_RUNTIME_REQUEST_TIMEOUT_MS || "").trim(), 10)

const timeoutForMethod = (method: RuntimeMethod) => {
  if (Number.isFinite(REQUEST_TIMEOUT_OVERRIDE) && REQUEST_TIMEOUT_OVERRIDE > 0) {
    return REQUEST_TIMEOUT_OVERRIDE
  }

  if (method === "submit_user_turn") {
    return 20_000
  }

  if (method === "exec_command" || method === "write_stdin") {
    return 240_000
  }

  return 60_000
}

const safeParse = (raw: string) => {
  const text = typeof raw === "string" ? raw : ""
  const trimmed = text.trim()

  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    const out = decodeRuntimeEnvelope(parsed)

    if (out.success) {
      return out.data as RuntimeEnvelope
    }

    const row = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
    const kind0 = typeof row?.kind === "string" ? row.kind : ""
    const kind = kind0.trim()

    if (kind === "response") {
      const id0 = typeof row?.id === "string" ? row.id : ""
      const id = id0.trim()

      if (!id) {
        return null
      }

      return {
        ...makeRuntimeFrameBase({
          id,
          requestId: id,
          sessionId: "operator",
          role: "exec-host",
          channel: "runtime",
          method: "legacy_response",
        }),
        version: "v1",
        kind: "response",
        ok: row?.ok === true,
        result: row?.result,
        error: typeof row?.error === "string" ? row.error : undefined,
      } as RuntimeEnvelope
    }

    if (kind === "event") {
      const chat0 = typeof row?.chat_id === "string" ? row.chat_id : ""
      const chatId = chat0.trim() || "operator"
      const payload = row?.payload && typeof row.payload === "object" ? row.payload : null

      if (!payload) {
        return null
      }

      const type0 = typeof (payload as { type?: unknown }).type === "string" ? (payload as { type: string }).type : "legacy_event"
      return {
        ...makeRuntimeFrameBase({
          sessionId: chatId,
          role: "exec-host",
          channel: "runtime",
          method: `event:${type0}`,
        }),
        version: "v1",
        kind: "event",
        event: type0,
        chat_id: chatId,
        payload: payload as AgentWsServerEvent,
      } as RuntimeEnvelope
    }

    return null
  } catch {
    return null
  }
}

const safeTrim = (raw: unknown) => {
  const t0 = typeof raw === "string" ? raw : ""
  return t0.trim()
}

const obsEvent = (env: RuntimeEnvelope) => {
  if (!env || env.kind !== "event") {
    return
  }

  const payload = env.payload as unknown
  const row = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null
  const type0 = typeof row?.type === "string" ? row.type : ""
  const type = type0.trim()
  const requestId = safeTrim(env.requestId) || undefined
  const chatId = safeTrim(env.chat_id) || undefined
  const sessionId = safeTrim(env.sessionId) || undefined

  if (!type) {
    logEvent({
      level: "warn",
      event: "runtime_event_untyped",
      requestId,
      chatId,
      sessionId,
      hostRole: env.role,
      channel: env.channel,
      details: payload,
    })
    return
  }

  if (type === "exec_command_output_delta") {
    const chunk0 = typeof row?.chunk === "string" ? row.chunk : ""
    logEvent({
      level: "info",
      event: "exec_command_output_delta",
      requestId,
      chatId,
      sessionId,
      hostRole: env.role,
      channel: env.channel,
      details: {
        turn_id: safeTrim(row?.turn_id) || undefined,
        call_id: safeTrim(row?.call_id) || undefined,
        process_id: safeTrim(row?.process_id) || undefined,
        chunk_len: chunk0.length,
      },
    })
    return
  }

  if (type === "agent_message_content_delta" || type === "reasoning_content_delta") {
    const delta0 = typeof row?.delta === "string" ? row.delta : ""
    logEvent({
      level: "info",
      event: type,
      requestId,
      chatId,
      sessionId,
      hostRole: env.role,
      channel: env.channel,
      details: {
        turn_id: safeTrim(row?.turn_id) || undefined,
        item_id: safeTrim(row?.item_id) || undefined,
        delta_len: delta0.length,
      },
    })
    return
  }

  if (type === "exec_command_begin") {
    logEvent({
      level: "info",
      event: "exec_command_begin",
      requestId,
      chatId,
      sessionId,
      hostRole: env.role,
      channel: env.channel,
      details: {
        turn_id: safeTrim(row?.turn_id) || undefined,
        call_id: safeTrim(row?.call_id) || undefined,
        process_id: safeTrim(row?.process_id) || undefined,
        tool_name: safeTrim(row?.tool_name) || undefined,
        command: safeTrim(row?.command) || undefined,
      },
    })
    return
  }

  if (type === "exec_command_end") {
    const out0 = typeof row?.output === "string" ? row.output : ""
    logEvent({
      level: "info",
      event: "exec_command_end",
      requestId,
      chatId,
      sessionId,
      hostRole: env.role,
      channel: env.channel,
      details: {
        turn_id: safeTrim(row?.turn_id) || undefined,
        call_id: safeTrim(row?.call_id) || undefined,
        process_id: safeTrim(row?.process_id) || undefined,
        exit_code: typeof row?.exit_code === "number" ? row.exit_code : undefined,
        wall_time_ms: typeof row?.wall_time_ms === "number" ? row.wall_time_ms : undefined,
        output_len: out0.length,
      },
    })
    return
  }

  if (type === "tool_approval_requested") {
    logEvent({
      level: "warn",
      event: "tool_approval_requested",
      requestId,
      chatId,
      sessionId,
      hostRole: env.role,
      channel: env.channel,
      details: {
        turn_id: safeTrim(row?.turn_id) || undefined,
        call_id: safeTrim(row?.call_id) || undefined,
        tool: safeTrim(row?.tool) || undefined,
        reason: safeTrim(row?.reason) || undefined,
        command: safeTrim(row?.command) || undefined,
        cwd: safeTrim(row?.cwd) || undefined,
        details: typeof row?.details === "undefined" ? undefined : row?.details,
      },
    })
    return
  }

  if (type === "warning") {
    logEvent({
      level: "warn",
      event: "warning",
      requestId,
      chatId,
      sessionId,
      hostRole: env.role,
      channel: env.channel,
      details: {
        message: safeTrim(row?.message) || undefined,
      },
    })
    return
  }

  if (type === "error") {
    logEvent({
      level: "error",
      event: "error",
      requestId,
      chatId,
      sessionId,
      hostRole: env.role,
      channel: env.channel,
      details: {
        message: safeTrim(row?.message) || undefined,
      },
    })
    return
  }

  logEvent({
    level: "info",
    event: type,
    requestId,
    chatId,
    sessionId,
    hostRole: env.role,
    channel: env.channel,
    details: payload,
  })
}

const writeInput = (input: unknown, raw: string) => {
  const stream = input && typeof input === "object" ? (input as { write?: unknown } | null) : null
  const fn = stream?.write

  if (typeof fn !== "function") {
    return false
  }

  ;(stream as { write: (text: string) => unknown }).write(raw)
  return true
}

const parseCmd = (raw: string) => {
  const text = typeof raw === "string" ? raw : ""
  const trimmed = text.trim()

  if (!trimmed) {
    return []
  }

  const out: string[] = []
  const parts = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []

  for (var i = 0; i < parts.length; i++) {
    const part = parts[i] ?? ""
    const t = part.trim()

    if (!t) {
      continue
    }

    if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
      out.push(t.slice(1, -1))
      continue
    }

    out.push(t)
  }

  return out
}

const eventPayload = (message: string): AgentWsServerEvent => ({
  type: "error",
  chat_id: "operator",
  message,
})

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

const sessionIdFromParams = (params: unknown) => {
  const row = params && typeof params === "object" ? (params as { chat_id?: unknown; session_id?: unknown } | null) : null
  const session0 = typeof row?.session_id === "string" ? row.session_id : ""
  const chat0 = typeof row?.chat_id === "string" ? row.chat_id : ""
  const session = session0.trim()

  if (session) {
    return session
  }

  const chat = chat0.trim()

  if (chat) {
    return chat
  }

  return "operator"
}

export class RuntimeSupervisor {
  private readonly root: string
  private readonly cmd: string[]
  private readonly hostSupervisor: HostSupervisor | null
  private readonly hostHandshake: HostHandshakeCoordinator | null
  private readonly spawnEnv: Record<string, string | undefined>
  private process: Bun.Subprocess | null = null
  private stdoutBuffer = ""
  private stderrBuffer = ""
  private boot: Promise<void> | null = null
  private readonly pending = new Map<string, PendingRequest>()
  private readonly dataPending = new Map<string, PendingRequest>()
  private readonly listeners = new Map<string, Set<RuntimeListener>>()
  private execState: "starting" | "ready" | "degraded" | "stopped" = "stopped"
  private execHeartbeatAt = Date.now()
  private readonly execBudget = createRestartBudget({ limit: 3, windowMs: 5 * 60 * 1000 })
  private readonly execTimer: ReturnType<typeof setInterval>

  constructor(input: { root: string; env?: Record<string, string | undefined> }) {
    this.root = path.resolve(input.root)
    this.spawnEnv = input.env ?? {}
    this.execTimer = setInterval(() => {
      this.tickExec()
    }, 1000)
    this.emitSupervisorHealth("ready")
    this.emitExecHealth("stopped")
    const env0 = (process.env.OPERATOR_RUNTIME_CMD || "").trim()
    const envCmd = parseCmd(env0)
    const impl0 = (process.env.OPERATOR_RUNTIME_IMPL || "").trim()
    const impl = impl0.toLowerCase()
    const worker = path.join(this.root, "server", "agent", "runtime", "worker.ts")

    if (envCmd.length) {
      this.cmd = envCmd
      const runtime = this.createHostSupervisor()
      this.hostSupervisor = runtime.host
      this.hostHandshake = runtime.handshake
      return
    }

    if (impl === "rust") {
      const envManifest0 = (process.env.OPERATOR_RUNTIME_RUST_MANIFEST || "").trim()

      if (!envManifest0) {
        throw new Error("OPERATOR_RUNTIME_IMPL=rust requires OPERATOR_RUNTIME_RUST_MANIFEST to be set to a Cargo.toml path.")
      }

      const rustManifest = envManifest0
      this.cmd = [
        "cargo",
        "run",
        "--quiet",
        "--manifest-path",
        rustManifest,
        "-p",
        "operator-web-runtime",
        "--bin",
        "operator-web-runtime",
      ]
      const runtime = this.createHostSupervisor()
      this.hostSupervisor = runtime.host
      this.hostHandshake = runtime.handshake
      return
    }

    this.cmd = ["bun", worker]
    const runtime = this.createHostSupervisor()
    this.hostSupervisor = runtime.host
    this.hostHandshake = runtime.handshake
  }

  private createHostSupervisor() {
    const enabled = flagOn(process.env.OPERATOR_RUNTIME_V2 || "", false)

    if (!enabled) {
      return {
        host: null as HostSupervisor | null,
        handshake: null as HostHandshakeCoordinator | null,
      }
    }

    const host = new HostSupervisor()
    host.onHealth((health) => {
      this.onHostHealth(health)
    })
    const handshake = new HostHandshakeCoordinator({
      host,
      onWarning: (role, message) => {
        this.emit("operator", {
          type: "warning",
          chat_id: "operator",
          message: `[${role}] ${message}`,
        })
      },
    })
    host.onEnvelope(({ role, envelope }) => {
      handshake.onEnvelope(role, envelope)
      this.onAuxEnvelope(role, envelope)
    })
    void this.startAuxHosts(host, handshake)
    return { host, handshake }
  }

  private onHostHealth(health: HostHealthEvent) {
    this.emit("operator", {
      type: "runtime_host_health",
      chat_id: "operator",
      host_role: health.hostRole,
      state: health.state,
      heartbeat_lag_ms: health.heartbeatLagMs,
      restart_count: health.restartCount,
      restart_limit: health.restartLimit,
      reason: health.reason,
    })
  }

  private emitSupervisorHealth(reason?: string) {
    const note0 = typeof reason === "string" ? reason : ""
    const note = note0.trim()
    this.emit("operator", {
      type: "runtime_host_health",
      chat_id: "operator",
      host_role: "runtime-supervisor",
      state: "ready",
      heartbeat_lag_ms: 0,
      restart_count: 0,
      restart_limit: 1,
      reason: note ? note : undefined,
    })
  }

  private emitExecHealth(reason?: string) {
    const lag = Math.max(0, Date.now() - this.execHeartbeatAt)
    const note0 = typeof reason === "string" ? reason : ""
    const note = note0.trim()
    this.emit("operator", {
      type: "runtime_host_health",
      chat_id: "operator",
      host_role: "exec-host",
      state: this.execState,
      heartbeat_lag_ms: lag,
      restart_count: this.execBudget.restarts.length,
      restart_limit: this.execBudget.limit,
      reason: note ? note : undefined,
    })
  }

  private scheduleExecRestart(reason: string) {
    if (this.execState === "stopped" || this.execState === "degraded") {
      return
    }

    if (this.boot) {
      return
    }

    const at = Date.now()
    trimRestarts(this.execBudget, at)

    if (this.execBudget.restarts.length >= this.execBudget.limit) {
      this.execState = "degraded"
      this.emitExecHealth("restart_budget_exhausted")
      return
    }

    recordRestart(this.execBudget, at)
    this.execState = "starting"
    this.execHeartbeatAt = Date.now()
    this.emitExecHealth(reason || "restarting")
    this.boot = Bun.sleep(700)
      .then(() => {
        if (this.execState === "stopped" || this.execState === "degraded") {
          return
        }

        return this.spawn()
      })
      .finally(() => {
        this.boot = null
      })
    void this.boot
  }

  private handleExecExit(code: number | null) {
    if (this.execState === "stopped") {
      this.emitExecHealth("stopped")
      return
    }

    if (this.execState === "degraded") {
      this.emitExecHealth("degraded")
      return
    }

    const note = typeof code === "number" ? `exited:${code}` : "exited"
    this.scheduleExecRestart(note)
  }

  private tickExec() {
    const proc = this.process

    if (!proc) {
      return
    }

    if (this.execState === "stopped" || this.execState === "degraded") {
      return
    }

    const lag = Math.max(0, Date.now() - this.execHeartbeatAt)

    if (lag <= 15_000) {
      return
    }

    this.execState = "starting"
    this.emitExecHealth(`heartbeat_timeout:${lag}`)
    proc.kill()
  }

  private onAuxEnvelope(role: string, envelope: RuntimeEnvelope) {
    if (role !== "data-host") {
      return
    }

    if (envelope.kind !== "response") {
      return
    }

    const pending = this.dataPending.get(envelope.id)

    if (!pending) {
      return
    }

    clearTimeout(pending.timer)
    this.dataPending.delete(envelope.id)
    pending.done(envelope as RuntimeResponse)
  }

  private async startAuxHosts(host: HostSupervisor, handshake: HostHandshakeCoordinator) {
    const extensionOn = flagOn(process.env.OPERATOR_EXTENSION_HOST_V1 || "", true)

    if (extensionOn) {
      const script = path.join(this.root, "server", "agent", "runtime", "hosts", "extension-host.ts")
      await host.start({
        role: "extension-host",
        cmd: ["bun", script],
        restartLimit: 3,
        restartWindowMs: 5 * 60 * 1000,
        heartbeatTimeoutMs: 15_000,
      })
      handshake.start("extension-host")
    }

    const lspOn = flagOn(process.env.OPERATOR_LSP_HOST_V1 || "", true)

    if (lspOn) {
      const script = path.join(this.root, "server", "agent", "runtime", "hosts", "lsp-host.ts")
      await host.start({
        role: "lsp-host",
        cmd: ["bun", script],
        restartLimit: 3,
        restartWindowMs: 5 * 60 * 1000,
        heartbeatTimeoutMs: 15_000,
      })
      handshake.start("lsp-host")
    }

    const dataOn = flagOn(process.env.OPERATOR_DATA_HOST_V1 || "", false)

    if (!dataOn) {
      return
    }

    const script = path.join(this.root, "server", "data", "cleanup-host.ts")
    await host.start({
      role: "data-host",
      cmd: ["bun", script],
      restartLimit: 5,
      restartWindowMs: 10 * 60 * 1000,
      heartbeatTimeoutMs: 15_000,
    })
  }

  private async requestData<K extends RuntimeMethod>(method: K, params: RuntimeMethodParams[K]) {
    const host = this.hostSupervisor

    if (!host) {
      return {
        ok: false,
        error: "Data host unavailable",
        result: null as unknown,
      }
    }

    const id = nowId()
    const sessionId = sessionIdFromParams(params)
    const frame: RuntimeEnvelope = {
      ...makeRuntimeFrameBase({
        id,
        requestId: id,
        sessionId,
        role: "runtime-supervisor",
        channel: "health",
        method,
      }),
      version: "v1",
      kind: "request",
      method,
      params,
    }

    const promise = new Promise<RuntimeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.dataPending.delete(id)
        reject(new Error(`Data host request timed out: ${method}`))
      }, 240_000)
      this.dataPending.set(id, {
        done: resolve,
        fail: reject,
        timer,
      })
    })

    const sent = host.send("data-host", frame)

    if (!sent) {
      const row = this.dataPending.get(id)

      if (row) {
        clearTimeout(row.timer)
      }

      this.dataPending.delete(id)
      return {
        ok: false,
        error: "Data host stdin unavailable",
        result: null as unknown,
      }
    }

    const out = await promise.catch((err) => {
      const row = err && typeof err === "object" ? (err as { message?: unknown } | null) : null
      const msg0 = typeof row?.message === "string" ? row.message : ""
      const msg = msg0.trim() || "Data host request failed"
      return {
        ...makeRuntimeFrameBase({
          id,
          requestId: id,
          sessionId,
          role: "runtime-supervisor",
          channel: "health",
          method,
        }),
        version: "v1",
        kind: "response",
        ok: false,
        error: msg,
      } as RuntimeResponse
    })

    if (!out.ok) {
      const err0 = typeof out.error === "string" ? out.error : ""
      const error = err0.trim() || "Data host request failed"
      return {
        ok: false,
        error,
        result: out.result ?? null,
      }
    }

    return {
      ok: true,
      error: "",
      result: out.result ?? null,
    }
  }

  async cleanupChat(chatId: string): Promise<ChatCleanupResult> {
    const id0 = typeof chatId === "string" ? chatId : ""
    const id = id0.trim()
    const out = await this.requestData("cleanup_request", { chat_id: id })

    if (!out.ok) {
      return {
        ok: false,
        chatId: id,
        removedPaths: [],
        removedFiles: [],
        errors: [out.error || "Cleanup request failed"],
      }
    }

    return out.result as ChatCleanupResult
  }

  subscribe(chatId: string, listener: RuntimeListener) {
    const id0 = typeof chatId === "string" ? chatId : ""
    const id = id0.trim() || "*"
    const set0 = this.listeners.get(id)

    if (set0) {
      set0.add(listener)
      return () => {
        set0.delete(listener)

        if (!set0.size) {
          this.listeners.delete(id)
        }
      }
    }

    const set = new Set<RuntimeListener>()
    set.add(listener)
    this.listeners.set(id, set)
    return () => {
      set.delete(listener)

      if (!set.size) {
        this.listeners.delete(id)
      }
    }
  }

  private emit(chatId: string, payload: AgentWsServerEvent) {
    const id0 = typeof chatId === "string" ? chatId : ""
    const id = id0.trim() || "operator"
    const direct = this.listeners.get(id)

    if (direct) {
      for (const listener of direct) {
        listener(id, payload)
      }
    }

    const wildcard = this.listeners.get("*")

    if (!wildcard) {
      return
    }

    for (const listener of wildcard) {
      listener(id, payload)
    }
  }

  private async ensureStarted() {
    if (this.process) {
      return
    }

    if (this.execState === "degraded") {
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

  private async readStdout(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader()
    const decoder = new TextDecoder()

    for (;;) {
      const row = await reader.read()

      if (row.done) {
        break
      }

      const part = decoder.decode(row.value, { stream: true })

      if (!part) {
        continue
      }

      this.stdoutBuffer += part
      this.drainStdoutLines()
    }

    const tail = decoder.decode()

    if (tail) {
      this.stdoutBuffer += tail
      this.drainStdoutLines()
    }
  }

  private async readStderr(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader()
    const decoder = new TextDecoder()

    for (;;) {
      const row = await reader.read()

      if (row.done) {
        break
      }

      const part = decoder.decode(row.value, { stream: true })

      if (!part) {
        continue
      }

      this.stderrBuffer += part
      this.drainStderrLines()
    }

    const tail = decoder.decode()

    if (tail) {
      this.stderrBuffer += tail
      this.drainStderrLines()
    }
  }

  private drainStdoutLines() {
    for (;;) {
      const idx = this.stdoutBuffer.indexOf("\n")

      if (idx < 0) {
        return
      }

      const line = this.stdoutBuffer.slice(0, idx)
      this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1)
      this.onStdoutLine(line)
    }
  }

  private drainStderrLines() {
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

      console.error(`[runtime] ${text}`)
    }
  }

  private onStdoutLine(line: string) {
    const parsed = safeParse(line)

    if (!parsed || typeof parsed !== "object") {
      return
    }

    this.execHeartbeatAt = Date.now()

    if (this.execState === "starting") {
      this.execState = "ready"
      this.emitExecHealth("online")
    }

    if (parsed.kind === "event") {
      const ev0 = typeof parsed.event === "string" ? parsed.event : ""
      const ev = ev0.trim().toLowerCase()

      if (ev === "heartbeat") {
        this.emitExecHealth("heartbeat")
        return
      }

      obsEvent(parsed)
      const payload = parsed.payload

      if (!payload || typeof payload !== "object") {
        return
      }

      this.emit(parsed.chat_id, payload as AgentWsServerEvent)
      return
    }

    if (parsed.kind !== "response") {
      return
    }

    const pending = this.pending.get(parsed.id)

    if (!pending) {
      return
    }

    clearTimeout(pending.timer)
    this.pending.delete(parsed.id)
    pending.done(parsed)
  }

  private async spawn() {
    const workerRoot = await findRepoRoot(this.root)
    this.execState = "starting"
    this.execHeartbeatAt = Date.now()
    this.emitExecHealth("spawned")
    const env = {
      ...this.spawnEnv,
      OPERATOR_RUNTIME_ROOT: workerRoot,
    }
    const proc = spawnSafe({
      kind: "host",
      cmd: this.cmd,
      cwd: workerRoot,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env,
    })
    this.process = proc

    const out = proc.stdout

    if (out) {
      void this.readStdout(out)
    }

    const err = proc.stderr

    if (err) {
      void this.readStderr(err)
    }

    void proc.exited.then((code) => {
      this.process = null
      const pending = Array.from(this.pending.values())
      this.pending.clear()

      for (const row of pending) {
        clearTimeout(row.timer)
        row.fail(new Error(`runtime exited (${code})`))
      }

      this.handleExecExit(typeof code === "number" ? code : null)

      const msg = `Runtime process exited with code ${code}.`
      const payload = this.execState === "starting"
        ? ({ type: "warning", chat_id: "operator", message: `${msg} Restarting...` } as AgentWsServerEvent)
        : eventPayload(msg)
      this.emit("operator", payload)
    })
  }

  private async request<K extends RuntimeMethod>(method: K, params: RuntimeMethodParams[K]) {
    await this.ensureStarted()

    if (!this.process) {
      return {
        ok: false,
        error: "Runtime unavailable",
        result: null as unknown,
      }
    }

    const id = nowId()
    const sessionId = sessionIdFromParams(params)
    const frame: RuntimeEnvelope = {
      ...makeRuntimeFrameBase({
        id,
        requestId: id,
        sessionId,
        role: "runtime-supervisor",
        channel: "runtime",
        method,
      }),
      version: "v1",
      kind: "request",
      method,
      params,
    }
    const timeoutMs = timeoutForMethod(method)

    const promise = new Promise<RuntimeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Runtime request timed out: ${method}`))
      }, timeoutMs)
      this.pending.set(id, {
        done: resolve,
        fail: reject,
        timer,
      })
    })

    const raw = `${JSON.stringify(frame)}\n`
    const ok = writeInput(this.process.stdin, raw)

    if (!ok) {
      const row = this.pending.get(id)

      if (row) {
        clearTimeout(row.timer)
      }

      this.pending.delete(id)
      return {
        ok: false,
        error: "Runtime stdin is not writable",
        result: null as unknown,
      }
    }

    const out = await promise.catch((err) => {
      const row = err && typeof err === "object" ? (err as { message?: unknown } | null) : null
      const msg0 = typeof row?.message === "string" ? row.message : ""
      const msg = msg0.trim() || "Runtime request failed"
      return {
        ...makeRuntimeFrameBase({
          id,
          requestId: id,
          sessionId,
          role: "runtime-supervisor",
          channel: "runtime",
          method,
        }),
        version: "v1",
        kind: "response",
        ok: false,
        error: msg,
      } as RuntimeResponse
    })

    if (!out.ok) {
      const err0 = typeof out.error === "string" ? out.error : ""
      const error = err0.trim() || "Runtime request failed"
      return {
        ok: false,
        error,
        result: out.result ?? null,
      }
    }

    return {
      ok: true,
      error: "",
      result: out.result ?? null,
    }
  }

  submitUserTurn(params: RuntimeSubmitUserTurnParams) {
    return this.request("submit_user_turn", params)
  }

  writeStdin(params: RuntimeWriteStdinParams) {
    return this.request("write_stdin", params)
  }

  resizePty(params: RuntimeResizePtyParams) {
    return this.request("resize_pty", params)
  }

  execCommand(params: RuntimeExecCommandParams) {
    return this.request("exec_command", params)
  }

  terminateCommand(params: RuntimeTerminateCommandParams) {
    return this.request("terminate_command", params)
  }

  interrupt(params: RuntimeInterruptParams) {
    return this.request("interrupt", params)
  }

  approve(params: RuntimeApproveParams) {
    return this.request("approve", params)
  }

  requestUserInputResponse(params: RuntimeRequestUserInputResponseParams) {
    return this.request("request_user_input_response", params)
  }

  uploadFeedback(params: RuntimeUploadFeedbackParams) {
    return this.request("upload_feedback", params)
  }

  listSessions() {
    return this.request("list_sessions", {})
  }

  resumeSession(params: RuntimeResumeSessionParams) {
    return this.request("resume_session", params)
  }

  hostStates() {
    const host = this.hostSupervisor

    if (!host) {
      return {
        enabled: false,
        extensionHost: "stopped",
        lspHost: "stopped",
      }
    }

    return {
      enabled: true,
      extensionHost: host.state("extension-host"),
      lspHost: host.state("lsp-host"),
    }
  }

  stop() {
    const proc = this.process

    this.execState = "stopped"
    this.emitExecHealth("stopped")
    clearInterval(this.execTimer)

    this.hostHandshake?.stopAll()
    this.hostSupervisor?.stopAll()

    const data = Array.from(this.dataPending.values())
    this.dataPending.clear()

    for (const row of data) {
      clearTimeout(row.timer)
      row.fail(new Error("data-host stopped"))
    }

    if (!proc) {
      return
    }

    proc.kill()
    this.process = null
  }
}
