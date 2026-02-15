import path from "node:path"
import { appendFile, mkdir } from "node:fs/promises"
import { createInterface } from "node:readline"
import { createDeepSeek, type ToolRun } from "../../chat/deepseek"
import { projectDetect, projectTest } from "../../terminal/client"
import { COMPACT_USER_MESSAGE_MAX_TOKENS, DEFAULT_CONTEXT_WINDOW } from "../compaction"
import { estimateTokensFromMessages, latestUserMessages, normalizeMessages } from "../history"
import { composeInstructionLayers, readAgentsInstructions } from "../instructions"
import { runExecCommand, runWriteStdin } from "../tool-orchestrator"
import { approvalPolicyFrom, gateTerminalSend, shouldPromptCommand, evalExecPolicyForCommand } from "../policy/gate"
import type { AgentChatMessage, AgentTurnStatus, AgentUserInputQuestion, AgentWsServerEvent } from "../types"
import { unifiedExecManager } from "../unified-exec/manager"
import {
  TRUTHFULNESS_POLICY_RUNTIME_MESSAGE,
  type TruthModelCall,
  enforceNoMirroringOutput,
  enforceTruthfulnessAudit,
} from "./truthfulness"
import { runAutoVerification } from "./verification"
import { buildNoTextCompletionFallback, latestCompletedTermOutput } from "./completion"
import {
  chunkText,
  createToolRunner,
  latestUserText,
  recentConversation,
  summarizeToolEvidence,
  toModelMessages,
  toolDefinitions,
  toNum,
  withSystemInstructions,
  type RuntimeTerm,
} from "./helpers"
import { decodeRuntimeEnvelope, makeRuntimeFrameBase } from "./protocol"
import type {
  RuntimeEnvelope,
  RuntimeEvent,
  RuntimeExecCommandParams,
  RuntimeMethod,
  RuntimeRequestUserInputResponseParams,
  RuntimeRequest,
  RuntimeResizePtyParams,
  RuntimeResponse,
  RuntimeSubmitUserTurnParams,
  RuntimeTerminateCommandParams,
  RuntimeUploadFeedbackParams,
  RuntimeWriteStdinParams,
} from "./protocol"

type RuntimeSession = {
  chatId: string
  sessionId: string
  mode: string
  approvalPolicy: string
  sandboxMode: string
  hydrated: boolean
  hydrating: Promise<void> | null
  messages: AgentChatMessage[]
  latestSummary: string
  preservedUsers: AgentChatMessage[]
  compactionCount: number
  turnId: string
  terms: Record<string, RuntimeTerm>
  termOrder: string[]
  turnState: AgentTurnStatus
}

type PendingApproval = {
  chatId: string
  turnId: string
  callId: string
  tool: string
  reason?: string
  command?: string
  cwd?: string
  details?: unknown
  resolve: (approved: boolean) => void
  timer: ReturnType<typeof setTimeout>
}

type PendingUserInput = {
  chatId: string
  turnId: string
  callId: string
  resolve: (answers: Record<string, { answers: string[] }> | null) => void
  timer: ReturnType<typeof setTimeout>
  questions: AgentUserInputQuestion[]
}

const rootFromEnv0 = process.env.OPERATOR_RUNTIME_ROOT ?? ""
const rootFromEnv = rootFromEnv0.trim()
const root = rootFromEnv || path.resolve(import.meta.dir, "../../..")
const dataDirFromEnv0 = process.env.OPERATOR_DATA_DIR ?? ""
const dataDirFromEnv = dataDirFromEnv0.trim()
const OPERATOR_DATA_DIR = dataDirFromEnv || path.join(root, "data")
const OPERATOR_SESSION_DIR = path.join(OPERATOR_DATA_DIR, "sessions")
const DEEPSEEK_MODEL = (process.env.DEEPSEEK_MODEL || "deepseek-chat").trim() || "deepseek-chat"
const DEEPSEEK_VERIFIER_MODEL = "deepseek-chat"
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").trim() || "https://api.deepseek.com"
const DEEPSEEK_API_KEY =
  (process.env.DEEPSEEK_API_KEY || process.env.OPERATOR_DEEPSEEK_API_KEY || process.env.DEEPSEEK_KEY || "").trim()
const CONTEXT_WINDOW = Number.parseInt((process.env.DEEPSEEK_CONTEXT_WINDOW || `${DEFAULT_CONTEXT_WINDOW}`).trim(), 10) || DEFAULT_CONTEXT_WINDOW
const AUTO_COMPACT_LIMIT =
  Number.parseInt((process.env.DEEPSEEK_AUTO_COMPACT_TOKEN_LIMIT || "").trim(), 10) || Math.floor(CONTEXT_WINDOW * 0.9)
const turnTimeoutEnv = (process.env.OPERATOR_TURN_TIMEOUT_MS || "").trim()
const turnTimeoutRaw = Number.parseInt(turnTimeoutEnv, 10)
const TURN_TIMEOUT_MS = Number.isFinite(turnTimeoutRaw) ? Math.max(0, turnTimeoutRaw) : 0
const autoVerifyRaw = (process.env.OPERATOR_AUTO_VERIFY_LOCAL_CLAIMS || "").trim()
const autoVerifyText = autoVerifyRaw.toLowerCase()
const AUTO_VERIFY_LOCAL_CLAIMS =
  autoVerifyText !== "0" && autoVerifyText !== "false" && autoVerifyText !== "off" && autoVerifyText !== "no"
const autoVerifyMaxRaw = Number.parseInt((process.env.OPERATOR_AUTO_VERIFY_MAX_PROBES || "").trim(), 10)
const AUTO_VERIFY_MAX_PROBES = Number.isFinite(autoVerifyMaxRaw) ? Math.max(0, Math.min(12, autoVerifyMaxRaw)) : 2
const autoVerifyTimeoutRaw = Number.parseInt((process.env.OPERATOR_AUTO_VERIFY_TIMEOUT_MS || "").trim(), 10)
const AUTO_VERIFY_TIMEOUT_MS = Number.isFinite(autoVerifyTimeoutRaw) ? Math.max(1000, Math.min(30000, autoVerifyTimeoutRaw)) : 6000
const truthAuditTimeoutRaw = Number.parseInt((process.env.OPERATOR_TRUTH_AUDIT_TIMEOUT_MS || "").trim(), 10)
const TRUTH_AUDIT_TIMEOUT_MS = Number.isFinite(truthAuditTimeoutRaw) ? Math.max(1000, Math.min(60000, truthAuditTimeoutRaw)) : 8000
const reasoningTimeoutRaw = Number.parseInt((process.env.OPERATOR_REASONING_TIMEOUT_MS || "").trim(), 10)
const REASONING_TIMEOUT_MS = Number.isFinite(reasoningTimeoutRaw) ? Math.max(0, Math.min(180000, reasoningTimeoutRaw)) : 0
const autoProjectTestRaw = (process.env.OPERATOR_AUTO_PROJECT_TEST || "").trim().toLowerCase()
const AUTO_PROJECT_TEST =
  autoProjectTestRaw !== "0" &&
  autoProjectTestRaw !== "false" &&
  autoProjectTestRaw !== "off" &&
  autoProjectTestRaw !== "no"
const approvalTimeoutRaw = Number.parseInt((process.env.OPERATOR_APPROVAL_TIMEOUT_MS || "").trim(), 10)
const APPROVAL_TIMEOUT_MS = Number.isFinite(approvalTimeoutRaw) ? Math.max(1000, Math.min(3600000, approvalTimeoutRaw)) : 600000
const userInputTimeoutRaw = Number.parseInt((process.env.OPERATOR_USER_INPUT_TIMEOUT_MS || "").trim(), 10)
const USER_INPUT_TIMEOUT_MS = Number.isFinite(userInputTimeoutRaw) ? Math.max(1000, Math.min(3600000, userInputTimeoutRaw)) : 600000

const basePromptPath = path.join(root, "agents", "templates", "orchestrator.md")
const collabPath = path.join(root, "agents", "templates", "collaboration_mode", "default.md")
const requestUserInputUnavailable =
  "The `request_user_input` tool is unavailable in Default mode. If a decision is necessary and cannot be discovered from local context, ask the user directly. However, in Default mode you should strongly prefer executing the user's request rather than stopping to ask questions."
const strictOutputQualityRules = [
  "When generating runnable code, output must execute as-is without manual fixes.",
  "For React + TypeScript code, avoid unused imports (for example, do not import React if it is not referenced).",
  "Generated build steps must pass strict TypeScript checks in modern Vite/React toolchains.",
].join("\n")
const mcpSearchRules = [
  "For web lookup, research, or current-info requests, use terminal_exec with mcp-search as the first lookup action.",
  "Do not use curl/wget/http/httpie for initial web search or discovery when mcp-search is available.",
  "Use mcp-search --provider auto --max 6 for general research, --provider ddg for current/news lookups, --provider ctx7 for docs/library lookups, and --provider yt --max 5 for YouTube-specific lookups.",
].join("\n")
const resilienceRules = [
  "Operate as a persistent problem solver: when a command or tool fails, diagnose the error, apply a fix, and retry.",
  "Do not stop after the first failure unless blocked by permissions, missing secrets, an unavailable runtime, or an explicit user stop.",
  "For stale terminal errors like Unknown process_id/Unknown process, recover by calling session_ensure, starting a new interactive shell with terminal_exec (tty=true), and then continuing the task.",
].join("\n")
const truthfulnessRules = TRUTHFULNESS_POLICY_RUNTIME_MESSAGE

const sessions = new Map<string, RuntimeSession>()
const inflight = new Map<string, AbortController>()
const pendingApprovals = new Map<string, PendingApproval>()
const pendingUserInputs = new Map<string, PendingUserInput>()
const rolloutSteps = new Map<string, number>()
var basePromptCache = ""
var collabCache = ""
var agentsCache = ""
var agentsCacheRoot = ""

const nowId = () => {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 10)
  return `${t}-${r}`
}

const sessionTag = (raw: string) => {
  const t0 = typeof raw === "string" ? raw : ""
  const t1 = t0.trim().replace(/[^a-zA-Z0-9_.-]+/g, "_")
  const t = t1.trim()
  return t || "operator"
}

const nextRolloutStep = (chatId: string, turnId: string) => {
  const key = `${sessionTag(chatId)}:${sessionTag(turnId)}`
  const cur = rolloutSteps.get(key) ?? 0
  const next = cur + 1
  rolloutSteps.set(key, next)
  return next
}

