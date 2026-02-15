import { z } from "zod"

export const AgentRoleSchema = z.enum(["system", "user", "assistant", "tool"])

export const AgentChatMessageSchema = z.object({
  role: AgentRoleSchema,
  content: z.string(),
})

export const AgentTermEntrySchema = z.object({
  id: z.string().trim().min(1),
  tool: z.string().trim().min(1),
  input: z.string(),
  output: z.string(),
  status: z.enum(["running", "done", "failed"]),
})

export const AgentUserInputOptionSchema = z.object({
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
})

export const AgentUserInputQuestionSchema = z.object({
  id: z.string().trim().min(1),
  header: z.string().trim().min(1),
  question: z.string().trim().min(1),
  is_other: z.boolean().optional(),
  is_secret: z.boolean().optional(),
  options: z.array(AgentUserInputOptionSchema).optional(),
})

export const AgentTurnStatusSchema = z.enum([
  "running",
  "waiting_approval",
  "waiting_user_input",
  "completed",
  "interrupted",
  "failed",
])

const ConfigureMessageSchema = z.object({
  type: z.literal("configure"),
  chatId: z.string(),
  mode: z.string().optional(),
  allow_terminal_exec: z.boolean().optional(),
  sessionId: z.string().optional(),
  approval_policy: z.enum(["on-request", "untrusted", "never"]).optional(),
  sandbox_mode: z.enum(["workspace-write", "read-only"]).optional(),
})

const SubmitTurnMessageSchema = z.object({
  type: z.literal("submit_turn"),
  chatId: z.string(),
  mode: z.string().optional(),
  sessionId: z.string().optional(),
  messages: z.array(AgentChatMessageSchema),
  allow_terminal_exec: z.boolean().optional(),
  approval_policy: z.enum(["on-request", "untrusted", "never"]).optional(),
  sandbox_mode: z.enum(["workspace-write", "read-only"]).optional(),
})

const CancelTurnMessageSchema = z.object({
  type: z.literal("cancel_turn"),
  chatId: z.string().optional(),
})

const ApproveToolMessageSchema = z.object({
  type: z.literal("approve_tool"),
  call_id: z.string().trim().min(1),
  approved: z.boolean(),
})

const RequestUserInputResponseMessageSchema = z.object({
  type: z.literal("request_user_input_response"),
  call_id: z.string().trim().min(1),
  answers: z.record(
    z.object({
      answers: z.array(z.string()),
    }),
  ),
})

const UploadFeedbackMessageSchema = z.object({
  type: z.literal("upload_feedback"),
  classification: z.enum(["bug", "bad_result", "good_result", "other"]).optional(),
  reason: z.string().optional(),
  include_logs: z.boolean().optional(),
  include_rollout: z.boolean().optional(),
})

const WriteStdinMessageSchema = z.object({
  type: z.literal("write_stdin"),
  process_id: z.string().trim().min(1),
  chars: z.string(),
  yield_time_ms: z.number().int().positive().optional(),
  max_output_tokens: z.number().int().positive().optional(),
})

const ResizePtyMessageSchema = z.object({
  type: z.literal("resize_pty"),
  process_id: z.string().trim().min(1),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
})

const ExecCommandMessageSchema = z.object({
  type: z.literal("exec_command"),
  call_id: z.string().optional(),
  command: z.string().trim().min(1),
  process_id: z.string().optional(),
  workdir: z.string().optional(),
  yield_time_ms: z.number().int().positive().optional(),
  max_output_tokens: z.number().int().positive().optional(),
  tty: z.boolean().optional(),
})

const TerminateCommandMessageSchema = z.object({
  type: z.literal("terminate_command"),
  process_id: z.string().trim().min(1),
})

const ListSessionsMessageSchema = z.object({
  type: z.literal("list_sessions"),
})

const ResumeSessionMessageSchema = z.object({
  type: z.literal("resume_session"),
  chatId: z.string(),
  mode: z.string().optional(),
  sessionId: z.string().optional(),
})

