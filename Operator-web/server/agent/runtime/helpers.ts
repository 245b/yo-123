import { runExecCommand, runWriteStdin } from "../tool-orchestrator"
import type { AgentChatMessage, AgentUserInputQuestion, AgentWsServerEvent } from "../types"
import { normalizeMessages } from "../history"
import { unifiedExecManager, workspaceRootForSession } from "../unified-exec/manager"
import type { Msg } from "../../types"
import type { ToolDef, ToolRun } from "../../chat/deepseek"
import {
  editorOpen,
  fsApplyPatch,
  fsCopy,
  fsDelete,
  fsList,
  fsMkdir,
  fsMove,
  fsPurge,
  fsRead,
  fsReplaceRanges,
  fsStat,
  fsWrite,
  projectDetect,
  projectInstall,
  projectRun,
  projectSetup,
  projectTest,
} from "../../terminal/client"
import { scopeSessionPath, sessionTag } from "../../chat/helpers-plan"
import {
  approvalPolicyFrom,
  gateMutationTool,
  gateTerminalSend,
  sandboxModeFrom,
  shouldPromptCommand,
  evalExecPolicyForCommand,
  evalExecPolicyForTokens,
} from "../policy/gate"
import { toolGate } from "./tools/tool-gate"
import { isMutatingTool, ToolRegistry } from "./tools/tool-registry"
import { approvalCacheKey, approveWithCache } from "./tools/tool-orchestrator"

export const chunkText = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim() ? text0 : ""

  if (!text) {
    return []
  }

  const out: string[] = []

  for (var i = 0; i < text.length; i += 900) {
    out.push(text.slice(i, i + 900))
  }

  return out
}

export const toNum = (raw: unknown) => {
  const n0 = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : NaN

  if (!Number.isFinite(n0)) {
    return undefined
  }

  return Math.floor(n0)
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

const clipText = (raw: string, max: number) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text1 = text0.replace(/\s+/g, " ").trim()

  if (!text1) {
    return ""
  }

  if (text1.length <= max) {
    return text1
  }

  return `${text1.slice(0, max)}...`
}

const scrubReasoningText = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text1 = text0.trim()

  if (!text1) {
    return ""
  }

  if (!text1.includes("reasoning_content")) {
    return text1
  }

  return text1.replace(/\breasoning_content\b/g, "reasoning_content_omitted")
}

export const latestUserText = (messages: AgentChatMessage[]) => {
  const list = Array.isArray(messages) ? messages : []

  for (var i = list.length - 1; i >= 0; i--) {
    const row = list[i]

    if (!row || row.role !== "user") {
      continue
    }

    const text0 = typeof row.content === "string" ? row.content : ""
    const text = text0.trim()

    if (!text) {
      continue
    }

    return text
  }

  return ""
}

const lowerText = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  return text0.toLowerCase()
}

const normalizeSearchQuery = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text1 = text0.replace(/\r/g, " ").replace(/\n/g, " ")
  const text2 = text1.replace(/\s+/g, " ").trim()

  if (!text2) {
    return ""
  }

  var text = text2

  for (;;) {
    const first = text[0] || ""
    const last = text[text.length - 1] || ""
    const pair = (first === `"` && last === `"`) || (first === `'` && last === `'`)

    if (!pair) {
      break
    }

    if (text.length < 2) {
      break
    }

    text = text.slice(1, -1).trim()

    if (!text) {
      break
    }
  }

  return text
}

const hasWord = (raw: string, keys: string[]) => {
  const text = lowerText(raw)

  if (!text) {
    return false
  }

  for (var i = 0; i < keys.length; i++) {
    const key0 = keys[i]
    const key = typeof key0 === "string" ? key0.trim().toLowerCase() : ""

    if (!key) {
      continue
    }

    if (text.includes(key)) {
      return true
    }
  }

  return false
}

const isMcpSearchCommand = (raw: string) => {
  const cmd = lowerText(raw).trim()

  if (!cmd) {
    return false
  }

  if (cmd === "mcp-search") {
    return true
  }

  return cmd.startsWith("mcp-search ")
}

const isCurlSearchCommand = (raw: string) => {
  const cmd = lowerText(raw).trim()

  if (!cmd) {
    return false
  }

  const head = cmd.startsWith("curl ") || cmd.startsWith("wget ") || cmd.startsWith("http ") || cmd.startsWith("httpie ")

  if (!head) {
    return false
  }

  if (hasWord(cmd, ["duckduckgo", "google.", "bing.", "search.brave.com", "youtube.com/results", "site:youtube.com"])) {
    return true
  }

  if (!cmd.includes("http://") && !cmd.includes("https://")) {
    return false
  }

  if (cmd.includes("/search?")) {
    return true
  }

  if (cmd.includes(" search?")) {
    return true
  }

  return cmd.includes("/results?")
}

const asMcpSearchCommand = (raw: string) => {
  const text0 = normalizeSearchQuery(raw)
  const text1 = text0.slice(0, 400)
  const text = text1 || "research context"
  const query = text.replace(/"/g, '\\"')
  const low = lowerText(text)

  if (hasWord(low, ["youtube.com/watch", "youtu.be/", "youtube.com", "youtube", "transcript", "captions"])) {
    return `mcp-search --provider yt --max 5 "${query}"`
  }

  if (hasWord(low, ["news", "headlines", "top stories", "breaking", "current events", "latest", "today"])) {
    return `mcp-search --provider ddg --max 8 "${query}"`
  }

  if (hasWord(low, ["docs", "documentation", "api", "reference", "sdk", "library", "package", "guide", "manual"])) {
    return `mcp-search --provider ctx7 --max 6 "${query}"`
  }

  return `mcp-search --provider auto --max 6 "${query}"`
}

export const recentConversation = (messages: AgentChatMessage[], maxRows: number) => {
  const list = Array.isArray(messages) ? messages : []
  const out: Array<{ id: string; text: string }> = []
  const start = Math.max(0, list.length - maxRows)

  for (var i = start; i < list.length; i++) {
    const row = list[i]

    if (!row) {
      continue
    }

    if (row.role !== "user" && row.role !== "assistant") {
      continue
    }

    const text0 = typeof row.content === "string" ? row.content : ""
    const text1 = scrubReasoningText(text0)
    const text = clipText(text1, 360)

    if (!text) {
      continue
    }

    const id = `message:${i + 1}`
    out.push({ id, text: `${row.role}: ${text}` })
  }

  return out
}

export const summarizeToolEvidence = (id: string, name: string, args: Record<string, unknown>, out: unknown) => {
  const id0 = typeof id === "string" ? id : ""
  const callId = id0.trim()
  const tool0 = typeof name === "string" ? name : ""
  const tool = tool0.trim()

  if (!tool || !callId) {
    return null
  }

  const argsRaw = JSON.stringify(args ?? {})
  const argsText = clipText(scrubReasoningText(argsRaw), 260) || "{}"
  const outRaw = typeof out === "string" ? out : JSON.stringify(out)
  const outText = clipText(scrubReasoningText(outRaw), 420) || "empty result"
  return {
    id: `tool:${callId}`,
    detail: `tool=${tool}; args=${argsText}; result=${outText}`,
  }
}

export const withSystemInstructions = (messages: AgentChatMessage[], instructions: string) => {
  const list = normalizeMessages(messages)
  const inst0 = typeof instructions === "string" ? instructions : ""
  const inst = inst0.trim()

  if (!inst) {
    return list
  }

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row || row.role !== "system") {
      continue
    }

    const text0 = typeof row.content === "string" ? row.content : ""
    const text = text0.trim()
    const merged = text ? `${text}\n\n${inst}` : inst
    list[i] = { role: "system", content: merged }
    return list
  }

  const prefixed: AgentChatMessage = {
    role: "system",
    content: inst,
  }
  return [prefixed, ...list]
}