const sessionStoreDir = (chatId: string) => {
  return path.join(OPERATOR_SESSION_DIR, sessionTag(chatId))
}

const rolloutPath = (chatId: string, turnId: string) => {
  const turn = sessionTag(turnId)
  return path.join(sessionStoreDir(chatId), `${turn}.jsonl`)
}

const snapshotPath = (chatId: string) => {
  return path.join(sessionStoreDir(chatId), "snapshot.json")
}

const safeJson = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

const ensureDir = async (dir: string) => {
  await mkdir(dir, { recursive: true }).catch(() => {})
}

const appendRollout = async (input: {
  chatId: string
  sessionId: string
  turnId: string
  step?: number
  callId?: string
  type: string
  payload: unknown
  requestId?: string
}) => {
  const chatId = sessionTag(input.chatId)
  const turnId = sessionTag(input.turnId)
  const dir = sessionStoreDir(chatId)
  await ensureDir(dir)
  const fp = rolloutPath(chatId, turnId)
  const row = {
    ts: new Date().toISOString(),
    chat_id: chatId,
    session_id: sessionTag(input.sessionId || chatId),
    turn_id: turnId,
    step: typeof input.step === "number" ? input.step : undefined,
    call_id: typeof input.callId === "string" ? input.callId : undefined,
    type: input.type,
    payload: input.payload,
    requestId: typeof input.requestId === "string" ? input.requestId : undefined,
  }
  await appendFile(fp, `${JSON.stringify(row)}\n`).catch(() => {})
}

const persistSnapshot = async (state: RuntimeSession) => {
  const dir = sessionStoreDir(state.chatId)
  await ensureDir(dir)

  const terms: RuntimeTerm[] = []

  for (var i = 0; i < state.termOrder.length; i++) {
    const key = state.termOrder[i] ?? ""
    const row = state.terms[key]

    if (!row) {
      continue
    }

    terms.push(row)
  }

  const data = {
    ts: new Date().toISOString(),
    chat_id: state.chatId,
    session_id: state.sessionId,
    mode: state.mode,
    approval_policy: state.approvalPolicy || undefined,
    sandbox_mode: state.sandboxMode || undefined,
    messages: state.messages,
    latest_summary: state.latestSummary,
    preserved_users: state.preservedUsers,
    compaction_count: state.compactionCount,
    turn_id: state.turnId || undefined,
    turn_state: state.turnState,
    terms,
  }

  await Bun.write(snapshotPath(state.chatId), JSON.stringify(data, null, 2)).catch(() => {})
}

const hydrateSnapshotInto = (state: RuntimeSession, raw: unknown) => {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null

  if (!row) {
    return
  }

  const messages0 = Array.isArray(row.messages) ? row.messages : []
  const messages: AgentChatMessage[] = []

  for (var i = 0; i < messages0.length; i++) {
    const item = messages0[i]
    const msg = item && typeof item === "object" ? (item as { role?: unknown; content?: unknown } | null) : null
    const role0 = typeof msg?.role === "string" ? msg.role : ""
    const role = role0 === "system" || role0 === "user" || role0 === "assistant" || role0 === "tool" ? role0 : ""
    const content0 = typeof msg?.content === "string" ? msg.content : ""

    if (!role) {
      continue
    }

    messages.push({ role, content: content0 })
  }

  const latest0 = typeof row.latest_summary === "string" ? row.latest_summary : ""
  const preserved0 = Array.isArray(row.preserved_users) ? row.preserved_users : []
  const preserved: AgentChatMessage[] = []

  for (var i = 0; i < preserved0.length; i++) {
    const item = preserved0[i]
    const msg = item && typeof item === "object" ? (item as { role?: unknown; content?: unknown } | null) : null
    const role0 = typeof msg?.role === "string" ? msg.role : ""
    const role = role0 === "system" || role0 === "user" || role0 === "assistant" || role0 === "tool" ? role0 : ""
    const content0 = typeof msg?.content === "string" ? msg.content : ""

    if (!role) {
      continue
    }

    preserved.push({ role, content: content0 })
  }

  const comp0 = typeof row.compaction_count === "number" ? row.compaction_count : Number.parseInt(`${row.compaction_count ?? 0}`, 10)
  const compactionCount = Number.isFinite(comp0) ? Math.max(0, Math.floor(comp0)) : 0
  const turn0 = typeof row.turn_id === "string" ? row.turn_id : ""
  const turnId = turn0.trim()
  const turnState0 = typeof row.turn_state === "string" ? row.turn_state : ""
  const turnState =
    turnState0 === "running" ||
    turnState0 === "waiting_approval" ||
    turnState0 === "waiting_user_input" ||
    turnState0 === "completed" ||
    turnState0 === "interrupted" ||
    turnState0 === "failed"
      ? turnState0
      : "completed"

  const ap0 = typeof row.approval_policy === "string" ? row.approval_policy : ""
  const sb0 = typeof row.sandbox_mode === "string" ? row.sandbox_mode : ""

  const terms0 = Array.isArray(row.terms) ? row.terms : []
  const nextTerms: Record<string, RuntimeTerm> = {}
  const nextOrder: string[] = []

  for (var i = 0; i < terms0.length; i++) {
    const item = terms0[i]
    const t = item && typeof item === "object" ? (item as Record<string, unknown>) : null

    if (!t) {
      continue
    }

    const id0 = typeof t.id === "string" ? t.id : ""
    const id = id0.trim()
    const tool0 = typeof t.tool === "string" ? t.tool : ""
    const tool = tool0.trim()

    if (!id || !tool) {
      continue
    }

    const input = typeof t.input === "string" ? t.input : ""
    const output = typeof t.output === "string" ? t.output : ""
    const status0 = typeof t.status === "string" ? t.status : ""
    const status = status0 === "running" || status0 === "done" || status0 === "failed" ? status0 : "done"

    nextTerms[id] = { id, tool, input, output, status }
    nextOrder.push(id)
  }

  state.messages = messages
  state.latestSummary = latest0.trim()
  state.preservedUsers = preserved
  state.compactionCount = compactionCount
  state.turnId = turnId
  state.turnState = turnState as AgentTurnStatus
  state.terms = nextTerms
  state.termOrder = nextOrder

  if (ap0.trim()) {
    state.approvalPolicy = ap0.trim()
  }

  if (sb0.trim()) {
    state.sandboxMode = sb0.trim()
  }
}

const hydrateSession = async (state: RuntimeSession) => {
  if (state.hydrated) {
    return
  }

  const existing = state.hydrating

  if (existing) {
    await existing
    return
  }

  const task = Bun.file(snapshotPath(state.chatId))
    .text()
    .catch(() => "")
    .then((text) => {
      const raw = safeJson(text)

      if (!raw) {
        return
      }

      hydrateSnapshotInto(state, raw)
    })
    .finally(() => {
      state.hydrated = true
      state.hydrating = null
    })

  state.hydrating = task
  await task
}

const normalizeUtterance = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text1 = text0.toLowerCase().replace(/[^a-z0-9\s]/g, " ")
  const text2 = text1.replace(/\s+/g, " ")
  return text2.trim()
}

const directTimeFor = (raw: string) => {
  const text = normalizeUtterance(raw)

  if (!text) {
    return ""
  }

  var body = text
  const prefixes = ["hi ", "hello ", "hey ", "yo ", "hiya ", "heya "]

  for (var i = 0; i < prefixes.length; i++) {
    const prefix = prefixes[i] ?? ""

    if (!prefix) {
      continue
    }

    if (!body.startsWith(prefix)) {
      continue
    }

    body = body.slice(prefix.length).trim()
    break
  }

  const asksTime =
    body.includes("what time") ||
    body.includes("whats the time") ||
    body.includes("what s the time") ||
    body.includes("time is it") ||
    body.includes("current time") ||
    body.includes("local time") ||
    body === "time" ||
    body === "the time"

  if (!asksTime) {
    return ""
  }

  if (/\b(?:in|at|for)\s+[a-z0-9]/.test(body)) {
    return ""
  }

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })
  const stamp = fmt.format(new Date()).replace(" at ", ", ")
  return `The current time is ${stamp} UTC.`
}

const fallbackFromTerms = (state: RuntimeSession, timeoutMs: number) => {
  const latest = latestCompletedTermOutput(state.termOrder, state.terms, 1600)

  if (!latest) {
    return ""
  }

  return `Reasoning timed out after ${timeoutMs}ms. Returning latest command output:\n${latest}`
}

const hasUnknownProcessError = (raw: unknown) => {
  const row = raw && typeof raw === "object"
    ? (raw as { errorCode?: unknown; error?: unknown; output?: unknown } | null)
    : null
  const code0 = typeof row?.errorCode === "string" ? row.errorCode : ""
  const code = code0.trim().toUpperCase()

  if (code === "UNKNOWN_PROCESS_ID") {
    return true
  }

  const err0 = typeof row?.error === "string" ? row.error : ""
  const err = err0.trim().toLowerCase()

  if (err.includes("unknown process_id") || err.includes("unknown process")) {
    return true
  }

  const out0 = typeof row?.output === "string" ? row.output : ""
  const out = out0.trim().toLowerCase()

  if (out.includes("unknown process_id") || out.includes("unknown process")) {
    return true
  }

  return false
}

const ensureTerm = (state: RuntimeSession, id: string) => {
  const id0 = typeof id === "string" ? id : ""
  const key = id0.trim()

  if (!key) {
    return null
  }

  const existing = state.terms[key]

  if (existing) {
    return existing
  }

  const created: RuntimeTerm = {
    id: key,
    tool: "terminal",
    input: "",
    output: "running...",
    status: "running",
  }
  state.terms[key] = created
  state.termOrder.push(key)
  return created
}

const safeParse = (raw: string) => {
  const text = typeof raw === "string" ? raw : ""
  const trimmed = text.trim()

  if (!trimmed) {
    return null
  }

  var parsed: unknown = null

  try {
    parsed = JSON.parse(trimmed) as unknown
  } catch {
    return null
  }

  const out = decodeRuntimeEnvelope(parsed)

  if (out.success) {
    return out.data
  }

  const row = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
  const kind0 = typeof row?.kind === "string" ? row.kind : ""
  const kind = kind0.trim()

  if (kind !== "request") {
    return null
  }

  const id0 = typeof row?.id === "string" ? row.id : ""
  const id = id0.trim()
  const method0 = typeof row?.method === "string" ? row.method : ""
  const method = method0.trim()
  const params = row?.params && typeof row.params === "object" ? row.params : {}

  if (!id || !method) {
    return null
  }

  return {
    ...makeRuntimeFrameBase({
      id,
      requestId: id,
      sessionId: "operator",
      role: "runtime-supervisor",
      channel: "runtime",
      method,
    }),
    version: "v1",
    kind: "request",
    method: method as RuntimeMethod,
    params: params as RuntimeRequest<RuntimeMethod>["params"],
  } as RuntimeEnvelope

}