export const AgentWsClientMessageSchema = z.discriminatedUnion("type", [
  ConfigureMessageSchema,
  SubmitTurnMessageSchema,
  CancelTurnMessageSchema,
  ApproveToolMessageSchema,
  RequestUserInputResponseMessageSchema,
  UploadFeedbackMessageSchema,
  WriteStdinMessageSchema,
  ResizePtyMessageSchema,
  ExecCommandMessageSchema,
  TerminateCommandMessageSchema,
  ListSessionsMessageSchema,
  ResumeSessionMessageSchema,
])

const SessionConfiguredEventSchema = z.object({
  type: z.literal("session_configured"),
  chat_id: z.string(),
  session_id: z.string(),
})

const SessionStateEventSchema = z.object({
  type: z.literal("session_state"),
  chat_id: z.string(),
  session_id: z.string(),
  mode: z.string(),
  inflight: z.boolean(),
  turn_state: AgentTurnStatusSchema.optional(),
  messages: z.array(AgentChatMessageSchema),
  terms: z.array(AgentTermEntrySchema).optional(),
})

const RuntimeCapabilitiesEventSchema = z.object({
  type: z.literal("runtime_capabilities"),
  chat_id: z.string(),
  capabilities: z.object({
    approvals: z.boolean(),
    request_user_input: z.boolean(),
    resize_pty: z.boolean(),
    feedback: z.boolean(),
  }),
})

const TurnStatusEventSchema = z.object({
  type: z.literal("turn_status"),
  chat_id: z.string(),
  turn_id: z.string(),
  status: AgentTurnStatusSchema,
  detail: z.string().optional(),
})

const ToolApprovalRequestedEventSchema = z.object({
  type: z.literal("tool_approval_requested"),
  chat_id: z.string(),
  turn_id: z.string(),
  call_id: z.string(),
  tool: z.string(),
  reason: z.string().optional(),
  command: z.string().optional(),
  cwd: z.string().optional(),
  details: z.unknown().optional(),
})

const RequestUserInputRequestedEventSchema = z.object({
  type: z.literal("request_user_input_requested"),
  chat_id: z.string(),
  turn_id: z.string(),
  call_id: z.string(),
  timeout_ms: z.number().int().positive().optional(),
  questions: z.array(AgentUserInputQuestionSchema),
})

const PtyResizedEventSchema = z.object({
  type: z.literal("pty_resized"),
  chat_id: z.string(),
  process_id: z.string(),
  cols: z.number().int(),
  rows: z.number().int(),
})

const TurnStartedEventSchema = z.object({
  type: z.literal("turn_started"),
  chat_id: z.string(),
  turn_id: z.string(),
  model_context_window: z.number().int(),
})

const TaskStartedEventSchema = z.object({
  type: z.literal("task_started"),
  chat_id: z.string(),
  model_context_window: z.number().int(),
})

const ItemStartedEventSchema = z.object({
  type: z.literal("item_started"),
  chat_id: z.string(),
  turn_id: z.string(),
  item: z.string(),
  item_id: z.string(),
})

const AgentMessageDeltaEventSchema = z.object({
  type: z.literal("agent_message_content_delta"),
  chat_id: z.string(),
  turn_id: z.string(),
  item_id: z.string(),
  delta: z.string(),
})

const ReasoningDeltaEventSchema = z.object({
  type: z.literal("reasoning_content_delta"),
  chat_id: z.string(),
  turn_id: z.string(),
  item_id: z.string(),
  delta: z.string(),
})

const ExecCommandBeginEventSchema = z.object({
  type: z.literal("exec_command_begin"),
  chat_id: z.string(),
  turn_id: z.string(),
  call_id: z.string(),
  command: z.string(),
  process_id: z.string().optional(),
  tool_name: z.string().optional(),
})

const ExecCommandOutputDeltaEventSchema = z.object({
  type: z.literal("exec_command_output_delta"),
  chat_id: z.string(),
  turn_id: z.string(),
  call_id: z.string(),
  process_id: z.string().optional(),
  chunk: z.string(),
})

const TerminalInteractionEventSchema = z.object({
  type: z.literal("terminal_interaction"),
  chat_id: z.string(),
  turn_id: z.string(),
  call_id: z.string(),
  process_id: z.string(),
  stdin: z.string(),
})

