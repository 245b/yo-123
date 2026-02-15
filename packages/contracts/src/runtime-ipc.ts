import { z } from "zod"
import type { AgentChatMessage } from "./ws"

export type RuntimeRole =
  | "control-plane"
  | "runtime-supervisor"
  | "exec-host"
  | "pty-host"
  | "extension-host"
  | "lsp-host"
  | "data-host"

export type RuntimeChannel = "runtime" | "terminal" | "extension" | "lsp" | "health"

export type RuntimeSubmitUserTurnParams = {
  chat_id: string
  session_id: string
  mode: string
  messages: AgentChatMessage[]
  allow_terminal_exec: boolean
  approval_policy?: "on-request" | "untrusted" | "never"
  sandbox_mode?: "workspace-write" | "read-only"
}

export type RuntimeWriteStdinParams = {
  chat_id: string
  process_id: string
  chars: string
  yield_time_ms?: number
  max_output_tokens?: number
}

export type RuntimeResizePtyParams = {
  chat_id: string
  process_id: string
  cols?: number
  rows?: number
}

export type RuntimeExecCommandParams = {
  chat_id: string
  command: string
  process_id?: string
  workdir?: string
  yield_time_ms?: number
  max_output_tokens?: number
  tty?: boolean
  call_id?: string
}

export type RuntimeTerminateCommandParams = {
  chat_id: string
  process_id: string
}

export type RuntimeInterruptParams = {
  chat_id: string
}

export type RuntimeApproveParams = {
  chat_id: string
  call_id: string
  approved: boolean
}

export type RuntimeRequestUserInputResponseParams = {
  chat_id: string
  call_id: string
  answers: Record<string, { answers: string[] }>
}

export type RuntimeResumeSessionParams = {
  chat_id: string
  session_id?: string
  mode?: string
}

export type RuntimeInitializeHostParams = {
  hostRole: "extension-host" | "lsp-host"
  version: "v1"
  capabilities?: Record<string, boolean>
}

export type RuntimeUploadFeedbackParams = {
  chat_id: string
  classification?: "bug" | "bad_result" | "good_result" | "other"
  reason?: string
  include_logs?: boolean
  include_rollout?: boolean
}

export type RuntimeListSessionsParams = Record<string, never>

export type RuntimeCleanupRequestParams = {
  chat_id: string
}

export type RuntimePtyOpenParams = {
  sessionId: string
  processId?: string
  cwd?: string
  cols?: number
  rows?: number
}

export type RuntimePtyWriteParams = {
  processId: string
  chars: string
}

export type RuntimePtyCaptureParams = {
  processId: string
  maxChars?: number
}

export type RuntimePtyResizeParams = {
  processId: string
  cols?: number
  rows?: number
}

export type RuntimePtyTerminateParams = {
  processId: string
}

export type RuntimePtySnapshotParams = {
  processId: string
}

export type RuntimePtyRestoreParams = {
  sessionId: string
  snapshot: {
    processId: string
    command: string
    cwd: string
    cols: number
    rows: number
    output: string
    updatedAt: string
  }
}

export type RuntimeMethod =
  | "submit_user_turn"
  | "write_stdin"
  | "resize_pty"
  | "exec_command"
  | "terminate_command"
  | "interrupt"
  | "approve"
  | "request_user_input_response"
  | "upload_feedback"
  | "list_sessions"
  | "resume_session"
  | "cleanup_request"
  | "initialize_host"
  | "pty_open"
  | "pty_write"
  | "pty_capture"
  | "pty_resize"
  | "pty_terminate"
  | "pty_snapshot"
  | "pty_restore"
  | "heartbeat"

export type RuntimeMethodParams = {
  submit_user_turn: RuntimeSubmitUserTurnParams
  write_stdin: RuntimeWriteStdinParams
  resize_pty: RuntimeResizePtyParams
  exec_command: RuntimeExecCommandParams
  terminate_command: RuntimeTerminateCommandParams
  interrupt: RuntimeInterruptParams
  approve: RuntimeApproveParams
  request_user_input_response: RuntimeRequestUserInputResponseParams
  upload_feedback: RuntimeUploadFeedbackParams
  list_sessions: RuntimeListSessionsParams
  resume_session: RuntimeResumeSessionParams
  cleanup_request: RuntimeCleanupRequestParams
  initialize_host: RuntimeInitializeHostParams
  pty_open: RuntimePtyOpenParams
  pty_write: RuntimePtyWriteParams
  pty_capture: RuntimePtyCaptureParams
  pty_resize: RuntimePtyResizeParams
  pty_terminate: RuntimePtyTerminateParams
  pty_snapshot: RuntimePtySnapshotParams
  pty_restore: RuntimePtyRestoreParams
  heartbeat: Record<string, never>
}