const emit = (payload: RuntimeEnvelope) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

const heartbeat = () => {
  emit({
    ...makeRuntimeFrameBase({
      role: "exec-host",
      channel: "health",
      method: "heartbeat",
      sessionId: "operator",
    }),
    version: "v1",
    kind: "event",
    event: "heartbeat",
    chat_id: "operator",
    payload: {
      ok: true,
    },
  })
}

const event = (chatId: string, payload: AgentWsServerEvent) => {
  const state = sessions.get(chatId)
  const row = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null
  const turn0 = typeof row?.turn_id === "string" ? row.turn_id : ""
  const turn1 = turn0.trim()
  const stateTurn0 = typeof state?.turnId === "string" ? state.turnId : ""
  const stateTurn = stateTurn0.trim()
  const turnId = turn1 || stateTurn
  const call0 = typeof row?.call_id === "string" ? row.call_id : ""
  const callId = call0.trim()
  const requestId0 = callId || turnId
  const sessionId0 = typeof state?.sessionId === "string" ? state.sessionId : ""
  const sessionId = sessionId0.trim() || chatId
  const base = makeRuntimeFrameBase({
    requestId: requestId0 || undefined,
    role: "exec-host",
    channel: "runtime",
    method: `event:${payload.type}`,
    sessionId: chatId,
  })
  emit({
    ...base,
    version: "v1",
    kind: "event",
    event: payload.type,
    chat_id: chatId,
    payload,
  })

  if (turnId) {
    void appendRollout({
      chatId,
      sessionId,
      turnId,
      step: nextRolloutStep(chatId, turnId),
      callId: callId || undefined,
      type: payload.type,
      payload,
      requestId: base.requestId,
    })
  }
}

unifiedExecManager.onExit((row) => {
  event(row.chatId, {
    type: "exec_process_exit",
    chat_id: row.chatId,
    process_id: row.processId,
    exit_code: row.exitCode,
    output: row.output,
    wall_time_ms: row.wallTimeMs,
    final: true,
  })
})

unifiedExecManager.onPtyHealth((health) => {
  event("operator", {
    type: "runtime_host_health",
    chat_id: "operator",
    host_role: health.hostRole,
    state: health.state,
    heartbeat_lag_ms: health.heartbeatLagMs,
    restart_count: health.restartCount,
    restart_limit: health.restartLimit,
    reason: health.reason,
  })
})

const response = (request: RuntimeRequest, ok: boolean, result?: unknown, error?: string) => {
  const base = makeRuntimeFrameBase({
    id: request.id,
    requestId: request.requestId,
    sessionId: request.sessionId,
    role: "exec-host",
    channel: request.channel,
    method: request.method,
  })
  emit({
    ...base,
    version: "v1",
    kind: "response",
    ok,
    result,
    error,
  })
}

const setTurnState = (state: RuntimeSession, status: AgentTurnStatus, detail?: string) => {
  state.turnState = status
  const turn0 = typeof state.turnId === "string" ? state.turnId : ""
  const turnId = turn0.trim()

  if (!turnId) {
    return
  }

  event(state.chatId, {
    type: "turn_status",
    chat_id: state.chatId,
    turn_id: turnId,
    status,
    detail: detail && detail.trim() ? detail.trim() : undefined,
  })
  void persistSnapshot(state)
}

const clearPendingApproval = (key: string) => {
  const row = pendingApprovals.get(key)

  if (!row) {
    return
  }

  clearTimeout(row.timer)
  pendingApprovals.delete(key)
}

const clearPendingUserInput = (key: string) => {
  const row = pendingUserInputs.get(key)

  if (!row) {
    return
  }

  clearTimeout(row.timer)
  pendingUserInputs.delete(key)
}

const requestToolApproval = async (input: {
  state: RuntimeSession
  turnId: string
  callId: string
  tool: string
  reason?: string
  command?: string
  cwd?: string
  details?: unknown
  setTurnState?: boolean
}): Promise<{ approved: boolean; unavailable: boolean }> => {
  const state = input.state
  const turn0 = typeof input.turnId === "string" ? input.turnId : ""
  const turnId = turn0.trim()
  const call0 = typeof input.callId === "string" ? input.callId : ""
  const callId = call0.trim()

  if (!turnId || !callId) {
    return { approved: false, unavailable: true }
  }

  const tool0 = typeof input.tool === "string" ? input.tool : ""
  const tool = tool0.trim() || "tool"
  const key = `${state.chatId}:${callId}`
  clearPendingApproval(key)
  const note0 = typeof input.reason === "string" ? input.reason : ""
  const note = note0.trim()
  const command0 = typeof input.command === "string" ? input.command : ""
  const command = command0.trim()
  const cwd0 = typeof input.cwd === "string" ? input.cwd : ""
  const cwd = cwd0.trim()
  const details = typeof input.details === "undefined" ? undefined : input.details
  const wantsTurnState = input.setTurnState === true

  if (wantsTurnState) {
    setTurnState(state, "waiting_approval", note || "Awaiting tool approval")
  }

  event(state.chatId, {
    type: "tool_approval_requested",
    chat_id: state.chatId,
    turn_id: turnId,
    call_id: callId,
    tool,
    reason: note || undefined,
    command: command || undefined,
    cwd: cwd || undefined,
    details,
  })

  return new Promise<{ approved: boolean; unavailable: boolean }>((resolve) => {
    const timer = setTimeout(() => {
      clearPendingApproval(key)

      if (wantsTurnState) {
        setTurnState(state, "failed", "Tool approval timed out")
      }

      event(state.chatId, {
        type: "warning",
        chat_id: state.chatId,
        message: `Tool approval timed out for ${callId}`,
      })
      void appendRollout({
        chatId: state.chatId,
        sessionId: state.sessionId,
        turnId,
        step: nextRolloutStep(state.chatId, turnId),
        callId,
        type: "tool_approval_timeout",
        payload: { tool, call_id: callId, approved: false },
        requestId: callId,
      })
      resolve({ approved: false, unavailable: false })
    }, APPROVAL_TIMEOUT_MS)
    pendingApprovals.set(key, {
      chatId: state.chatId,
      turnId,
      callId,
      tool,
      reason: note || undefined,
      command: command || undefined,
      cwd: cwd || undefined,
      details,
      resolve: (approved) => {
        clearPendingApproval(key)
        const ctl = inflight.get(state.chatId)
        const active = wantsTurnState && !!ctl && !ctl.signal.aborted && state.turnId === turnId

        if (active) {
          setTurnState(state, "running")
        }

        void appendRollout({
          chatId: state.chatId,
          sessionId: state.sessionId,
          turnId,
          step: nextRolloutStep(state.chatId, turnId),
          callId,
          type: "tool_approval_resolved",
          payload: { tool, call_id: callId, approved },
          requestId: callId,
        })
        resolve({ approved, unavailable: false })
      },
      timer,
    })
  })
}

const clearPendingForChat = (chatId: string, kind: "interrupted" | "failed") => {
  const id0 = typeof chatId === "string" ? chatId : ""
  const id = id0.trim()

  if (!id) {
    return
  }

  const approvalKeys = Array.from(pendingApprovals.keys())

  for (var i = 0; i < approvalKeys.length; i++) {
    const key = approvalKeys[i] ?? ""
    const row = pendingApprovals.get(key)

    if (!row || row.chatId !== id) {
      continue
    }

    clearPendingApproval(key)
    row.resolve(false)
  }

  const inputKeys = Array.from(pendingUserInputs.keys())

  for (var i = 0; i < inputKeys.length; i++) {
    const key = inputKeys[i] ?? ""
    const row = pendingUserInputs.get(key)

    if (!row || row.chatId !== id) {
      continue
    }

    clearPendingUserInput(key)
    row.resolve(null)
  }

  const state = sessions.get(id)

  if (!state) {
    return
  }

  setTurnState(state, kind)
}

const hasPendingForChat = (chatId: string) => {
  const id0 = typeof chatId === "string" ? chatId : ""
  const id = id0.trim()

  if (!id) {
    return false
  }

  const approvalKeys = Array.from(pendingApprovals.keys())

  for (var i = 0; i < approvalKeys.length; i++) {
    const key = approvalKeys[i] ?? ""
    const row = pendingApprovals.get(key)

    if (!row || row.chatId !== id) {
      continue
    }

    return true
  }

  const inputKeys = Array.from(pendingUserInputs.keys())

  for (var i = 0; i < inputKeys.length; i++) {
    const key = inputKeys[i] ?? ""
    const row = pendingUserInputs.get(key)

    if (!row || row.chatId !== id) {
      continue
    }

    return true
  }

  return false
}

const readTextFile = async (fp: string) => {
  const file = Bun.file(fp)
  const ok = await file.exists()

  if (!ok) {
    return ""
  }

  const text0 = await file.text()
  const text = typeof text0 === "string" ? text0 : ""
  return text.trim()
}

const loadBasePrompt = async () => {
  if (basePromptCache) {
    return basePromptCache
  }

  const text = await readTextFile(basePromptPath)
  basePromptCache = text
  return basePromptCache
}

const loadCollaborationInstructions = async () => {
  const env0 = process.env.OPERATOR_COLLABORATION_MODE ?? ""
  const envText = env0.trim()

  if (envText && envText !== "Default") {
    return envText
  }

  if (collabCache) {
    return collabCache
  }

  const raw = await readTextFile(collabPath)
  const withModes = raw.replaceAll("{{KNOWN_MODE_NAMES}}", "Default and Plan")
  const withRequest = withModes.replaceAll("{{REQUEST_USER_INPUT_AVAILABILITY}}", requestUserInputUnavailable)
  collabCache = withRequest
  return collabCache
}

const loadAgentsInstructions = async () => {
  if (agentsCache && agentsCacheRoot === root) {
    return agentsCache
  }

  const text = await readAgentsInstructions(root)
  agentsCache = text
  agentsCacheRoot = root
  return agentsCache
}

