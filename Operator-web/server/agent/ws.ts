import { sendAgentEvent } from "./event-bus"
import { RuntimeSupervisor } from "./runtime/supervisor"
import { decodeAgentWsClientMessage, type AgentWsClientMessage } from "../../../packages/contracts/src/ws"
import { logEvent } from "@operator/observability"

type WsData = {
  chatId: string
  sessionId: string
  mode: string
  approvalPolicy: string
  sandboxMode: string
  configured: boolean
  queue?: Promise<void> | null
  unsubscribe?: (() => void) | null
}

const safeJson = (raw: string): AgentWsClientMessage | null => {
  const text = typeof raw === "string" ? raw : ""
  const trimmed = text.trim()

  if (!trimmed) {
    return null
  }

  try {
    const parsed = decodeAgentWsClientMessage(JSON.parse(trimmed) as unknown)

    if (!parsed.success) {
      return null
    }

    return parsed.data
  } catch {
    return null
  }
}

export class AgentWsController {
  private readonly runtime: RuntimeSupervisor

  constructor(runtime: RuntimeSupervisor) {
    this.runtime = runtime
  }

  private emitSessionConfigured(
    ws: Bun.ServerWebSocket<WsData>,
    chatId: string,
    sessionId: string,
    mode: string,
    rawResult: unknown,
  ) {
    sendAgentEvent(ws, {
      type: "session_configured",
      chat_id: chatId,
      session_id: sessionId,
    })
    sendAgentEvent(ws, {
      type: "runtime_capabilities",
      chat_id: chatId,
      capabilities: {
        approvals: true,
        request_user_input: true,
        resize_pty: true,
        feedback: true,
      },
    })

    const row = rawResult && typeof rawResult === "object" ? (rawResult as Record<string, unknown>) : null
    const inflight = row?.inflight === true
    const messages = Array.isArray(row?.messages) ? (row.messages as unknown[]) : []
    const terms = Array.isArray(row?.terms) ? (row.terms as unknown[]) : []
    const turnState0 = typeof row?.turn_state === "string" ? row.turn_state : ""
    const turnState =
      turnState0 === "running" ||
      turnState0 === "waiting_approval" ||
      turnState0 === "waiting_user_input" ||
      turnState0 === "completed" ||
      turnState0 === "interrupted" ||
      turnState0 === "failed"
        ? turnState0
        : undefined

    sendAgentEvent(ws, {
      type: "session_state",
      chat_id: chatId,
      session_id: sessionId,
      mode,
      inflight,
      turn_state: turnState,
      messages: messages as unknown as { role: "system" | "user" | "assistant" | "tool"; content: string }[],
      terms: terms as unknown as { id: string; tool: string; input: string; output: string; status: "running" | "done" | "failed" }[],
    })
  }

  open(ws: Bun.ServerWebSocket<WsData>) {
    ws.data = {
      chatId: "operator",
      sessionId: "operator",
      mode: "chat",
      approvalPolicy: "",
      sandboxMode: "",
      configured: false,
      queue: null,
      unsubscribe: null,
    }

    const drop = this.runtime.subscribe("*", (chatId, payload) => {
      const target = ws.data.chatId

      if (chatId !== target) {
        return
      }

      if (payload.type === "tool_approval_requested") {
        logEvent({
          level: "info",
          event: "ws_forward_tool_approval",
          requestId: (payload as { call_id?: string }).call_id,
          chatId: chatId,
          sessionId: ws.data.sessionId,
          hostRole: "operator-web",
          channel: "ws",
          details: {
            ws_chat_id: ws.data.chatId,
            ws_session_id: ws.data.sessionId,
            turn_id: (payload as { turn_id?: string }).turn_id,
            call_id: (payload as { call_id?: string }).call_id,
            tool: (payload as { tool?: string }).tool,
          },
        })
      }

      sendAgentEvent(ws, payload)
    })

    ws.data.unsubscribe = drop
  }

  close(ws: Bun.ServerWebSocket<WsData>) {
    const drop = ws.data.unsubscribe

    if (!drop) {
      return
    }

    drop()
    ws.data.unsubscribe = null
  }