const ExecCommandEndEventSchema = z.object({
  type: z.literal("exec_command_end"),
  chat_id: z.string(),
  turn_id: z.string(),
  call_id: z.string(),
  process_id: z.string().optional(),
  exit_code: z.number().int().optional(),
  output: z.string().optional(),
  wall_time_ms: z.number().int().optional(),
})

const ExecProcessExitEventSchema = z.object({
  type: z.literal("exec_process_exit"),
  chat_id: z.string(),
  process_id: z.string(),
  exit_code: z.number().int(),
  output: z.string(),
  wall_time_ms: z.number().int().min(0),
  final: z.literal(true),
})

const TokenCountEventSchema = z.object({
  type: z.literal("token_count"),
  chat_id: z.string(),
  total_tokens: z.number().int(),
  model_context_window: z.number().int(),
  auto_compact_limit: z.number().int(),
})

const ContextCompactedEventSchema = z.object({
  type: z.literal("context_compacted"),
  chat_id: z.string(),
  before_tokens: z.number().int(),
  after_tokens: z.number().int(),
  summary: z.string(),
})

const TurnCompleteEventSchema = z.object({
  type: z.literal("turn_complete"),
  chat_id: z.string(),
  turn_id: z.string(),
  last_agent_message: z.string().optional(),
  detail: z.string().optional(),
})

const TaskCompleteEventSchema = z.object({
  type: z.literal("task_complete"),
  chat_id: z.string(),
  turn_id: z.string(),
  last_agent_message: z.string().optional(),
  detail: z.string().optional(),
})

const RuntimeHostHealthEventSchema = z.object({
  type: z.literal("runtime_host_health"),
  chat_id: z.string(),
  host_role: z.enum(["control-plane", "runtime-supervisor", "exec-host", "pty-host", "extension-host", "lsp-host", "data-host"]),
  state: z.enum(["starting", "ready", "degraded", "stopped"]),
  heartbeat_lag_ms: z.number().int().min(0),
  restart_count: z.number().int().min(0),
  restart_limit: z.number().int().min(1),
  reason: z.string().optional(),
})

const WarningEventSchema = z.object({
  type: z.literal("warning"),
  chat_id: z.string(),
  message: z.string(),
})

const ErrorEventSchema = z.object({
  type: z.literal("error"),
  chat_id: z.string(),
  message: z.string(),
})

export const AgentWsServerEventSchema = z.discriminatedUnion("type", [
  SessionConfiguredEventSchema,
  SessionStateEventSchema,
  RuntimeCapabilitiesEventSchema,
  TurnStatusEventSchema,
  ToolApprovalRequestedEventSchema,
  RequestUserInputRequestedEventSchema,
  PtyResizedEventSchema,
  TurnStartedEventSchema,
  TaskStartedEventSchema,
  ItemStartedEventSchema,
  AgentMessageDeltaEventSchema,
  ReasoningDeltaEventSchema,
  ExecCommandBeginEventSchema,
  ExecCommandOutputDeltaEventSchema,
  TerminalInteractionEventSchema,
  ExecCommandEndEventSchema,
  ExecProcessExitEventSchema,
  TokenCountEventSchema,
  ContextCompactedEventSchema,
  TurnCompleteEventSchema,
  TaskCompleteEventSchema,
  RuntimeHostHealthEventSchema,
  WarningEventSchema,
  ErrorEventSchema,
])

export type AgentChatMessage = z.infer<typeof AgentChatMessageSchema>
export type AgentTermEntry = z.infer<typeof AgentTermEntrySchema>
export type AgentUserInputOption = z.infer<typeof AgentUserInputOptionSchema>
export type AgentUserInputQuestion = z.infer<typeof AgentUserInputQuestionSchema>
export type AgentTurnStatus = z.infer<typeof AgentTurnStatusSchema>
export type AgentWsClientMessage = z.infer<typeof AgentWsClientMessageSchema>
export type AgentWsServerEvent = z.infer<typeof AgentWsServerEventSchema>

export const decodeAgentWsClientMessage = (raw: unknown) => AgentWsClientMessageSchema.safeParse(raw)
export const decodeAgentWsServerEvent = (raw: unknown) => AgentWsServerEventSchema.safeParse(raw)