const buildInstructions = async (state: RuntimeSession, allowTerminalExec: boolean) => {
  const base = await loadBasePrompt()
  const user = await loadAgentsInstructions()
  const developer0 = (process.env.OPERATOR_DEVELOPER_INSTRUCTIONS || "").trim()
  const quality0 = [strictOutputQualityRules, mcpSearchRules, resilienceRules].join("\n")
  const quality = developer0 ? `${developer0}\n\n${quality0}` : quality0
  const developer = `${quality}\n\n${truthfulnessRules}`
  const permissions = (process.env.OPERATOR_PERMISSIONS_INSTRUCTIONS || "").trim()
  const collaboration = await loadCollaborationInstructions()
  const environmentContext = JSON.stringify({
    cwd: root,
    chatId: state.chatId,
    sessionId: state.sessionId,
    mode: state.mode,
    allow_terminal_exec: allowTerminalExec,
  })
  return composeInstructionLayers({
    cwd: root,
    baseInstructions: base,
    developerInstructions: developer,
    collaborationInstructions: collaboration,
    userInstructions: user,
    permissionsText: permissions,
    environmentContext,
  })
}

const emitExecOutput = (chatId: string, turnId: string, callId: string, processId: string | undefined, raw: string) => {
  const chunks = chunkText(raw)

  for (var i = 0; i < chunks.length; i++) {
    const chunk = chunks[i] ?? ""

    if (!chunk) {
      continue
    }

    event(chatId, {
      type: "exec_command_output_delta",
      chat_id: chatId,
      turn_id: turnId,
      call_id: callId,
      process_id: processId,
      chunk,
    })
  }
}

const ensureSession = (chatId: string, mode: string, sessionId?: string) => {
  const id0 = typeof chatId === "string" ? chatId : ""
  const id = id0.trim() || "operator"
  const mode0 = typeof mode === "string" ? mode : ""
  const m = mode0.trim() || "chat"
  const session0 = typeof sessionId === "string" ? sessionId : ""
  const sid = session0.trim() || id
  const current = sessions.get(id)

  if (current) {
    current.mode = m
    current.sessionId = sid
    return current
  }

  const state: RuntimeSession = {
    chatId: id,
    sessionId: sid,
    mode: m,
    approvalPolicy: "",
    sandboxMode: "",
    hydrated: false,
    hydrating: null,
    messages: [],
    latestSummary: "",
    preservedUsers: [],
    compactionCount: 0,
    turnId: "",
    terms: {},
    termOrder: [],
    turnState: "completed",
  }
  sessions.set(id, state)
  return state
}

const handleCompactionTrace = (state: RuntimeSession, turnId: string, req: unknown) => {
  const row = req && typeof req === "object" ? (req as Record<string, unknown>) : null

  if (!row) {
    return
  }

  const type0 = typeof row.type === "string" ? row.type : ""
  const type = type0.trim()

  if (type !== "context_compacted") {
    return
  }

  const before = toNum(row.before_tokens) ?? 0
  const after = toNum(row.after_tokens) ?? 0
  const summary0 = typeof row.summary === "string" ? row.summary : ""
  const summary = summary0.trim()
  state.compactionCount += 1
  state.latestSummary = summary
  state.preservedUsers = latestUserMessages(state.messages, COMPACT_USER_MESSAGE_MAX_TOKENS)
  event(state.chatId, {
    type: "context_compacted",
    chat_id: state.chatId,
    before_tokens: before,
    after_tokens: after,
    summary,
  })
  event(state.chatId, {
    type: "token_count",
    chat_id: state.chatId,
    total_tokens: after,
    model_context_window: CONTEXT_WINDOW,
    auto_compact_limit: AUTO_COMPACT_LIMIT,
  })
}

const completeTurn = (state: RuntimeSession, turnId: string, text?: string, status?: AgentTurnStatus, detail?: string) => {
  const last0 = typeof text === "string" ? text : ""
  const last = last0.trim()
  const next = status || "completed"
  const detail0 = typeof detail === "string" ? detail : ""
  const note = detail0.trim()
  setTurnState(state, next, note)
  event(state.chatId, {
    type: "task_complete",
    chat_id: state.chatId,
    turn_id: turnId,
    last_agent_message: last || undefined,
    detail: note || undefined,
  })
  event(state.chatId, {
    type: "turn_complete",
    chat_id: state.chatId,
    turn_id: turnId,
    last_agent_message: last || undefined,
    detail: note || undefined,
  })
  void persistSnapshot(state)
}

const clearInflightTurn = (chatId: string, controller: AbortController) => {
  const current = inflight.get(chatId)

  if (current !== controller) {
    return
  }

  inflight.delete(chatId)
}