export type RuntimeFrameBase = {
  id: string
  role: RuntimeRole
  channel: RuntimeChannel
  method: string
  ts: string
  requestId: string
  sessionId: string
}

export type RuntimeRequestV1<K extends RuntimeMethod = RuntimeMethod> = RuntimeFrameBase & {
  version: "v1"
  kind: "request"
  method: K
  params: RuntimeMethodParams[K]
}

export type RuntimeResponseV1 = RuntimeFrameBase & {
  version: "v1"
  kind: "response"
  ok: boolean
  result?: unknown
  error?: string
}

export type RuntimeEventV1 = RuntimeFrameBase & {
  version: "v1"
  kind: "event"
  event: string
  chat_id: string
  payload: Record<string, unknown>
}

export type RuntimeErrorV1 = RuntimeFrameBase & {
  version: "v1"
  kind: "error"
  code: string
  message: string
  details?: unknown
}

export type RuntimeRequest<K extends RuntimeMethod = RuntimeMethod> = RuntimeRequestV1<K>
export type RuntimeResponse = RuntimeResponseV1
export type RuntimeEvent = RuntimeEventV1
export type RuntimeEnvelope = RuntimeRequestV1 | RuntimeResponseV1 | RuntimeEventV1 | RuntimeErrorV1

const RuntimeRoleSchema = z.enum([
  "control-plane",
  "runtime-supervisor",
  "exec-host",
  "pty-host",
  "extension-host",
  "lsp-host",
  "data-host",
])
const RuntimeChannelSchema = z.enum(["runtime", "terminal", "extension", "lsp", "health"])
const RuntimeMethodSchema = z.enum([
  "submit_user_turn",
  "write_stdin",
  "resize_pty",
  "exec_command",
  "terminate_command",
  "interrupt",
  "approve",
  "request_user_input_response",
  "upload_feedback",
  "list_sessions",
  "resume_session",
  "cleanup_request",
  "initialize_host",
  "pty_open",
  "pty_write",
  "pty_capture",
  "pty_resize",
  "pty_terminate",
  "pty_snapshot",
  "pty_restore",
  "heartbeat",
])

export const RuntimeFrameBaseSchema = z.object({
  id: z.string().trim().min(1),
  role: RuntimeRoleSchema,
  channel: RuntimeChannelSchema,
  method: z.string().trim().min(1),
  ts: z.string().trim().min(1),
  requestId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
})

const RuntimeRequestV1Schema = RuntimeFrameBaseSchema.extend({
  version: z.literal("v1"),
  kind: z.literal("request"),
  method: RuntimeMethodSchema,
  params: z.record(z.unknown()),
})

const RuntimeResponseV1Schema = RuntimeFrameBaseSchema.extend({
  version: z.literal("v1"),
  kind: z.literal("response"),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
})

const RuntimeEventV1Schema = RuntimeFrameBaseSchema.extend({
  version: z.literal("v1"),
  kind: z.literal("event"),
  event: z.string().trim().min(1),
  chat_id: z.string().trim().min(1),
  payload: z.record(z.unknown()),
})

const RuntimeErrorV1Schema = RuntimeFrameBaseSchema.extend({
  version: z.literal("v1"),
  kind: z.literal("error"),
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  details: z.unknown().optional(),
})

export const RuntimeEnvelopeSchema = z.discriminatedUnion("kind", [
  RuntimeRequestV1Schema,
  RuntimeResponseV1Schema,
  RuntimeEventV1Schema,
  RuntimeErrorV1Schema,
])

const cleanText = (raw: unknown, fallback: string) => {
  const t0 = typeof raw === "string" ? raw : ""
  const t = t0.trim()

  if (t) {
    return t
  }

  return fallback
}

export const makeRuntimeFrameBase = (input: {
  id?: string
  requestId?: string
  sessionId?: string
  role?: RuntimeRole
  channel?: RuntimeChannel
  method?: string
  ts?: string
}) => {
  const now = new Date().toISOString()
  const id = cleanText(input.id, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
  const requestId = cleanText(input.requestId, id)
  const sessionId = cleanText(input.sessionId, "operator")
  const method = cleanText(input.method, "unknown")
  const ts = cleanText(input.ts, now)
  const role = input.role ?? "runtime-supervisor"
  const channel = input.channel ?? "runtime"
  return { id, requestId, sessionId, method, ts, role, channel }
}

export const decodeRuntimeEnvelope = (raw: unknown) => RuntimeEnvelopeSchema.safeParse(raw)