  async message(ws: Bun.ServerWebSocket<WsData>, raw: string | Buffer) {
    const run = async () => {
      const text = typeof raw === "string" ? raw : raw.toString("utf8")
      const msg = safeJson(text)

      if (!msg) {
        sendAgentEvent(ws, {
          type: "error",
          chat_id: ws.data.chatId,
          message: "Invalid WS payload: contract_validation_failed",
        })
        return
      }

      if (msg.type === "configure") {
        const chat0 = typeof msg.chatId === "string" ? msg.chatId : ""
        const mode0 = typeof msg.mode === "string" ? msg.mode : ""
        const session0 = typeof msg.sessionId === "string" ? msg.sessionId : ""
        const approval0 = typeof msg.approval_policy === "string" ? msg.approval_policy : ""
        const sandbox0 = typeof msg.sandbox_mode === "string" ? msg.sandbox_mode : ""
        const chatId = chat0.trim() || "operator"
        const mode = mode0.trim() || "chat"
        const sessionId = session0.trim() || chatId
        ws.data.chatId = chatId
        ws.data.mode = mode
        ws.data.sessionId = sessionId

        if (approval0.trim()) {
          ws.data.approvalPolicy = approval0.trim()
        }

        if (sandbox0.trim()) {
          ws.data.sandboxMode = sandbox0.trim()
        }

        ws.data.configured = true
        const resumed = await this.runtime.resumeSession({
          chat_id: chatId,
          session_id: sessionId,
          mode,
        })

        if (!resumed.ok) {
          sendAgentEvent(ws, {
            type: "error",
            chat_id: chatId,
            message: resumed.error || "Failed to configure runtime session",
          })
          return
        }

        this.emitSessionConfigured(ws, chatId, sessionId, mode, resumed.result)
        return
      }

      if (msg.type === "submit_turn") {
        const chat0 = typeof msg.chatId === "string" ? msg.chatId : ws.data.chatId
        const mode0 = typeof msg.mode === "string" ? msg.mode : ws.data.mode
        const session0 = typeof msg.sessionId === "string" ? msg.sessionId : ws.data.sessionId
        const approval0 = typeof msg.approval_policy === "string" ? msg.approval_policy : ws.data.approvalPolicy
        const sandbox0 = typeof msg.sandbox_mode === "string" ? msg.sandbox_mode : ws.data.sandboxMode
        const chatId = chat0.trim() || "operator"
        const mode = mode0.trim() || "chat"
        const sessionId = session0.trim() || chatId
        const approvalPolicy = approval0.trim()
        const sandboxMode = sandbox0.trim()
        ws.data.chatId = chatId
        ws.data.mode = mode
        ws.data.sessionId = sessionId
        ws.data.configured = true

        if (approvalPolicy) {
          ws.data.approvalPolicy = approvalPolicy
        }

        if (sandboxMode) {
          ws.data.sandboxMode = sandboxMode
        }

        const out = await this.runtime.submitUserTurn({
          chat_id: chatId,
          session_id: sessionId,
          mode,
          messages: msg.messages,
          allow_terminal_exec: msg.allow_terminal_exec === true,
          approval_policy: approvalPolicy ? (approvalPolicy as "on-request" | "untrusted" | "never") : undefined,
          sandbox_mode: sandboxMode ? (sandboxMode as "workspace-write" | "read-only") : undefined,
        })

        if (out.ok) {
          return
        }

        sendAgentEvent(ws, {
          type: "error",
          chat_id: chatId,
          message: out.error || "submit_user_turn failed",
        })
        return
      }

      if (msg.type === "cancel_turn") {
        const chat0 = typeof msg.chatId === "string" ? msg.chatId : ws.data.chatId
        const chatId = chat0.trim() || ws.data.chatId || "operator"
        const out = await this.runtime.interrupt({ chat_id: chatId })

        if (out.ok) {
          return
        }

        sendAgentEvent(ws, {
          type: "error",
          chat_id: chatId,
          message: out.error || "interrupt failed",
        })
        return
      }

      if (msg.type === "approve_tool") {
        const out = await this.runtime.approve({
          chat_id: ws.data.chatId,
          call_id: msg.call_id,
          approved: msg.approved === true,
        })

        if (out.ok) {
          return
        }

        sendAgentEvent(ws, {
          type: "error",
          chat_id: ws.data.chatId,
          message: out.error || "approve failed",
        })
        return
      }

      if (msg.type === "request_user_input_response") {
        const out = await this.runtime.requestUserInputResponse({
          chat_id: ws.data.chatId,
          call_id: msg.call_id,
          answers: msg.answers,
        })

        if (out.ok) {
          return
        }

        sendAgentEvent(ws, {
          type: "error",
          chat_id: ws.data.chatId,
          message: out.error || "request_user_input_response failed",
        })
        return
      }

      if (msg.type === "upload_feedback") {
        const out = await this.runtime.uploadFeedback({
          chat_id: ws.data.chatId,
          classification: msg.classification,
          reason: msg.reason,
          include_logs: msg.include_logs === true,
          include_rollout: msg.include_rollout === true,
        })

        if (out.ok) {
          return
        }

        sendAgentEvent(ws, {
          type: "error",
          chat_id: ws.data.chatId,
          message: out.error || "upload_feedback failed",
        })
        return
      }

      if (msg.type === "write_stdin") {
        const out = await this.runtime.writeStdin({
          chat_id: ws.data.chatId,
          process_id: msg.process_id,
          chars: msg.chars,
          yield_time_ms: msg.yield_time_ms,
          max_output_tokens: msg.max_output_tokens,
        })

        if (out.ok) {
          return
        }

        sendAgentEvent(ws, {
          type: "error",
          chat_id: ws.data.chatId,
          message: out.error || "write_stdin failed",
        })
        return
      }

      if (msg.type === "exec_command") {
        const out = await this.runtime.execCommand({
          chat_id: ws.data.chatId,
          call_id: msg.call_id,
          command: msg.command,
          process_id: msg.process_id,
          workdir: msg.workdir,
          yield_time_ms: msg.yield_time_ms,
          max_output_tokens: msg.max_output_tokens,
          tty: msg.tty,
        })

        if (out.ok) {
          return
        }

        sendAgentEvent(ws, {
          type: "error",
          chat_id: ws.data.chatId,
          message: out.error || "exec_command failed",
        })
        return
      }

      if (msg.type === "terminate_command") {
        const out = await this.runtime.terminateCommand({
          chat_id: ws.data.chatId,
          process_id: msg.process_id,
        })

        if (out.ok) {
          return
        }

        sendAgentEvent(ws, {
          type: "error",
          chat_id: ws.data.chatId,
          message: out.error || "terminate_command failed",
        })
        return
      }

      if (msg.type === "list_sessions") {
        const out = await this.runtime.listSessions()

        if (!out.ok) {
          sendAgentEvent(ws, {
            type: "error",
            chat_id: ws.data.chatId,
            message: out.error || "list_sessions failed",
          })
          return
        }

        const row = out.result && typeof out.result === "object" ? (out.result as { sessions?: unknown } | null) : null
        const sessions = Array.isArray(row?.sessions) ? row.sessions : []
        sendAgentEvent(ws, {
          type: "warning",
          chat_id: ws.data.chatId,
          message: `list_sessions: ${sessions.length} session(s)`,
        })
        return
      }

      if (msg.type === "resume_session") {
        const chat0 = typeof msg.chatId === "string" ? msg.chatId : ws.data.chatId
        const mode0 = typeof msg.mode === "string" ? msg.mode : ws.data.mode
        const session0 = typeof msg.sessionId === "string" ? msg.sessionId : ws.data.sessionId
        const chatId = chat0.trim() || "operator"
        const mode = mode0.trim() || "chat"
        const sessionId = session0.trim() || chatId
        ws.data.chatId = chatId
        ws.data.mode = mode
        ws.data.sessionId = sessionId
        ws.data.configured = true
        const out = await this.runtime.resumeSession({
          chat_id: chatId,
          session_id: sessionId,
          mode,
        })

        if (!out.ok) {
          sendAgentEvent(ws, {
            type: "error",
            chat_id: chatId,
            message: out.error || "resume_session failed",
          })
          return
        }

        this.emitSessionConfigured(ws, chatId, sessionId, mode, out.result)
        return
      }

      if (msg.type === "resize_pty") {
        const out = await this.runtime.resizePty({
          chat_id: ws.data.chatId,
          process_id: msg.process_id,
          cols: msg.cols,
          rows: msg.rows,
        })

        if (out.ok) {
          return
        }

        sendAgentEvent(ws, {
          type: "error",
          chat_id: ws.data.chatId,
          message: out.error || "resize_pty failed",
        })
        return
      }

      const row = msg as { type?: unknown }
      const type0 = typeof row.type === "string" ? row.type : "unknown"

      sendAgentEvent(ws, {
        type: "warning",
        chat_id: ws.data.chatId,
        message: `Unsupported message: ${type0}`,
      })
    }

    const cur = ws.data.queue ?? null
    const base = cur ? cur.catch(() => {}) : Promise.resolve()
    const next = base.then(run)
    ws.data.queue = next
    await next.catch(() => {})
  }
}