const runSubmitUserTurn = async (
  state: RuntimeSession,
  params: RuntimeSubmitUserTurnParams,
  turnId: string,
  itemId: string,
  controller: AbortController,
) => {
  var timedOut = false
  const timeoutMs = TURN_TIMEOUT_MS > 0 ? Math.max(30000, TURN_TIMEOUT_MS) : 0
  var timer: ReturnType<typeof setTimeout> | null = null

  if (timeoutMs) {
    timer = setTimeout(() => {
      timedOut = true

      if (!controller.signal.aborted) {
        controller.abort()
      }
    }, timeoutMs)
  }

  event(state.chatId, {
    type: "task_started",
    chat_id: state.chatId,
    model_context_window: CONTEXT_WINDOW,
  })
  event(state.chatId, {
    type: "turn_started",
    chat_id: state.chatId,
    turn_id: turnId,
    model_context_window: CONTEXT_WINDOW,
  })
  event(state.chatId, {
    type: "item_started",
    chat_id: state.chatId,
    turn_id: turnId,
    item: "agent_message",
    item_id: itemId,
  })
  const preTokens = estimateTokensFromMessages(state.messages)
  event(state.chatId, {
    type: "token_count",
    chat_id: state.chatId,
    total_tokens: preTokens,
    model_context_window: CONTEXT_WINDOW,
    auto_compact_limit: AUTO_COMPACT_LIMIT,
  })
  const userText = latestUserText(state.messages)
  const directTime = directTimeFor(userText)

  if (directTime) {
    if (timer) {
      clearTimeout(timer)
    }
    clearInflightTurn(state.chatId, controller)
    const chunks = chunkText(directTime)

    for (var i = 0; i < chunks.length; i++) {
      const delta = chunks[i] ?? ""

      if (!delta) {
        continue
      }

      event(state.chatId, {
        type: "agent_message_content_delta",
        chat_id: state.chatId,
        turn_id: turnId,
        item_id: itemId,
        delta,
      })
    }

    const nextMessage: AgentChatMessage = {
      role: "assistant",
      content: directTime,
    }
    state.messages = normalizeMessages(state.messages.concat([nextMessage]))
    const postTokens = estimateTokensFromMessages(state.messages)
    event(state.chatId, {
      type: "token_count",
      chat_id: state.chatId,
      total_tokens: postTokens,
      model_context_window: CONTEXT_WINDOW,
      auto_compact_limit: AUTO_COMPACT_LIMIT,
    })
    completeTurn(state, turnId, directTime)
    return
  }

  const env0 = typeof process.env.NODE_ENV === "string" ? process.env.NODE_ENV : ""
  const env = env0.trim().toLowerCase()
  const testMode = env === "test"
  const finish = (text: string) => {
    if (timer) {
      clearTimeout(timer)
    }

    clearInflightTurn(state.chatId, controller)
    const chunks = chunkText(text)

    for (var i = 0; i < chunks.length; i++) {
      const delta = chunks[i] ?? ""

      if (!delta) {
        continue
      }

      event(state.chatId, {
        type: "agent_message_content_delta",
        chat_id: state.chatId,
        turn_id: turnId,
        item_id: itemId,
        delta,
      })
    }

    const nextMessage: AgentChatMessage = {
      role: "assistant",
      content: text,
    }
    state.messages = normalizeMessages(state.messages.concat([nextMessage]))
    const postTokens = estimateTokensFromMessages(state.messages)
    event(state.chatId, {
      type: "token_count",
      chat_id: state.chatId,
      total_tokens: postTokens,
      model_context_window: CONTEXT_WINDOW,
      auto_compact_limit: AUTO_COMPACT_LIMIT,
    })
    completeTurn(state, turnId, text)
  }

  if (testMode && userText.toLowerCase().includes("test:approval-cmd")) {
    const callId = `test_cmd_${nowId()}`
    const command = "echo test"
    const evaluated = await evalExecPolicyForCommand({
      chatId: state.chatId,
      sessionId: state.sessionId,
      command,
      emit: (payload) => event(state.chatId, payload),
    })
    const term = ensureTerm(state, callId)
    const ap = approvalPolicyFrom(state.approvalPolicy)
    const wantsApproval = shouldPromptCommand(ap, evaluated.decision)

    if (evaluated.decision === "forbidden") {
      const d = evaluated.details as { justification?: unknown } | null
      const j0 = typeof d?.justification === "string" ? d.justification : ""
      const j = j0.trim()
      const fail = j ? `Command blocked by policy: ${j}` : "Command blocked by policy"

      if (term) {
        term.tool = "terminal_exec"
        term.input = command
        term.output = fail
        term.status = "failed"
      }

      event(state.chatId, {
        type: "exec_command_begin",
        chat_id: state.chatId,
        turn_id: turnId,
        call_id: callId,
        command,
        process_id: undefined,
        tool_name: "terminal_exec",
      })
      emitExecOutput(state.chatId, turnId, callId, undefined, fail)
      event(state.chatId, {
        type: "exec_command_end",
        chat_id: state.chatId,
        turn_id: turnId,
        call_id: callId,
        process_id: undefined,
        exit_code: 126,
        output: fail,
        wall_time_ms: 0,
      })
      finish(fail)
      return
    }

    if (wantsApproval) {
      const asked = await requestToolApproval({
        state,
        turnId,
        callId,
        tool: "terminal_exec",
        reason: "Command requested approval before execution.",
        command,
        cwd: ".",
        details: evaluated.details,
        setTurnState: true,
      })

      if (!asked.approved) {
        const msg = asked.unavailable ? "Approval required but unavailable" : "Tool call denied by user"

        if (term) {
          term.tool = "terminal_exec"
          term.input = command
          term.output = msg
          term.status = "failed"
        }

        event(state.chatId, {
          type: "exec_command_begin",
          chat_id: state.chatId,
          turn_id: turnId,
          call_id: callId,
          command,
          process_id: undefined,
          tool_name: "terminal_exec",
        })
        emitExecOutput(state.chatId, turnId, callId, undefined, msg)
        event(state.chatId, {
          type: "exec_command_end",
          chat_id: state.chatId,
          turn_id: turnId,
          call_id: callId,
          process_id: undefined,
          exit_code: 1,
          output: msg,
          wall_time_ms: 0,
        })
        finish(msg)
        return
      }
    }

    const outText = `Simulated exec ok: ${command}`

    if (term) {
      term.tool = "terminal_exec"
      term.input = command
      term.output = outText
      term.status = "done"
    }

    event(state.chatId, {
      type: "exec_command_begin",
      chat_id: state.chatId,
      turn_id: turnId,
      call_id: callId,
      command,
      process_id: undefined,
      tool_name: "terminal_exec",
    })
    emitExecOutput(state.chatId, turnId, callId, undefined, outText)
    event(state.chatId, {
      type: "exec_command_end",
      chat_id: state.chatId,
      turn_id: turnId,
      call_id: callId,
      process_id: undefined,
      exit_code: 0,
      output: outText,
      wall_time_ms: 0,
    })
    finish("Approval command flow completed.")
    return
  }

  if (testMode && userText.toLowerCase().includes("test:approval-fs")) {
    const callId = `test_fs_${nowId()}`
    const tool = "fs_delete"
    const paths = [".env"]
    const details = {
      kind: "mutation",
      tool,
      paths,
      sensitive_paths: true,
    }
    const asked = await requestToolApproval({
      state,
      turnId,
      callId,
      tool,
      reason: "Mutation requested approval before execution.",
      details,
      setTurnState: true,
    })
    const term = ensureTerm(state, callId)
    const cmd = `${tool} ${paths[0] ?? ""}`.trim()
    const ok = asked.approved
    const outText = ok ? `Simulated ${cmd}: ok` : asked.unavailable ? "Approval required but unavailable" : "Tool call denied by user"
    const code = ok ? 0 : 1

    if (term) {
      term.tool = tool
      term.input = cmd
      term.output = outText
      term.status = ok ? "done" : "failed"
    }

    event(state.chatId, {
      type: "exec_command_begin",
      chat_id: state.chatId,
      turn_id: turnId,
      call_id: callId,
      command: cmd,
      process_id: undefined,
      tool_name: tool,
    })
    emitExecOutput(state.chatId, turnId, callId, undefined, outText)
    event(state.chatId, {
      type: "exec_command_end",
      chat_id: state.chatId,
      turn_id: turnId,
      call_id: callId,
      process_id: undefined,
      exit_code: code,
      output: outText,
      wall_time_ms: 0,
    })
    finish("Approval file mutation flow completed.")
    return
  }

  if (testMode) {
    finish("Test mode: turn completed.")
    return
  }

  if (!DEEPSEEK_API_KEY) {
    if (timer) {
      clearTimeout(timer)
    }
    clearInflightTurn(state.chatId, controller)
    event(state.chatId, {
      type: "error",
      chat_id: state.chatId,
      message: "Missing DEEPSEEK_API_KEY",
    })
    completeTurn(state, turnId, "", "failed", "Missing DEEPSEEK_API_KEY")
    return
  }

  const instructions = await buildInstructions(state, params.allow_terminal_exec)
  const feed = withSystemInstructions(state.messages, instructions)
  const modelFeed = toModelMessages(feed)
  const toolEvidence: Array<{ id: string; detail: string }> = []
  const verifyMutation = async (input: { tool: string; sessionId: string }) => {
    if (!AUTO_PROJECT_TEST) {
      return
    }

    const sid0 = typeof input.sessionId === "string" ? input.sessionId : state.sessionId
    const sid1 = sid0.trim().replace(/[^a-zA-Z0-9_.-]+/g, "_")
    const sid = sid1 || state.sessionId
    const detected = await projectDetect({ root: sid })
    const row = detected && typeof detected === "object" ? (detected as { ok?: unknown; result?: unknown; error?: unknown } | null) : null

    if (!row || row.ok !== true) {
      return
    }

    const result = row.result && typeof row.result === "object" ? (row.result as Record<string, unknown>) : null
    const type0 = typeof result?.type === "string" ? result.type : ""
    const type = type0.trim()

    if (!type) {
      return
    }

    const callId = `auto-project-test-${nowId()}`
    const term = ensureTerm(state, callId)
    const inputText = `{"root":"${sid}","timeout_s":900,"auto":true}`

    if (term) {
      term.tool = "project_test"
      term.input = inputText
      term.output = "running..."
      term.status = "running"
    }

    event(state.chatId, {
      type: "exec_command_begin",
      chat_id: state.chatId,
      turn_id: turnId,
      call_id: callId,
      command: `project_test ${inputText}`,
      tool_name: "project_test",
    })

    const out = await projectTest({ root: sid, timeoutS: 900 })
    const ok = out && typeof out === "object" && (out as { ok?: unknown }).ok === true
    const outText0 = typeof out === "string" ? out : JSON.stringify(out ?? {})
    const outText1 = typeof outText0 === "string" ? outText0 : ""
    const outText = outText1.trim() ? outText1 : "done"

    if (term) {
      term.tool = "project_test"
      term.output = outText
      term.status = ok ? "done" : "failed"
    }

    emitExecOutput(state.chatId, turnId, callId, undefined, outText)
    event(state.chatId, {
      type: "exec_command_end",
      chat_id: state.chatId,
      turn_id: turnId,
      call_id: callId,
      exit_code: ok ? 0 : 1,
      output: outText,
    })

    if (ok) {
      event(state.chatId, {
        type: "warning",
        chat_id: state.chatId,
        message: `Auto project_test completed after ${input.tool}.`,
      })
      return
    }

    const err0 = out && typeof out === "object" ? (out as { error?: unknown }).error : ""
    const err1 = typeof err0 === "string" ? err0 : ""
    const err = err1.trim() || "project_test failed"
    event(state.chatId, {
      type: "warning",
      chat_id: state.chatId,
      message: `Auto project_test failed after ${input.tool}: ${err}`,
    })
  }
  const baseRunTool = params.allow_terminal_exec
    ? createToolRunner({
        state,
        turnId,
        nextId: nowId,
        ensureTerm: (id) => ensureTerm(state, id),
        emitEvent: (payload) => event(state.chatId, payload),
        requestApproval: async (input) => {
          const asked = await requestToolApproval({
            state,
            turnId,
            callId: input.callId,
            tool: input.tool,
            reason: input.reason,
            command: input.command,
            cwd: input.cwd,
            details: input.details,
            setTurnState: true,
          })
          return asked.approved
        },
        requestUserInput: async (input) => {
          const key = `${state.chatId}:${input.callId}`
          clearPendingUserInput(key)
          const timeoutMs = typeof input.timeoutMs === "number" && input.timeoutMs > 0 ? input.timeoutMs : USER_INPUT_TIMEOUT_MS
          setTurnState(state, "waiting_user_input", "Awaiting user input")
          event(state.chatId, {
            type: "request_user_input_requested",
            chat_id: state.chatId,
            turn_id: turnId,
            call_id: input.callId,
            timeout_ms: timeoutMs,
            questions: input.questions,
          })

          return new Promise<Record<string, { answers: string[] }> | null>((resolve) => {
            const timer = setTimeout(() => {
              clearPendingUserInput(key)
              setTurnState(state, "failed", "request_user_input timed out")
              event(state.chatId, {
                type: "warning",
                chat_id: state.chatId,
                message: `request_user_input timed out for ${input.callId}`,
              })
              resolve(null)
            }, timeoutMs)
            pendingUserInputs.set(key, {
              chatId: state.chatId,
              turnId,
              callId: input.callId,
              questions: input.questions,
              resolve: (answers) => {
                clearPendingUserInput(key)
                const ctl = inflight.get(state.chatId)
                const active = !!ctl && !ctl.signal.aborted && state.turnId === turnId

                if (active) {
                  setTurnState(state, "running")
                }
                resolve(answers)
              },
              timer,
            })
          })
        },
        verifyMutation,
      })
    : null
  const runTool: ToolRun | null = baseRunTool
    ? async (name, args, meta) => {
        const out = await baseRunTool(name, args, meta)
        const id0 = typeof meta?.id === "string" ? meta.id : ""
        const id = id0.trim()
        const note = summarizeToolEvidence(id, name, args, out)

        if (note) {
          toolEvidence.push(note)
        }

        return out
      }
    : null
  const tools = params.allow_terminal_exec ? toolDefinitions : []
  const client = createDeepSeek(DEEPSEEK_BASE_URL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL, {
    tools,
    runTool,
    trace: async (evt) => {
      handleCompactionTrace(state, turnId, evt.req)
    },
  })
  const reasoningTimeoutSignal = REASONING_TIMEOUT_MS > 0 ? AbortSignal.timeout(REASONING_TIMEOUT_MS) : null
  const reasoningSignal = reasoningTimeoutSignal ? AbortSignal.any([controller.signal, reasoningTimeoutSignal]) : controller.signal
  const out = await client
    .call(modelFeed, 0.2, undefined, reasoningSignal, {
      tool_choice: params.allow_terminal_exec ? "auto" : "none",
    })
    .catch(() => ({
      ok: false,
      error: "DeepSeek call failed",
      text: "",
    }))
  if (timer) {
    clearTimeout(timer)
  }
  clearInflightTurn(state.chatId, controller)
  const emitAssistantFallback = (text: string) => {
    const chunks = chunkText(text)

    for (var i = 0; i < chunks.length; i++) {
      const delta = chunks[i] ?? ""

      if (!delta) {
        continue
      }

      event(state.chatId, {
        type: "agent_message_content_delta",
        chat_id: state.chatId,
        turn_id: turnId,
        item_id: itemId,
        delta,
      })
    }

    const nextMessage: AgentChatMessage = {
      role: "assistant",
      content: text,
    }
    state.messages = normalizeMessages(state.messages.concat([nextMessage]))
    const postTokens = estimateTokensFromMessages(state.messages)
    event(state.chatId, {
      type: "token_count",
      chat_id: state.chatId,
      total_tokens: postTokens,
      model_context_window: CONTEXT_WINDOW,
      auto_compact_limit: AUTO_COMPACT_LIMIT,
    })
  }

  if (!out.ok) {
    const reasoningTimedOut = reasoningTimeoutSignal?.aborted === true && !controller.signal.aborted
    const aborted = controller.signal.aborted || reasoningTimeoutSignal?.aborted === true

    if (reasoningTimedOut) {
      event(state.chatId, {
        type: "warning",
        chat_id: state.chatId,
        message: `Reasoning timed out after ${REASONING_TIMEOUT_MS}ms; returned best-effort response.`,
      })
      const fromTerm = fallbackFromTerms(state, REASONING_TIMEOUT_MS)
      const fallback =
        fromTerm ||
        `Reasoning timed out after ${REASONING_TIMEOUT_MS}ms. I stopped thinking to avoid hanging the turn. Please retry or ask a narrower question.`
      emitAssistantFallback(fallback)
      completeTurn(state, turnId, fallback)
      return
    }

    if (aborted && timedOut) {
      event(state.chatId, {
        type: "error",
        chat_id: state.chatId,
        message: `Turn timed out after ${timeoutMs}ms`,
      })
      completeTurn(state, turnId, "", "failed", `Turn timed out after ${timeoutMs}ms`)
      return
    }

    if (aborted) {
      completeTurn(state, turnId, "", "interrupted", "Turn was interrupted before a final assistant message was produced.")
      return
    }

    const err0 = typeof out.error === "string" ? out.error : ""
    const err = err0.trim() || "DeepSeek request failed"
    event(state.chatId, {
      type: "error",
      chat_id: state.chatId,
      message: err,
    })
    completeTurn(state, turnId, "", "failed", err)
    return
  }

  const text0 = typeof out.text === "string" ? out.text : ""
  const text = text0.trim()

  if (!text) {
    const detail = "Model returned no assistant text."
    const fallback = buildNoTextCompletionFallback({
      status: "failed",
      detail,
      order: state.termOrder,
      terms: state.terms,
    })
    event(state.chatId, {
      type: "warning",
      chat_id: state.chatId,
      message: detail,
    })
    emitAssistantFallback(fallback)
    completeTurn(state, turnId, fallback, "failed", detail)
    return
  }

  var recentContext = recentConversation(state.messages, 10)

  if (AUTO_VERIFY_LOCAL_CLAIMS) {
    const verify = await runAutoVerification({
      userText,
      draftAnswer: text0,
      root,
      sessionId: state.sessionId,
      allowTerminalExec: params.allow_terminal_exec,
      maxProbes: AUTO_VERIFY_MAX_PROBES,
      timeoutMs: AUTO_VERIFY_TIMEOUT_MS,
      signal: controller.signal,
    })

    for (var i = 0; i < verify.toolEvidence.length; i++) {
      const row = verify.toolEvidence[i]

      if (!row) {
        continue
      }

      toolEvidence.push(row)
    }

    const summary0 = typeof verify.summary === "string" ? verify.summary : ""
    const summary = summary0.trim()

    if (summary) {
      const tail = recentContext.slice(Math.max(0, recentContext.length - 9))
      const id = `message:auto_verify_${turnId}`
      recentContext = tail.concat([{ id, text: `assistant: ${summary}` }])
    }
  }

  const verifierClient = createDeepSeek(DEEPSEEK_BASE_URL, DEEPSEEK_API_KEY, DEEPSEEK_VERIFIER_MODEL)
  const verifierFallbackClient = createDeepSeek(DEEPSEEK_BASE_URL, DEEPSEEK_API_KEY, DEEPSEEK_VERIFIER_MODEL)
  const rewriteTemp = 0.0
  const verifierPrimaryCall: TruthModelCall = (messages, _temp, max, signal, opt) =>
    verifierClient.call(messages, undefined, max, signal, opt)
  const verifierFallbackCall: TruthModelCall = (messages, _temp, max, signal, opt) =>
    verifierFallbackClient.call(messages, undefined, max, signal, opt)
  const verifierRewriteCall: TruthModelCall = (messages, _temp, max, signal, opt) =>
    verifierFallbackClient.call(messages, rewriteTemp, max, signal, opt)
  const auditTimeoutSignal = AbortSignal.timeout(TRUTH_AUDIT_TIMEOUT_MS)
  const auditSignal = AbortSignal.any([controller.signal, auditTimeoutSignal])
  const audited = await enforceTruthfulnessAudit(
    {
      userText,
      draftAnswer: text0,
      recentContext,
      toolEvidence,
    },
    {
      primaryCall: verifierPrimaryCall,
      fallbackCall: verifierFallbackCall,
      rewriteCall: verifierRewriteCall,
      signal: auditSignal,
    },
  )

  if (auditTimeoutSignal.aborted && !controller.signal.aborted) {
    event(state.chatId, {
      type: "warning",
      chat_id: state.chatId,
      message: `Truthfulness audit timed out after ${TRUTH_AUDIT_TIMEOUT_MS}ms; returned best-effort answer.`,
    })
  }

  const finalTextRaw = typeof audited.answer === "string" ? audited.answer : text0
  const finalText0 = enforceNoMirroringOutput(finalTextRaw)
  const finalText = finalText0.trim()

  if (!finalText) {
    const detail = "Post-audit answer was empty."
    const fallback = buildNoTextCompletionFallback({
      status: "failed",
      detail,
      order: state.termOrder,
      terms: state.terms,
    })
    event(state.chatId, {
      type: "warning",
      chat_id: state.chatId,
      message: detail,
    })
    emitAssistantFallback(fallback)
    completeTurn(state, turnId, fallback, "failed", detail)
    return
  }

  const chunks = chunkText(finalText0)

  for (var i = 0; i < chunks.length; i++) {
    const delta = chunks[i] ?? ""

    if (!delta) {
      continue
    }

    event(state.chatId, {
      type: "agent_message_content_delta",
      chat_id: state.chatId,
      turn_id: turnId,
      item_id: itemId,
      delta,
    })
  }

  const nextMessage: AgentChatMessage = {
    role: "assistant",
    content: finalText0,
  }
  state.messages = normalizeMessages(state.messages.concat([nextMessage]))
  const postTokens = estimateTokensFromMessages(state.messages)
  event(state.chatId, {
    type: "token_count",
    chat_id: state.chatId,
    total_tokens: postTokens,
    model_context_window: CONTEXT_WINDOW,
    auto_compact_limit: AUTO_COMPACT_LIMIT,
  })
  completeTurn(state, turnId, finalText0)
}