export const toModelMessages = (messages: AgentChatMessage[]) => {
  const out: Msg[] = []
  const list = Array.isArray(messages) ? messages : []

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row) {
      continue
    }

    const text0 = typeof row.content === "string" ? row.content : ""
    const text = text0.trim()

    if (!text) {
      continue
    }

    if (row.role === "system" || row.role === "user" || row.role === "assistant") {
      out.push({ role: row.role, content: text })
      continue
    }

    out.push({ role: "assistant", content: `Tool output:\n${text}` })
  }

  return out
}

const emitExecOutput = (
  emit: (payload: AgentWsServerEvent) => void,
  chatId: string,
  turnId: string,
  callId: string,
  processId: string | undefined,
  raw: string,
) => {
  const chunks = chunkText(raw)

  for (var i = 0; i < chunks.length; i++) {
    const chunk = chunks[i] ?? ""

    if (!chunk) {
      continue
    }

    emit({
      type: "exec_command_output_delta",
      chat_id: chatId,
      turn_id: turnId,
      call_id: callId,
      process_id: processId,
      chunk,
    })
  }
}

export const toolDefinitions: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "session_ensure",
      description: "Ensure a terminal session exists for this chat.",
      parameters: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Optional session id override." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "terminal_exec",
      description: "Run a shell command in the VNC workspace.",
      parameters: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Optional session id override." },
          command: { type: "string", description: "Shell command to execute." },
          timeoutMs: { type: "number", description: "Timeout in milliseconds." },
          maxChars: { type: "number", description: "Maximum output characters." },
          cwd: { type: "string", description: "Working directory relative to session root." },
          tty: { type: "boolean", description: "Keep command attached to interactive shell." },
          process_id: { type: "string", description: "Existing process id for interactive shell reuse." },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "terminal_send",
      description: "Send stdin to an existing interactive terminal process.",
      parameters: {
        type: "object",
        properties: {
          process_id: { type: "string", description: "Interactive process id." },
          keys: { type: "string", description: "Text or control keys to send." },
          enter: { type: "boolean", description: "Append newline after keys." },
          yield_time_ms: { type: "number", description: "Wait time to collect output." },
          maxChars: { type: "number", description: "Maximum output characters." },
        },
        required: ["process_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "terminal_capture",
      description: "Capture recent terminal output for a session.",
      parameters: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Optional session id override." },
          tailLines: { type: "number", description: "Tail line count." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "terminate_command",
      description: "Terminate a running interactive process by id.",
      parameters: {
        type: "object",
        properties: {
          process_id: { type: "string", description: "Interactive process id." },
        },
        required: ["process_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_user_input",
      description: "Request structured user input and wait for a response.",
      parameters: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                header: { type: "string" },
                question: { type: "string" },
                is_other: { type: "boolean" },
                is_secret: { type: "boolean" },
                options: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      description: { type: "string" },
                    },
                    required: ["label", "description"],
                  },
                },
              },
              required: ["id", "header", "question"],
            },
          },
          timeout_ms: { type: "number" },
        },
        required: ["questions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_list",
      description: "List files and folders.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to list." },
          recursive: { type: "boolean", description: "Recurse into subdirectories." },
          max_entries: { type: "number", description: "Maximum entries to return." },
          max_depth: { type: "number", description: "Maximum depth when recursive." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_stat",
      description: "Stat a file or folder.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to stat." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_read",
      description: "Read a file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to read." },
          max_bytes: { type: "number", description: "Max bytes to read." },
          start_line: { type: "number", description: "Start line (1-based)." },
          end_line: { type: "number", description: "End line (1-based)." },
          binary: { type: "boolean", description: "Return base64 data." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_write",
      description: "Write a file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to write." },
          content: { type: "string", description: "File content." },
          atomic: { type: "boolean", description: "Use atomic write." },
          create_parents: { type: "boolean", description: "Create parent directories." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_move",
      description: "Move or rename a file or folder.",
      parameters: {
        type: "object",
        properties: {
          src: { type: "string", description: "Source path." },
          dst: { type: "string", description: "Destination path." },
          overwrite: { type: "boolean", description: "Overwrite destination if it exists." },
        },
        required: ["src", "dst"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_copy",
      description: "Copy a file or folder.",
      parameters: {
        type: "object",
        properties: {
          src: { type: "string", description: "Source path." },
          dst: { type: "string", description: "Destination path." },
          recursive: { type: "boolean", description: "Copy folders recursively." },
          overwrite: { type: "boolean", description: "Overwrite destination if it exists." },
        },
        required: ["src", "dst"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_delete",
      description: "Delete a file or folder.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to delete." },
          recursive: { type: "boolean", description: "Delete folders recursively." },
          to_trash: { type: "boolean", description: "Move to trash instead of permanent delete." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_mkdir",
      description: "Create a directory.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to create." },
          parents: { type: "boolean", description: "Create parent directories." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_purge",
      description: "Permanently delete a file/folder or purge trash.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to purge (optional)." },
          recursive: { type: "boolean", description: "Delete folders recursively." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_apply_patch",
      description: "Apply a unified diff to a file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to patch." },
          unified_diff: { type: "string", description: "Unified diff content." },
        },
        required: ["path", "unified_diff"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fs_replace_ranges",
      description: "Replace line ranges in a file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to edit." },
          ranges: {
            type: "array",
            items: {
              type: "object",
              properties: {
                start_line: { type: "number", description: "Start line (1-based)." },
                end_line: { type: "number", description: "End line (1-based)." },
                content: { type: "string", description: "Replacement content." },
              },
              required: ["start_line", "end_line", "content"],
            },
          },
        },
        required: ["path", "ranges"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "editor_open",
      description: "Open a file in an editor pane.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to open." },
          editor: { type: "string", description: "Editor binary name." },
          line: { type: "number", description: "Line to jump to." },
          col: { type: "number", description: "Column to jump to." },
          target_pane: { type: "string", description: "Target tmux pane." },
          sessionId: { type: "string", description: "Optional session id." },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_detect",
      description: "Detect project type at a root.",
      parameters: {
        type: "object",
        properties: {
          root: { type: "string", description: "Project root path." },
        },
        required: ["root"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_setup",
      description: "Set up project environment.",
      parameters: {
        type: "object",
        properties: {
          root: { type: "string", description: "Project root path." },
        },
        required: ["root"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_install",
      description: "Install project dependencies.",
      parameters: {
        type: "object",
        properties: {
          root: { type: "string", description: "Project root path." },
          locked: { type: "boolean", description: "Require lockfiles." },
          network: { type: "boolean", description: "Allow network access." },
          hashes: { type: "boolean", description: "Require hashes for Python installs." },
        },
        required: ["root"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_run",
      description: "Run a command in the project.",
      parameters: {
        type: "object",
        properties: {
          root: { type: "string", description: "Project root path." },
          command: { type: "array", items: { type: "string" }, description: "Command argv." },
          timeout_s: { type: "number", description: "Timeout in seconds." },
        },
        required: ["root", "command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "project_test",
      description: "Run project tests.",
      parameters: {
        type: "object",
        properties: {
          root: { type: "string", description: "Project root path." },
          timeout_s: { type: "number", description: "Timeout in seconds." },
        },
        required: ["root"],
      },
    },
  },
]

export type RuntimeTerm = {
  id: string
  tool: string
  input: string
  output: string
  status: "running" | "done" | "failed"
}

type ToolRunnerState = {
  chatId: string
  sessionId: string
  messages: AgentChatMessage[]
  approvalPolicy?: string
  sandboxMode?: string
}

type CreateToolRunnerInput = {
  state: ToolRunnerState
  turnId: string
  nextId: () => string
  ensureTerm: (id: string) => RuntimeTerm | null
  emitEvent: (payload: AgentWsServerEvent) => void
  requestApproval?: (input: {
    callId: string
    tool: string
    command?: string
    cwd?: string
    reason?: string
    details?: Record<string, unknown>
  }) => Promise<boolean>
  requestUserInput?: (input: {
    callId: string
    questions: AgentUserInputQuestion[]
    timeoutMs?: number
  }) => Promise<Record<string, { answers: string[] }> | null>
  verifyMutation?: (input: { tool: string; sessionId: string }) => Promise<void>
}

const toolOk = (raw: unknown) => {
  const row = raw && typeof raw === "object" ? (raw as { ok?: unknown } | null) : null

  if (!row) {
    return false
  }

  return row.ok === true
}

export const createToolRunner = (input: CreateToolRunnerInput): ToolRun => {
  const state = input.state
  const turnId = input.turnId
  const nextId = input.nextId
  const ensureTerm = input.ensureTerm
  const emitEvent = input.emitEvent
  const requestApproval = typeof input.requestApproval === "function" ? input.requestApproval : null
  const requestUserInput = typeof input.requestUserInput === "function" ? input.requestUserInput : null
  const verifyMutation = typeof input.verifyMutation === "function" ? input.verifyMutation : null
  const runVerifyMutation = async (tool: string, sessionId: string, out: unknown) => {
    if (!verifyMutation) {
      return
    }

    if (!toolOk(out)) {
      return
    }

    await verifyMutation({ tool, sessionId })
  }
  const scoped = (sessionId: string, raw: string) => {
    const sid = sessionTag(sessionId)
    return scopeSessionPath(sid, raw)
  }
  const approvalPolicy = () => approvalPolicyFrom(state.approvalPolicy)
  const sandboxMode = () => sandboxModeFrom(state.sandboxMode)
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
  const regOn = flagOn(process.env.OPERATOR_TOOL_REGISTRY_V2 || "", false)
  const gateMut = async <T>(tool: string, run: () => Promise<T>) => {
    if (!regOn) {
      return run()
    }

    if (!isMutatingTool(tool)) {
      return run()
    }

    return toolGate.run(run)
  }
  const approveTool = async (row: {
    callId: string
    tool: string
    reason: string
    details?: Record<string, unknown>
    command?: string
    cwd?: string
  }) => {
    const ap = approvalPolicy()

    if (!regOn) {
      if (ap === "never") {
        return { approved: true, auto: true }
      }

      if (!requestApproval) {
        return { approved: false, auto: false, unavailable: true }
      }

      const approved = await requestApproval({
        callId: row.callId,
        tool: row.tool,
        reason: row.reason,
        details: row.details,
        command: row.command,
        cwd: row.cwd,
      })
      return { approved: approved === true, auto: false }
    }

    const key = approvalCacheKey({ tool: row.tool, command: row.command, cwd: row.cwd })
    return approveWithCache({
      chatId: state.chatId,
      sessionId: state.sessionId,
      policy: ap,
      requestApproval,
      callId: row.callId,
      tool: row.tool,
      reason: row.reason,
      details: row.details,
      command: row.command,
      cwd: row.cwd,
      cacheKey: key,
    })
  }
  const approveMutation = async (callId: string, tool: string, paths: string[]) => {
    const gate = gateMutationTool({
      tool,
      paths,
      approvalPolicy: approvalPolicy(),
      sandboxMode: sandboxMode(),
    })

    if (gate.decision === "allow") {
      return { ok: true as const, gate }
    }

    if (gate.decision === "forbidden") {
      return {
        ok: false as const,
        gate,
        out: { ok: false, error: gate.reason || "Tool blocked", errorCode: gate.errorCode, details: gate.details },
      }
    }

    const asked = await approveTool({
      callId,
      tool,
      reason: gate.reason || "Mutation tool requested approval before execution.",
      details: gate.details,
    })

    if (asked.approved) {
      return { ok: true as const, gate }
    }

    if (asked.unavailable) {
      return {
        ok: false as const,
        gate,
        out: { ok: false, error: "Approval required but unavailable", errorCode: "APPROVAL_REQUIRED", details: gate.details },
      }
    }

    return {
      ok: false as const,
      gate,
      out: { ok: false, error: "Tool call denied by user", errorCode: "APPROVAL_DENIED", details: gate.details },
    }
  }
  const toQuestions = (raw: unknown) => {
    const list = Array.isArray(raw) ? raw : []
    const out: AgentUserInputQuestion[] = []

    for (var i = 0; i < list.length; i++) {
      const row = (list[i] && typeof list[i] === "object" ? list[i] : null) as Record<string, unknown> | null

      if (!row) {
        continue
      }

      const id0 = typeof row.id === "string" ? row.id : ""
      const header0 = typeof row.header === "string" ? row.header : ""
      const question0 = typeof row.question === "string" ? row.question : ""
      const id = id0.trim()
      const header = header0.trim()
      const question = question0.trim()

      if (!id || !header || !question) {
        continue
      }

      const options0 = Array.isArray(row.options) ? row.options : []
      const options: { label: string; description: string }[] = []

      for (var oi = 0; oi < options0.length; oi++) {
        const item = (options0[oi] && typeof options0[oi] === "object" ? options0[oi] : null) as Record<string, unknown> | null

        if (!item) {
          continue
        }

        const label0 = typeof item.label === "string" ? item.label : ""
        const description0 = typeof item.description === "string" ? item.description : ""
        const label = label0.trim()
        const description = description0.trim()

        if (!label || !description) {
          continue
        }

        options.push({ label, description })
      }

      const entry: AgentUserInputQuestion = {
        id,
        header,
        question,
      }

      if (row.is_other === true) {
        entry.is_other = true
      }

      if (row.is_secret === true) {
        entry.is_secret = true
      }

      if (options.length) {
        entry.options = options
      }

      out.push(entry)
    }

    return out
  }
  const stableText = (raw: unknown) => {
    if (typeof raw === "string") {
      return raw
    }

    const seen = new WeakSet<object>()
    const text0 = JSON.stringify(raw ?? {}, (_key, value) => {
      if (typeof value === "bigint") {
        return value.toString()
      }

      const row = value && typeof value === "object" ? (value as object) : null

      if (!row) {
        return value
      }

      if (seen.has(row)) {
        return "[Circular]"
      }

      seen.add(row)
      return value
    })
    const text = typeof text0 === "string" ? text0 : ""
    return text
  }
  const toolInputText = (raw: Record<string, unknown>) => {
    const text0 = stableText(raw)
    const text1 = scrubReasoningText(text0)
    const text = clipText(text1, 1600)

    if (!text) {
      return "{}"
    }

    return text
  }
  const toolOutputText = (raw: unknown) => {
    const text0 = stableText(raw)
    const text1 = scrubReasoningText(text0)
    const text = typeof text1 === "string" ? text1 : ""
    const trimmed = text.trim()

    if (!trimmed) {
      return "done"
    }

    if (text.length <= 64000) {
      return text
    }

    return `${text.slice(0, 64000)}...`
  }
  const beginVisibleTool = (tool: string, callId: string, args: Record<string, unknown>) => {
    const inputText = toolInputText(args)
    const term = ensureTerm(callId)

    if (term) {
      term.tool = tool
      term.input = inputText
      term.output = "running..."
      term.status = "running"
    }

    emitEvent({
      type: "exec_command_begin",
      chat_id: state.chatId,
      turn_id: turnId,
      call_id: callId,
      command: `${tool} ${inputText}`,
      tool_name: tool,
    })
  }
  const endVisibleTool = (tool: string, callId: string, out: unknown) => {
    const ok = toolOk(out)
    const outputText = toolOutputText(out)
    const term = ensureTerm(callId)

    if (term) {
      term.tool = tool
      term.output = outputText
      term.status = ok ? "done" : "failed"
    }

    emitExecOutput(emitEvent, state.chatId, turnId, callId, undefined, outputText)
    emitEvent({
      type: "exec_command_end",
      chat_id: state.chatId,
      turn_id: turnId,
      call_id: callId,
      exit_code: ok ? 0 : 1,
      output: outputText,
    })
  }
  const runVisibleTool = async (tool: string, callId: string, args: Record<string, unknown>, run: () => Promise<unknown>) => {
    beginVisibleTool(tool, callId, args)
    const out = await run()
    endVisibleTool(tool, callId, out)
    return out
  }

  const runTool = async (name: string, args: Record<string, unknown>, meta: { id: string }) => {
    const tool0 = typeof name === "string" ? name : ""
    const tool = tool0.trim()
    const callId0 = typeof meta?.id === "string" ? meta.id : ""
    const callId = callId0.trim() || nextId()

    if (tool === "session_ensure") {
      return runVisibleTool(tool, callId, args, async () => {
        const sid0 = typeof args.sessionId === "string" ? args.sessionId : state.sessionId
        const sid = sid0.trim() || state.sessionId
        state.sessionId = sid
        return {
          ok: true,
          sessionId: sid,
          workdir: workspaceRootForSession(sid),
        }
      })
    }

    if (tool === "terminal_capture") {
      return runVisibleTool(tool, callId, args, async () => {
        const sid0 = typeof args.sessionId === "string" ? args.sessionId : state.sessionId
        const sid = sid0.trim() || state.sessionId
        const tailLines = toNum(args.tailLines)
        const text = unifiedExecManager.capture(sid, tailLines)
        return {
          ok: true,
          text,
        }
      })
    }

    if (tool === "terminate_command") {
      return gateMut(tool, () =>
        runVisibleTool(tool, callId, args, async () => {
          const processId0 = typeof args.process_id === "string" ? args.process_id : ""
          const processId = processId0.trim()

          if (!processId) {
            return { ok: false, error: "Missing process_id" }
          }

          const killed = unifiedExecManager.terminate(processId)

          if (killed) {
            return { ok: true, terminated: true, processId }
          }

          return {
            ok: true,
            terminated: false,
            processId,
            alreadyGone: true,
            note: "Process already exited; treated as idempotent terminate.",
          }
        }),
      )
    }

    if (tool === "request_user_input") {
      return runVisibleTool(tool, callId, args, async () => {
        const questions = toQuestions(args.questions)

        if (!questions.length) {
          return { ok: false, error: "Missing questions" }
        }

        if (!requestUserInput) {
          return { ok: false, error: "request_user_input runtime bridge unavailable" }
        }

        const timeoutMs = toNum(args.timeout_ms)
        const answers = await requestUserInput({
          callId,
          questions,
          timeoutMs,
        })

        if (!answers) {
          return { ok: false, error: "Missing request_user_input response" }
        }

        return {
          ok: true,
          answers,
        }
      })
    }

    if (tool === "terminal_send") {
      const processId0 = typeof args.process_id === "string" ? args.process_id : ""
      const processId = processId0.trim()
      const keys = typeof args.keys === "string" ? args.keys : ""
      const enter = args.enter === true
      const chars = `${keys}${enter ? "\n" : ""}`
      const yieldTimeMs = toNum(args.yield_time_ms)
      const maxChars = toNum(args.maxChars)

      if (!processId) {
        return { ok: false, error: "Missing process_id" }
      }

      const gate = await gateTerminalSend({
        chatId: state.chatId,
        sessionId: state.sessionId,
        chars,
        approvalPolicy: approvalPolicy(),
        emit: emitEvent,
      })

      if (gate.decision === "forbidden") {
        return { ok: false, error: gate.reason || "terminal_send blocked", errorCode: gate.errorCode, details: gate.details }
      }

      if (gate.decision === "prompt") {
        const d = gate.details && typeof gate.details === "object"
          ? (gate.details as { line?: unknown } | null)
          : null
        const line0 = typeof d?.line === "string" ? d.line : ""
        const line = line0.trim()
        const asked = await approveTool({
          callId,
          tool,
          reason: gate.reason || "terminal_send requested approval before execution.",
          details: gate.details,
          command: line || undefined,
        })

        if (!asked.approved) {
          const code = asked.unavailable ? "APPROVAL_REQUIRED" : "APPROVAL_DENIED"
          const msg = asked.unavailable ? "Approval required but unavailable" : "Tool call denied by user"
          return { ok: false, error: msg, errorCode: code, details: gate.details }
        }
      }

      return gateMut(tool, async () => {
        const term = ensureTerm(callId)

        if (term) {
          term.tool = tool
          term.input = `${term.input}${chars}`
          term.status = "running"
        }

        emitEvent({
          type: "terminal_interaction",
          chat_id: state.chatId,
          turn_id: turnId,
          call_id: callId,
          process_id: processId,
          stdin: chars,
        })
        var sendOut = await runWriteStdin({
          processId,
          chars,
          yieldTimeMs,
          maxChars,
          requestId: callId,
        })
        var usedProcessId = sendOut.processId || processId

        if (hasUnknownProcessError(sendOut)) {
          emitEvent({
            type: "warning",
            chat_id: state.chatId,
            message: `Stale process_id ${processId} detected; attempting terminal recovery.`,
          })
          const recovered = await runExecCommand({
            sessionId: state.sessionId,
            command: "pwd",
            workdir: ".",
            timeoutMs: yieldTimeMs,
            maxChars,
            tty: true,
            requestId: callId,
          })
          const recoveredId0 = typeof recovered.processId === "string" ? recovered.processId : ""
          const recoveredId = recoveredId0.trim()

          if (!recoveredId) {
            const failText = `Unknown process_id: ${processId}. Automatic recovery failed to start a new interactive shell.`

            if (term) {
              term.output = failText
              term.status = "failed"
            }

            emitExecOutput(emitEvent, state.chatId, turnId, callId, processId, failText)
            emitEvent({
              type: "exec_command_end",
              chat_id: state.chatId,
              turn_id: turnId,
              call_id: callId,
              process_id: processId,
              exit_code: -1,
              output: failText,
              wall_time_ms: sendOut.wallTimeMs,
            })
            return {
              ok: false,
              error: failText,
              processId,
            }
          }

          const replay = await runWriteStdin({
            processId: recoveredId,
            chars,
            yieldTimeMs,
            maxChars,
            requestId: callId,
          })
          const replayText0 = typeof replay.output === "string" ? replay.output : ""
          const replayText1 = replayText0.trim()
          const replayHead = `Recovered stale process_id ${processId} by starting ${recoveredId}.`
          const replayText = replayText1 ? `${replayHead}\n${replayText0}` : replayHead
          sendOut = { ...replay, output: replayText }
          usedProcessId = recoveredId
        }

        if (term) {
          term.output = sendOut.output
          const stillRunning = typeof sendOut.exitCode !== "number" && !!(usedProcessId && usedProcessId.trim())
          term.status = stillRunning ? "running" : typeof sendOut.exitCode === "number" && sendOut.exitCode !== 0 ? "failed" : "done"
        }

        emitExecOutput(emitEvent, state.chatId, turnId, callId, usedProcessId, sendOut.output)
        emitEvent({
          type: "exec_command_end",
          chat_id: state.chatId,
          turn_id: turnId,
          call_id: callId,
          process_id: usedProcessId,
          exit_code: sendOut.exitCode,
          output: sendOut.output,
          wall_time_ms: sendOut.wallTimeMs,
        })
        return {
          ok: true,
          processId: usedProcessId,
          output: sendOut.output,
          exitCode: sendOut.exitCode,
          wallTimeMs: sendOut.wallTimeMs,
          running: typeof sendOut.exitCode !== "number" && !!(usedProcessId && usedProcessId.trim()),
          backgrounded: sendOut.backgrounded === true,
          background_reason: sendOut.background_reason,
        }
      })
    }

    if (tool === "fs_list") {
      return runVisibleTool(tool, callId, args, async () => {
        const path0 = typeof args.path === "string" ? args.path : "."
        const path = scoped(state.sessionId, path0 || ".")
        const recursive = args.recursive === true
        const maxEntries = toNum(args.max_entries)
        const maxDepth = toNum(args.max_depth)
        return fsList({ path, recursive, maxEntries, maxDepth })
      })
    }

    if (tool === "fs_stat") {
      return runVisibleTool(tool, callId, args, async () => {
        const path0 = typeof args.path === "string" ? args.path : ""
        const pathRaw = path0.trim()

        if (!pathRaw) {
          return { ok: false, error: "Missing path" }
        }

        const path = scoped(state.sessionId, pathRaw)
        return fsStat({ path })
      })
    }

    if (tool === "fs_read") {
      return runVisibleTool(tool, callId, args, async () => {
        const path0 = typeof args.path === "string" ? args.path : ""
        const pathRaw = path0.trim()

        if (!pathRaw) {
          return { ok: false, error: "Missing path" }
        }

        const path = scoped(state.sessionId, pathRaw)
        const maxBytes = toNum(args.max_bytes)
        const startLine = toNum(args.start_line)
        const endLine = toNum(args.end_line)
        const binary = args.binary === true
        return fsRead({ path, maxBytes, startLine, endLine, binary })
      })
    }

    if (tool === "fs_write") {
      const path0 = typeof args.path === "string" ? args.path : ""
      const pathRaw = path0.trim()
      const content = typeof args.content === "string" ? args.content : ""

      if (!pathRaw) {
        return runVisibleTool(tool, callId, args, async () => ({ ok: false, error: "Missing path" }))
      }

      if (!content && args.content !== "") {
        return runVisibleTool(tool, callId, args, async () => ({ ok: false, error: "Missing content" }))
      }

      const approved = await approveMutation(callId, tool, [pathRaw])

      if (!approved.ok) {
        return runVisibleTool(tool, callId, args, async () => approved.out)
      }

      return gateMut(tool, () =>
        runVisibleTool(tool, callId, args, async () => {
          const path = scoped(state.sessionId, pathRaw)
          const atomic = args.atomic !== false
          const createParents = args.create_parents !== false
          const out = await fsWrite({ path, content, atomic, createParents, requestId: callId })
          await runVerifyMutation(tool, state.sessionId, out)
          return out
        }),
      )
    }

    if (tool === "fs_move") {
      const src0 = typeof args.src === "string" ? args.src : ""
      const dst0 = typeof args.dst === "string" ? args.dst : ""
      const srcRaw = src0.trim()
      const dstRaw = dst0.trim()

      if (!srcRaw || !dstRaw) {
        return runVisibleTool(tool, callId, args, async () => ({ ok: false, error: "Missing src or dst" }))
      }

      const approved = await approveMutation(callId, tool, [srcRaw, dstRaw])

      if (!approved.ok) {
        return runVisibleTool(tool, callId, args, async () => approved.out)
      }

      return gateMut(tool, () =>
        runVisibleTool(tool, callId, args, async () => {
          const src = scoped(state.sessionId, srcRaw)
          const dst = scoped(state.sessionId, dstRaw)
          const overwrite = args.overwrite === true
          const out = await fsMove({ src, dst, overwrite, requestId: callId })
          await runVerifyMutation(tool, state.sessionId, out)
          return out
        }),
      )
    }

    if (tool === "fs_copy") {
      const src0 = typeof args.src === "string" ? args.src : ""
      const dst0 = typeof args.dst === "string" ? args.dst : ""
      const srcRaw = src0.trim()
      const dstRaw = dst0.trim()

      if (!srcRaw || !dstRaw) {
        return runVisibleTool(tool, callId, args, async () => ({ ok: false, error: "Missing src or dst" }))
      }

      const approved = await approveMutation(callId, tool, [srcRaw, dstRaw])

      if (!approved.ok) {
        return runVisibleTool(tool, callId, args, async () => approved.out)
      }

      return gateMut(tool, () =>
        runVisibleTool(tool, callId, args, async () => {
          const src = scoped(state.sessionId, srcRaw)
          const dst = scoped(state.sessionId, dstRaw)
          const recursive = args.recursive !== false
          const overwrite = args.overwrite === true
          const out = await fsCopy({ src, dst, recursive, overwrite, requestId: callId })
          await runVerifyMutation(tool, state.sessionId, out)
          return out
        }),
      )
    }

    if (tool === "fs_delete") {
      const path0 = typeof args.path === "string" ? args.path : ""
      const pathRaw = path0.trim()

      if (!pathRaw) {
        return runVisibleTool(tool, callId, args, async () => ({ ok: false, error: "Missing path" }))
      }

      const approved = await approveMutation(callId, tool, [pathRaw])

      if (!approved.ok) {
        return runVisibleTool(tool, callId, args, async () => approved.out)
      }

      return gateMut(tool, () =>
        runVisibleTool(tool, callId, args, async () => {
          const path = scoped(state.sessionId, pathRaw)
          const recursive = args.recursive === true
          const toTrash = args.to_trash !== false
          const out = await fsDelete({ path, recursive, toTrash, requestId: callId })
          await runVerifyMutation(tool, state.sessionId, out)
          return out
        }),
      )
    }

    if (tool === "fs_mkdir") {
      const path0 = typeof args.path === "string" ? args.path : ""
      const pathRaw = path0.trim()

      if (!pathRaw) {
        return runVisibleTool(tool, callId, args, async () => ({ ok: false, error: "Missing path" }))
      }

      const approved = await approveMutation(callId, tool, [pathRaw])

      if (!approved.ok) {
        return runVisibleTool(tool, callId, args, async () => approved.out)
      }

      return gateMut(tool, () =>
        runVisibleTool(tool, callId, args, async () => {
          const path = scoped(state.sessionId, pathRaw)
          const parents = args.parents !== false
          const out = await fsMkdir({ path, parents, requestId: callId })
          await runVerifyMutation(tool, state.sessionId, out)
          return out
        }),
      )
    }

    if (tool === "fs_purge") {
      const path0 = typeof args.path === "string" ? args.path : ""
      const path1 = path0.trim()
      const approved = await approveMutation(callId, tool, path1 ? [path1] : [])

      if (!approved.ok) {
        return runVisibleTool(tool, callId, args, async () => approved.out)
      }

      return gateMut(tool, () =>
        runVisibleTool(tool, callId, args, async () => {
          const path = path1 ? scoped(state.sessionId, path1) : undefined
          const recursive = args.recursive !== false
          const out = await fsPurge({ path, recursive, requestId: callId })
          await runVerifyMutation(tool, state.sessionId, out)
          return out
        }),
      )
    }

    if (tool === "fs_apply_patch") {
      const path0 = typeof args.path === "string" ? args.path : ""
      const pathRaw = path0.trim()
      const unifiedDiff = typeof args.unified_diff === "string" ? args.unified_diff : ""

      if (!pathRaw || !unifiedDiff) {
        return runVisibleTool(tool, callId, args, async () => ({ ok: false, error: "Missing path or unified_diff" }))
      }

      const approved = await approveMutation(callId, tool, [pathRaw])

      if (!approved.ok) {
        return runVisibleTool(tool, callId, args, async () => approved.out)
      }

      return gateMut(tool, () =>
        runVisibleTool(tool, callId, args, async () => {
          const path = scoped(state.sessionId, pathRaw)
          const out = await fsApplyPatch({ path, unifiedDiff, requestId: callId })
          await runVerifyMutation(tool, state.sessionId, out)
          return out
        }),
      )
    }

    if (tool === "fs_replace_ranges") {
      const path0 = typeof args.path === "string" ? args.path : ""
      const pathRaw = path0.trim()
      const ranges0 = Array.isArray(args.ranges) ? args.ranges : []
      const ranges = ranges0 as { start_line: number; end_line: number; content: string }[]

      if (!pathRaw || !ranges.length) {
        return runVisibleTool(tool, callId, args, async () => ({ ok: false, error: "Missing path or ranges" }))
      }

      const approved = await approveMutation(callId, tool, [pathRaw])

      if (!approved.ok) {
        return runVisibleTool(tool, callId, args, async () => approved.out)
      }

      return gateMut(tool, () =>
        runVisibleTool(tool, callId, args, async () => {
          const path = scoped(state.sessionId, pathRaw)
          const out = await fsReplaceRanges({ path, ranges, requestId: callId })
          await runVerifyMutation(tool, state.sessionId, out)
          return out
        }),
      )
    }

    if (tool === "editor_open") {
      return gateMut(tool, () =>
        runVisibleTool(tool, callId, args, async () => {
          const path0 = typeof args.path === "string" ? args.path : ""
          const pathRaw = path0.trim()

          if (!pathRaw) {
            return { ok: false, error: "Missing path" }
          }

          const path = scoped(state.sessionId, pathRaw)
          const editor = typeof args.editor === "string" ? args.editor : undefined
          const line = toNum(args.line)
          const col = toNum(args.col)
          const targetPane = typeof args.target_pane === "string" ? args.target_pane : undefined
          const sessionId0 = typeof args.sessionId === "string" ? args.sessionId : state.sessionId
          const sessionId = sessionTag(sessionId0)
          return editorOpen({ path, editor, line, col, targetPane, sessionId })
        }),
      )
    }

    if (tool === "project_detect") {
      return runVisibleTool(tool, callId, args, async () => {
        const root0 = typeof args.root === "string" ? args.root : ""
        const rootRaw = root0.trim()

        if (!rootRaw) {
          return { ok: false, error: "Missing root" }
        }

        const root = scoped(state.sessionId, rootRaw)
        return projectDetect({ root })
      })
    }

    if (tool === "project_setup") {
      const root0 = typeof args.root === "string" ? args.root : ""
      const rootRaw = root0.trim()

      if (!rootRaw) {
        return runVisibleTool(tool, callId, args, async () => ({ ok: false, error: "Missing root" }))
      }

      const approved = await approveMutation(callId, tool, [rootRaw])

      if (!approved.ok) {
        return runVisibleTool(tool, callId, args, async () => approved.out)
      }

      return gateMut(tool, () =>
        runVisibleTool(tool, callId, args, async () => {
          const root = scoped(state.sessionId, rootRaw)
          const out = await projectSetup({ root, requestId: callId })
          await runVerifyMutation(tool, state.sessionId, out)
          return out
        }),
      )
    }

    if (tool === "project_install") {
      const root0 = typeof args.root === "string" ? args.root : ""
      const rootRaw = root0.trim()

      if (!rootRaw) {
        return runVisibleTool(tool, callId, args, async () => ({ ok: false, error: "Missing root" }))
      }

      const approved = await approveMutation(callId, tool, [rootRaw])

      if (!approved.ok) {
        return runVisibleTool(tool, callId, args, async () => approved.out)
      }

      return gateMut(tool, () =>
        runVisibleTool(tool, callId, args, async () => {
          const root = scoped(state.sessionId, rootRaw)
          const locked = args.locked !== false
          const network = args.network !== false
          const hashes = args.hashes === true
          const out = await projectInstall({ root, locked, network, hashes, requestId: callId })
          await runVerifyMutation(tool, state.sessionId, out)
          return out
        }),
      )
    }

    if (tool === "project_run") {
      const root0 = typeof args.root === "string" ? args.root : ""
      const rootRaw = root0.trim()
      const command0 = Array.isArray(args.command) ? args.command : []
      const command: string[] = []

      for (var i = 0; i < command0.length; i++) {
        const row = command0[i]

        if (typeof row !== "string") {
          continue
        }

        command.push(row)
      }

      if (!rootRaw || !command.length) {
        return runVisibleTool(tool, callId, args, async () => ({ ok: false, error: "Missing root or command" }))
      }

      const ap = approvalPolicy()
      const evaluated = await evalExecPolicyForTokens({
        chatId: state.chatId,
        sessionId: state.sessionId,
        tokens: command,
        emit: emitEvent,
      })

      if (evaluated.decision === "forbidden") {
        return runVisibleTool(tool, callId, args, async () => ({
          ok: false,
          error: "Policy forbids this command",
          errorCode: "POLICY_FORBIDDEN",
          details: evaluated.details,
        }))
      }

      const needs = shouldPromptCommand(ap, evaluated.decision)

      if (needs) {
        const approved = await approveTool({
          callId,
          tool,
          reason: "Command requested approval before execution.",
          details: { kind: "project_run", execpolicy: evaluated.details, root: rootRaw, command },
          command: command.join(" "),
          cwd: rootRaw,
        })

        if (!approved.approved) {
          const code = approved.unavailable ? "APPROVAL_REQUIRED" : "APPROVAL_DENIED"
          const msg = approved.unavailable ? "Approval required but unavailable" : "Tool call denied by user"
          return runVisibleTool(tool, callId, args, async () => ({ ok: false, error: msg, errorCode: code, details: evaluated.details }))
        }
      }

      return gateMut(tool, () =>
        runVisibleTool(tool, callId, args, async () => {
          const root = scoped(state.sessionId, rootRaw)
          const timeoutS = toNum(args.timeout_s)
          return projectRun({ root, command, timeoutS, requestId: callId })
        }),
      )
    }

    if (tool === "project_test") {
      return gateMut(tool, () =>
        runVisibleTool(tool, callId, args, async () => {
          const root0 = typeof args.root === "string" ? args.root : ""
          const rootRaw = root0.trim()

          if (!rootRaw) {
            return { ok: false, error: "Missing root" }
          }

          const root = scoped(state.sessionId, rootRaw)
          const timeoutS = toNum(args.timeout_s)
          return projectTest({ root, timeoutS })
        }),
      )
    }

    if (tool !== "terminal_exec") {
      return runVisibleTool(tool, callId, args, async () => ({ ok: false, error: `Unknown tool: ${tool}` }))
    }

    const command0 = typeof args.command === "string" ? args.command : ""
    var command = command0.trim()

    if (!command) {
      return { ok: false, error: "Missing command" }
    }

    const userText = latestUserText(state.messages)
    const forceMcp = isCurlSearchCommand(command) && !isMcpSearchCommand(command)

    if (forceMcp) {
      command = asMcpSearchCommand(userText)
    }

    const sid0 = typeof args.sessionId === "string" ? args.sessionId : state.sessionId
    const sid = sid0.trim() || state.sessionId
    const workdir0 = typeof args.cwd === "string" ? args.cwd : ""
    const workdir = workdir0.trim() || "."

    const ap = approvalPolicy()
    const evaluated = await evalExecPolicyForCommand({
      chatId: state.chatId,
      sessionId: sid,
      command,
      emit: emitEvent,
    })

    if (evaluated.decision === "forbidden") {
      const d = evaluated.details as { justification?: unknown } | null
      const j0 = typeof d?.justification === "string" ? d.justification : ""
      const j = j0.trim()
      const fail = j ? `Command blocked by policy: ${j}` : "Command blocked by policy"
      const term = ensureTerm(callId)

      if (term) {
        term.tool = tool
        term.input = command
        term.output = fail
        term.status = "failed"
      }

      emitEvent({
        type: "exec_command_begin",
        chat_id: state.chatId,
        turn_id: turnId,
        call_id: callId,
        command,
        process_id: undefined,
      })
      emitExecOutput(emitEvent, state.chatId, turnId, callId, undefined, fail)
      emitEvent({
        type: "exec_command_end",
        chat_id: state.chatId,
        turn_id: turnId,
        call_id: callId,
        process_id: undefined,
        exit_code: 126,
        output: fail,
        wall_time_ms: 0,
      })
      return { ok: false, error: fail, errorCode: "POLICY_FORBIDDEN", details: evaluated.details }
    }

    const wantsApproval = shouldPromptCommand(ap, evaluated.decision)

    if (wantsApproval) {
      const approved = await approveTool({
        callId,
        tool,
        command,
        cwd: workdir,
        reason: "Command requested approval before execution.",
        details: evaluated.details,
      })

      if (!approved.approved) {
        const code = approved.unavailable ? "APPROVAL_REQUIRED" : "APPROVAL_DENIED"
        const msg = approved.unavailable ? "Approval required but unavailable" : "Tool call denied by user"
        const term = ensureTerm(callId)

        if (term) {
          term.tool = tool
          term.input = command
          term.output = msg
          term.status = "failed"
        }

        emitEvent({
          type: "exec_command_begin",
          chat_id: state.chatId,
          turn_id: turnId,
          call_id: callId,
          command,
          process_id: undefined,
        })
        emitExecOutput(emitEvent, state.chatId, turnId, callId, undefined, msg)
        emitEvent({
          type: "exec_command_end",
          chat_id: state.chatId,
          turn_id: turnId,
          call_id: callId,
          process_id: undefined,
          exit_code: 1,
          output: msg,
          wall_time_ms: 0,
        })
        return { ok: false, error: msg, errorCode: code, details: evaluated.details }
      }
    }

    return gateMut(tool, async () => {
      const term = ensureTerm(callId)

      if (term) {
        term.tool = tool
        term.input = command
        term.output = "running..."
        term.status = "running"
      }
      const timeoutMs = toNum(args.timeoutMs)
      const maxChars = toNum(args.maxChars)
      const tty = args.tty === true
      const processId0 = typeof args.process_id === "string" ? args.process_id : ""
      const processId = processId0.trim() || undefined

      emitEvent({
        type: "exec_command_begin",
        chat_id: state.chatId,
        turn_id: turnId,
        call_id: callId,
        command,
        process_id: processId,
      })
      var streamed = false
      const out = await runExecCommand(
        {
          sessionId: sid,
          command,
          workdir,
          timeoutMs,
          maxChars,
          processId,
          tty,
          requestId: callId,
        },
        (chunk, nextProcessId) => {
          streamed = true

          if (term) {
            term.output = `${term.output}${chunk}`
            term.status = "running"
          }

          emitEvent({
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
        emitExecOutput(emitEvent, state.chatId, turnId, callId, out.processId || processId, out.output)
      }

      if (term) {
        term.output = out.output
        const stillRunning =
          typeof out.exitCode !== "number" && !!((out.processId || processId) && `${out.processId || processId}`.trim())
        term.status = stillRunning ? "running" : typeof out.exitCode === "number" && out.exitCode !== 0 ? "failed" : "done"
      }

      emitEvent({
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
        processId: out.processId || processId,
        output: out.output,
        exitCode: out.exitCode,
        wallTimeMs: out.wallTimeMs,
        truncated: out.truncated,
        running: typeof out.exitCode !== "number" && !!((out.processId || processId) && `${out.processId || processId}`.trim()),
        backgrounded: out.backgrounded === true,
        background_reason: out.background_reason,
      }
    })
  }

  if (!regOn) {
    return runTool
  }

  const reg = new ToolRegistry(null)
  const defs = toolDefinitions

  for (var i = 0; i < defs.length; i++) {
    const row = defs[i]
    const name0 = typeof row?.function?.name === "string" ? row.function.name : ""
    const tool = name0.trim()

    if (!tool) {
      continue
    }

    reg.register(tool, {
      run: async (inv) => runTool(inv.name, inv.args, inv.meta),
    })
  }

  return (name, args, meta) => reg.dispatch(name, args, meta)
}