const handleSubmitUserTurn = async (params: RuntimeSubmitUserTurnParams) => {
  const state = ensureSession(params.chat_id, params.mode, params.session_id)
  await hydrateSession(state)
  const ap0 = typeof params.approval_policy === "string" ? params.approval_policy : ""
  const sb0 = typeof params.sandbox_mode === "string" ? params.sandbox_mode : ""

  if (ap0.trim()) {
    state.approvalPolicy = ap0.trim()
  }

  if (sb0.trim()) {
    state.sandboxMode = sb0.trim()
  }

  const existing = inflight.get(state.chatId)

  if (existing) {
    existing.abort()
    inflight.delete(state.chatId)
    clearPendingForChat(state.chatId, "interrupted")
    event(state.chatId, {
      type: "warning",
      chat_id: state.chatId,
      message: "Previous in-flight turn was interrupted by a new submit_user_turn request.",
    })
  }

  if (!existing && hasPendingForChat(state.chatId)) {
    clearPendingForChat(state.chatId, "interrupted")
  }

  state.messages = normalizeMessages(params.messages)
  const turnId = nowId()
  state.turnId = turnId
  setTurnState(state, "running")
  state.terms = {}
  state.termOrder = []
  const itemId = nowId()
  const controller = new AbortController()
  inflight.set(state.chatId, controller)
  void runSubmitUserTurn(state, params, turnId, itemId, controller)
  return {
    ok: true,
    chat_id: state.chatId,
    session_id: state.sessionId,
    turn_id: turnId,
    accepted: true,
  }
}

const handleWriteStdin = async (params: RuntimeWriteStdinParams) => {
  const state = ensureSession(params.chat_id, "chat")
  await hydrateSession(state)
  const turnId = nowId()
  const callId = nowId()
  const chars0 = typeof params.chars === "string" ? params.chars : ""
  const chars = chars0
  const ap = approvalPolicyFrom(state.approvalPolicy)
  const gate = await gateTerminalSend({
    chatId: state.chatId,
    sessionId: state.sessionId,
    chars,
    approvalPolicy: ap,
    emit: (payload) => event(state.chatId, payload),
  })
  const term = ensureTerm(state, callId)

  if (gate.decision === "forbidden") {
    const fail = gate.reason || "Policy forbids this terminal_send request"

    if (term) {
      term.tool = "terminal_send"
      term.input = chars
      term.output = fail
      term.status = "failed"
    }

    emitExecOutput(state.chatId, turnId, callId, params.process_id, fail)
    event(state.chatId, {
      type: "exec_command_end",
      chat_id: state.chatId,
      turn_id: turnId,
      call_id: callId,
      process_id: params.process_id,
      exit_code: 126,
      output: fail,
      wall_time_ms: 0,
    })
    return {
      ok: true,
      process_id: params.process_id,
      output: fail,
      exit_code: 126,
      wall_time_ms: 0,
      running: false,
      backgrounded: false,
      background_reason: undefined,
      errorCode: gate.errorCode || "POLICY_FORBIDDEN",
      details: gate.details,
    }
  }

  const wantsApproval = shouldPromptCommand(ap, gate.decision)

  if (wantsApproval) {
    const d = gate.details as { line?: unknown } | null
    const line0 = typeof d?.line === "string" ? d.line : ""
    const line = line0.trim()
    const asked = await requestToolApproval({
      state,
      turnId,
      callId,
      tool: "terminal_send",
      reason: gate.reason || "terminal_send requested approval before execution.",
      command: line || undefined,
      details: gate.details,
      setTurnState: false,
    })

    if (!asked.approved) {
      const msg = asked.unavailable ? "Approval required but unavailable" : "Tool call denied by user"

      if (term) {
        term.tool = "terminal_send"
        term.input = chars
        term.output = msg
        term.status = "failed"
      }

      emitExecOutput(state.chatId, turnId, callId, params.process_id, msg)
      event(state.chatId, {
        type: "exec_command_end",
        chat_id: state.chatId,
        turn_id: turnId,
        call_id: callId,
        process_id: params.process_id,
        exit_code: 1,
        output: msg,
        wall_time_ms: 0,
      })
      return {
        ok: true,
        process_id: params.process_id,
        output: msg,
        exit_code: 1,
        wall_time_ms: 0,
        running: false,
        backgrounded: false,
        background_reason: undefined,
        errorCode: asked.unavailable ? "APPROVAL_REQUIRED" : "APPROVAL_DENIED",
        details: gate.details,
      }
    }
  }

  if (term) {
    term.tool = "terminal_send"
    term.input = `${term.input}${chars}`
    term.output = "running..."
    term.status = "running"
  }

  event(state.chatId, {
    type: "terminal_interaction",
    chat_id: state.chatId,
    turn_id: turnId,
    call_id: callId,
    process_id: params.process_id,
    stdin: chars,
  })
  var out = await runWriteStdin({
    processId: params.process_id,
    chars,
    yieldTimeMs: params.yield_time_ms,
    maxChars: params.max_output_tokens,
    requestId: callId,
  })
  var usedProcessId = out.processId || params.process_id

  if (hasUnknownProcessError(out)) {
    event(state.chatId, {
      type: "warning",
      chat_id: state.chatId,
      message: `Stale process_id ${params.process_id} detected; attempting terminal recovery.`,
    })
    const recovered = await runExecCommand({
      sessionId: state.sessionId,
      command: "pwd",
      workdir: ".",
      timeoutMs: params.yield_time_ms,
      maxChars: params.max_output_tokens,
      tty: true,
      requestId: callId,
    })
    const recoveredId0 = typeof recovered.processId === "string" ? recovered.processId : ""
    const recoveredId = recoveredId0.trim()

    if (!recoveredId) {
      const failText = `Unknown process_id: ${params.process_id}. Automatic recovery failed to start a new interactive shell.`

      if (term) {
        term.output = failText
        term.status = "failed"
      }

      emitExecOutput(state.chatId, turnId, callId, params.process_id, failText)
      event(state.chatId, {
        type: "exec_command_end",
        chat_id: state.chatId,
        turn_id: turnId,
        call_id: callId,
        process_id: params.process_id,
        exit_code: -1,
        output: failText,
        wall_time_ms: out.wallTimeMs,
      })
      return {
        ok: true,
        process_id: params.process_id,
        output: failText,
        exit_code: -1,
        wall_time_ms: out.wallTimeMs,
      }
    }

    const replay = await runWriteStdin({
      processId: recoveredId,
      chars,
      yieldTimeMs: params.yield_time_ms,
      maxChars: params.max_output_tokens,
      requestId: callId,
    })
    const replayText0 = typeof replay.output === "string" ? replay.output : ""
    const replayText1 = replayText0.trim()
    const replayHead = `Recovered stale process_id ${params.process_id} by starting ${recoveredId}.`
    const replayText = replayText1 ? `${replayHead}\n${replayText0}` : replayHead
    out = { ...replay, output: replayText }
    usedProcessId = recoveredId
  }

  if (term) {
    term.output = out.output
    const stillRunning = typeof out.exitCode !== "number" && !!(usedProcessId && usedProcessId.trim())
    term.status = stillRunning ? "running" : typeof out.exitCode === "number" && out.exitCode !== 0 ? "failed" : "done"
  }

  emitExecOutput(state.chatId, turnId, callId, usedProcessId, out.output)
  event(state.chatId, {
    type: "exec_command_end",
    chat_id: state.chatId,
    turn_id: turnId,
    call_id: callId,
    process_id: usedProcessId,
    exit_code: out.exitCode,
    output: out.output,
    wall_time_ms: out.wallTimeMs,
  })
  return {
    ok: true,
    process_id: usedProcessId,
    output: out.output,
    exit_code: out.exitCode,
    wall_time_ms: out.wallTimeMs,
    running: typeof out.exitCode !== "number" && !!(usedProcessId && usedProcessId.trim()),
    backgrounded: out.backgrounded === true,
    background_reason: out.background_reason,
  }
}

const handleExecCommand = async (params: RuntimeExecCommandParams) => {
  const state = ensureSession(params.chat_id, "chat")
  await hydrateSession(state)
  const turnId = nowId()
  const callId0 = typeof params.call_id === "string" ? params.call_id : ""
  const callId = callId0.trim() || nowId()
  const processId0 = typeof params.process_id === "string" ? params.process_id : ""
  const processId = processId0.trim() || undefined
  const workdir0 = typeof params.workdir === "string" ? params.workdir : ""
  const workdir = workdir0.trim() || "."
  const command0 = typeof params.command === "string" ? params.command : ""
  const command = command0.trim()

  if (!command) {
    return { ok: false, error: "Missing command" }
  }

  const ap = approvalPolicyFrom(state.approvalPolicy)
  const evaluated = await evalExecPolicyForCommand({
    chatId: state.chatId,
    sessionId: state.sessionId,
    command,
    emit: (payload) => event(state.chatId, payload),
  })

  if (evaluated.decision === "forbidden") {
    const d = evaluated.details as { justification?: unknown } | null
    const j0 = typeof d?.justification === "string" ? d.justification : ""
    const j = j0.trim()
    const fail = j ? `Command blocked by policy: ${j}` : "Command blocked by policy"
    const term = ensureTerm(state, callId)

    if (term) {
      term.tool = "terminal_exec"
      term.input = command
      term.output = fail
      term.status = "failed"
    }

    event(state.chatId, {
      type: "exec_command_begin",
      chat_id: state.chatId,
      turn_id: turnId,
      call_id: callId,
      process_id: processId,
      command,
    })
    emitExecOutput(state.chatId, turnId, callId, processId, fail)
    event(state.chatId, {
      type: "exec_command_end",
      chat_id: state.chatId,
      turn_id: turnId,
      call_id: callId,
      process_id: processId,
      exit_code: 126,
      output: fail,
      wall_time_ms: 0,
    })
    return {
      ok: true,
      process_id: processId,
      output: fail,
      exit_code: 126,
      wall_time_ms: 0,
      running: false,
      backgrounded: false,
      background_reason: undefined,
      errorCode: "POLICY_FORBIDDEN",
      details: evaluated.details,
    }
  }

  const wantsApproval = shouldPromptCommand(ap, evaluated.decision)

  if (wantsApproval) {
    const asked = await requestToolApproval({
      state,
      turnId,
      callId,
      tool: "terminal_exec",
      reason: "Command requested approval before execution.",
      command,
      cwd: workdir,
      details: evaluated.details,
      setTurnState: false,
    })

    if (!asked.approved) {
      const code = asked.unavailable ? "APPROVAL_REQUIRED" : "APPROVAL_DENIED"
      const msg = asked.unavailable ? "Approval required but unavailable" : "Tool call denied by user"
      const term = ensureTerm(state, callId)

      if (term) {
        term.tool = "terminal_exec"
        term.input = command
        term.output = msg
        term.status = "failed"
      }

      event(state.chatId, {
        type: "exec_command_begin",
        chat_id: state.chatId,
        turn_id: turnId,
        call_id: callId,
        process_id: processId,
        command,
      })
      emitExecOutput(state.chatId, turnId, callId, processId, msg)
      event(state.chatId, {
        type: "exec_command_end",
        chat_id: state.chatId,
        turn_id: turnId,
        call_id: callId,
        process_id: processId,
        exit_code: 1,
        output: msg,
        wall_time_ms: 0,
      })
      return {
        ok: true,
        process_id: processId,
        output: msg,
        exit_code: 1,
        wall_time_ms: 0,
        running: false,
        backgrounded: false,
        background_reason: undefined,
        errorCode: code,
        details: evaluated.details,
      }
    }
  }

  const term = ensureTerm(state, callId)

  if (term) {
    term.tool = "terminal_exec"
    term.input = command
    term.output = "running..."
    term.status = "running"
  }

  event(state.chatId, {
    type: "exec_command_begin",
    chat_id: state.chatId,
    turn_id: turnId,
    call_id: callId,
    process_id: processId,
    command,
  })

  const env0 = typeof process.env.NODE_ENV === "string" ? process.env.NODE_ENV : ""
  const env = env0.trim().toLowerCase()

  if (env === "test") {
    const text = `Simulated exec ok: ${command}`

    if (term) {
      term.output = text
      term.status = "done"
    }

    emitExecOutput(state.chatId, turnId, callId, processId, text)
    event(state.chatId, {
      type: "exec_command_end",
      chat_id: state.chatId,
      turn_id: turnId,
      call_id: callId,
      process_id: processId,
      exit_code: 0,
      output: text,
      wall_time_ms: 0,
    })
    return {
      ok: true,
      process_id: processId,
      output: text,
      exit_code: 0,
      wall_time_ms: 0,
      running: false,
      backgrounded: false,
      background_reason: undefined,
    }
  }

  var streamed = false
  const out = await runExecCommand(
    {
      sessionId: state.sessionId,
      command,
      workdir,
      timeoutMs: params.yield_time_ms,
      maxChars: params.max_output_tokens,
      processId,
      tty: params.tty === true,
      requestId: callId,
    },
    (chunk, nextProcessId) => {
      streamed = true

      if (term) {
        term.output = `${term.output}${chunk}`
        term.status = "running"
      }

      event(state.chatId, {
        type: "exec_command_output_delta",
        chat_id: state.chatId,
        turn_id: turnId,
        call_id: callId,
        process_id: nextProcessId,
        chunk,
      })
    },
  )

  if (!streamed) {
    emitExecOutput(state.chatId, turnId, callId, out.processId || processId, out.output)
  }

  if (term) {
    term.output = out.output
    const activeId = out.processId || processId
    const stillRunning = typeof out.exitCode !== "number" && !!(activeId && `${activeId}`.trim())
    term.status = stillRunning ? "running" : typeof out.exitCode === "number" && out.exitCode !== 0 ? "failed" : "done"
  }

  event(state.chatId, {
    type: "exec_command_end",
    chat_id: state.chatId,
    turn_id: turnId,
    call_id: callId,
    process_id: out.processId || processId,
    exit_code: out.exitCode,
    output: out.output,
    wall_time_ms: out.wallTimeMs,
  })
  return {
    ok: true,
    process_id: out.processId || processId,
    output: out.output,
    exit_code: out.exitCode,
    wall_time_ms: out.wallTimeMs,
    running: typeof out.exitCode !== "number" && !!((out.processId || processId) && `${out.processId || processId}`.trim()),
    backgrounded: out.backgrounded === true,
    background_reason: out.background_reason,
  }
}

const handleTerminateCommand = async (params: RuntimeTerminateCommandParams) => {
  const state = ensureSession(params.chat_id, "chat")
  const killed = unifiedExecManager.terminate(params.process_id)

  if (!killed) {
    event(state.chatId, {
      type: "warning",
      chat_id: state.chatId,
      message: `Process ${params.process_id} was already gone before terminate_command.`,
    })
    return {
      ok: true,
      process_id: params.process_id,
      terminated: false,
      already_gone: true,
    }
  }

  const turnId = nowId()
  const callId = nowId()
  event(state.chatId, {
    type: "exec_command_end",
    chat_id: state.chatId,
    turn_id: turnId,
    call_id: callId,
    process_id: params.process_id,
    exit_code: -1,
    output: "Terminated",
    wall_time_ms: 0,
  })
  return { ok: true, process_id: params.process_id, terminated: true }
}

const handleInterrupt = async (chatId: string) => {
  const id0 = typeof chatId === "string" ? chatId : ""
  const id = id0.trim() || "operator"
  const ctl = inflight.get(id)
  const hasPending = hasPendingForChat(id)

  if (!ctl && !hasPending) {
    return { ok: true, interrupted: false }
  }

  if (ctl) {
    ctl.abort()
    inflight.delete(id)
  }

  clearPendingForChat(id, "interrupted")
  event(id, {
    type: "warning",
    chat_id: id,
    message: "Turn interrupted by user request.",
  })
  return { ok: true, interrupted: true }
}

const handleListSessions = async () => {
  const out: Array<{
    chat_id: string
    session_id: string
    mode: string
    total_tokens: number
    compaction_count: number
    turn_state: AgentTurnStatus
  }> = []
  const list = Array.from(sessions.values())

  for (var i = 0; i < list.length; i++) {
    const state = list[i]

    if (!state) {
      continue
    }

    out.push({
      chat_id: state.chatId,
      session_id: state.sessionId,
      mode: state.mode,
      total_tokens: estimateTokensFromMessages(state.messages),
      compaction_count: state.compactionCount,
      turn_state: state.turnState,
    })
  }

  return { ok: true, sessions: out }
}

const handleResumeSession = async (chatId: string, sessionId?: string, mode?: string) => {
  const state = ensureSession(chatId, mode || "chat", sessionId)
  await hydrateSession(state)
  const list: RuntimeTerm[] = []

  for (var i = 0; i < state.termOrder.length; i++) {
    const key = state.termOrder[i] ?? ""
    const row = state.terms[key]

    if (!row) {
      continue
    }

    list.push(row)
  }

  const pending = Array.from(pendingApprovals.values())

  for (var i = 0; i < pending.length; i++) {
    const row = pending[i]

    if (!row || row.chatId !== state.chatId) {
      continue
    }

    event(state.chatId, {
      type: "tool_approval_requested",
      chat_id: state.chatId,
      turn_id: row.turnId,
      call_id: row.callId,
      tool: row.tool || "tool",
      reason: row.reason,
      command: row.command,
      cwd: row.cwd,
      details: typeof row.details === "undefined" ? undefined : row.details,
    })
  }

  return {
    ok: true,
    chat_id: state.chatId,
    session_id: state.sessionId,
    mode: state.mode,
    messages: state.messages,
    latest_summary: state.latestSummary,
    compaction_count: state.compactionCount,
    inflight: inflight.has(state.chatId) || hasPendingForChat(state.chatId),
    turn_id: state.turnId || undefined,
    turn_state: state.turnState,
    terms: list,
  }
}

const handleApprove = async (chatId: string, callId: string, approved: boolean) => {
  const id0 = typeof chatId === "string" ? chatId : ""
  const id = id0.trim() || "operator"
  const call0 = typeof callId === "string" ? callId : ""
  const call = call0.trim()

  if (!call) {
    return { ok: false, error: "Missing call_id" }
  }

  const key = `${id}:${call}`
  const pending = pendingApprovals.get(key)

  if (!pending) {
    return { ok: false, error: `No pending approval for ${call}` }
  }

  clearPendingApproval(key)
  pending.resolve(approved)

  if (approved !== true) {
    event(id, {
      type: "warning",
      chat_id: id,
      message: `Tool call denied: ${call}`,
    })
  }

  return { ok: true, approved, call_id: call }
}

const normalizeUserInputAnswers = (raw: unknown) => {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
  const out: Record<string, { answers: string[] }> = {}

  if (!row) {
    return out
  }

  const keys = Object.keys(row)

  for (var i = 0; i < keys.length; i++) {
    const key0 = keys[i] ?? ""
    const key = key0.trim()

    if (!key) {
      continue
    }

    const entry = row[key]
    const entryRow = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null
    const answers0 = Array.isArray(entryRow?.answers) ? (entryRow?.answers as unknown[]) : []
    const answers: string[] = []

    for (var ai = 0; ai < answers0.length; ai++) {
      const item = answers0[ai]

      if (typeof item !== "string") {
        continue
      }

      answers.push(item)
    }

    out[key] = { answers }
  }

  return out
}

const handleRequestUserInputResponse = async (params: RuntimeRequestUserInputResponseParams) => {
  const chat0 = typeof params.chat_id === "string" ? params.chat_id : ""
  const chatId = chat0.trim() || "operator"
  const call0 = typeof params.call_id === "string" ? params.call_id : ""
  const callId = call0.trim()

  if (!callId) {
    return { ok: false, error: "Missing call_id" }
  }

  const key = `${chatId}:${callId}`
  const pending = pendingUserInputs.get(key)

  if (!pending) {
    return { ok: false, error: `No pending request_user_input for ${callId}` }
  }

  const answers = normalizeUserInputAnswers(params.answers)
  clearPendingUserInput(key)
  pending.resolve(answers)
  return { ok: true, call_id: callId, answered: true }
}

const handleResizePty = async (params: RuntimeResizePtyParams) => {
  const chat0 = typeof params.chat_id === "string" ? params.chat_id : ""
  const chatId = chat0.trim() || "operator"
  const process0 = typeof params.process_id === "string" ? params.process_id : ""
  const processId = process0.trim()
  const cols = toNum(params.cols)
  const rows = toNum(params.rows)

  if (!processId) {
    return { ok: false, error: "Missing process_id" }
  }

  const out = unifiedExecManager.resize(processId, cols, rows)
  const row = out && typeof out === "object" ? (out as { ok?: unknown; cols?: unknown; rows?: unknown; error?: unknown } | null) : null

  if (!row || row.ok !== true) {
    const err0 = typeof row?.error === "string" ? row.error : ""
    const err = err0.trim() || "resize failed"
    const lowerErr = err.toLowerCase()

    if (lowerErr.includes("unknown process_id") || lowerErr.includes("unknown process")) {
      event(chatId, {
        type: "warning",
        chat_id: chatId,
        message: `Ignored resize for stale process_id ${processId}.`,
      })
      return {
        ok: true,
        process_id: processId,
        cols: cols ?? 0,
        rows: rows ?? 0,
        skipped: true,
        reason: err,
      }
    }

    return { ok: false, error: err }
  }

  const nextCols = toNum(row.cols) ?? cols ?? 0
  const nextRows = toNum(row.rows) ?? rows ?? 0
  event(chatId, {
    type: "pty_resized",
    chat_id: chatId,
    process_id: processId,
    cols: nextCols,
    rows: nextRows,
  })
  return {
    ok: true,
    process_id: processId,
    cols: nextCols,
    rows: nextRows,
  }
}

const handleUploadFeedback = async (params: RuntimeUploadFeedbackParams) => {
  const chat0 = typeof params.chat_id === "string" ? params.chat_id : ""
  const chatId = chat0.trim() || "operator"
  const classification0 = typeof params.classification === "string" ? params.classification : "other"
  const classification = classification0 || "other"
  const reason0 = typeof params.reason === "string" ? params.reason : ""
  const reason = reason0.trim()
  const note = reason ? `Feedback (${classification}): ${reason}` : `Feedback uploaded (${classification}).`
  event(chatId, {
    type: "warning",
    chat_id: chatId,
    message: note,
  })
  return {
    ok: true,
    accepted: true,
    classification,
  }
}

const handleRequest = async <K extends RuntimeMethod>(req: RuntimeRequest<K>) => {
  const method = req.method

  if (method === "submit_user_turn") {
    return handleSubmitUserTurn(req.params as RuntimeSubmitUserTurnParams)
  }

  if (method === "write_stdin") {
    return handleWriteStdin(req.params as RuntimeWriteStdinParams)
  }

  if (method === "resize_pty") {
    return handleResizePty(req.params as RuntimeResizePtyParams)
  }

  if (method === "exec_command") {
    return handleExecCommand(req.params as RuntimeExecCommandParams)
  }

  if (method === "terminate_command") {
    return handleTerminateCommand(req.params as RuntimeTerminateCommandParams)
  }

  if (method === "interrupt") {
    const row = req.params as { chat_id?: unknown }
    const chat0 = typeof row.chat_id === "string" ? row.chat_id : "operator"
    return handleInterrupt(chat0)
  }

  if (method === "approve") {
    const row = req.params as { chat_id?: unknown; call_id?: unknown; approved?: unknown }
    const chat0 = typeof row.chat_id === "string" ? row.chat_id : "operator"
    const call0 = typeof row.call_id === "string" ? row.call_id : ""
    const approved = row.approved === true
    return handleApprove(chat0, call0, approved)
  }

  if (method === "request_user_input_response") {
    return handleRequestUserInputResponse(req.params as RuntimeRequestUserInputResponseParams)
  }

  if (method === "upload_feedback") {
    return handleUploadFeedback(req.params as RuntimeUploadFeedbackParams)
  }

  if (method === "list_sessions") {
    return handleListSessions()
  }

  if (method === "resume_session") {
    const row = req.params as { chat_id?: unknown; session_id?: unknown; mode?: unknown }
    const chat0 = typeof row.chat_id === "string" ? row.chat_id : "operator"
    const session0 = typeof row.session_id === "string" ? row.session_id : undefined
    const mode0 = typeof row.mode === "string" ? row.mode : undefined
    return handleResumeSession(chat0, session0, mode0)
  }

  return { ok: false, error: `Unsupported runtime method: ${method}` }
}

const main = async () => {
  heartbeat()
  const timer = setInterval(() => {
    heartbeat()
  }, 3000)
  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  })

  const respondToRequest = async (parsed: RuntimeRequest) => {
    const out = await handleRequest(parsed).catch((err) => {
      const row = err && typeof err === "object" ? (err as { message?: unknown } | null) : null
      const msg0 = typeof row?.message === "string" ? row.message : ""
      const msg = msg0.trim() || "Runtime worker error"
      return { ok: false, error: msg }
    })

    if (!out || out.ok !== true) {
      const err0 = out && typeof out === "object" ? (out as { error?: unknown }).error : ""
      const err1 = typeof err0 === "string" ? err0 : ""
      const err = err1.trim() || "Runtime worker error"
      response(parsed, false, null, err)
      return
    }

    response(parsed, true, out, "")
  }

  for await (const line of rl) {
    const parsed = safeParse(line)

    if (!parsed || parsed.kind !== "request") {
      continue
    }

    void respondToRequest(parsed as RuntimeRequest)
  }

  clearInterval(timer)
}

await main()
