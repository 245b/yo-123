import { clean } from "../utils/text"
import { unifiedExecManager, workspaceRootForSession } from "../agent/unified-exec/manager"
import { runExecCommand, runWriteStdin } from "../agent/tool-orchestrator"
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
} from "../terminal/client"
import type { ToolDef, ToolRun } from "./deepseek"
import { helloSiteFiles, isHelloSiteIntent } from "./helpers-core"
import type { ToolResult } from "./helpers-core"
import { toolFailureRows } from "./helpers-diagnostics"
import { isLookupTerminalCommand, scopeSessionPath, sessionTag } from "./helpers-plan"

type TermEvent = {
  phase: "start" | "update" | "done" | "error"
  tool: string
  id: string
  args?: unknown
  result?: unknown
}

type LoggerLike = {
  write: (scope: "logs" | "transcripts", name: string, data: unknown) => Promise<unknown>
}

type CreateToolRuntimeInput = {
  termRuntime: boolean
  terminalOnly: boolean
  allowExec: boolean
  lookupIntent: boolean
  lookupKind: string
  fileBuildIntent: boolean
  query: string
  sid: string
  cid: string
  model: string
  logger: LoggerLike
  getEmitTerm: () => (evt: TermEvent) => void
}

const normalizeSearchQuery = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text1 = text0.replace(/\r/g, " ").replace(/\n/g, " ")
  const text2 = clean(text1)

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

    text = clean(text.slice(1, -1))

    if (!text) {
      break
    }
  }

  return text
}

export const createToolRuntime = (input: CreateToolRuntimeInput) => {
  const termRuntime = input.termRuntime
  const terminalOnly = input.terminalOnly
  const allowExec = input.allowExec
  const lookupIntent = input.lookupIntent
  const lookupKind = input.lookupKind
  const fileBuildIntent = input.fileBuildIntent
  const query = input.query
  const sid = input.sid
  const cid = input.cid
  const model = input.model
  const logger = input.logger
  const emitTerm = (evt: TermEvent) => input.getEmitTerm()(evt)

    const termTools: ToolDef[] = termRuntime
      ? [
          {
            type: "function",
            function: {
              name: "session_ensure",
              description: "Ensure a terminal session exists.",
              parameters: {
                type: "object",
                properties: {
                  sessionId: { type: "string", description: "Optional session id." },
                },
              },
            },
          },
          {
            type: "function",
            function: {
              name: "terminal_exec",
              description: "Execute a shell command in the terminal.",
              parameters: {
                type: "object",
                properties: {
                  sessionId: { type: "string", description: "Optional session id." },
                  command: { type: "string", description: "Shell command to run." },
                  timeoutMs: { type: "number", description: "Optional timeout in ms." },
                  maxChars: { type: "number", description: "Optional max output length." },
                  cwd: { type: "string", description: "Optional working directory." },
                  tty: { type: "boolean", description: "Use an interactive shell and keep process alive." },
                  process_id: { type: "string", description: "Optional existing process id for interactive shell." },
                },
                required: ["command"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "terminal_capture",
              description: "Capture recent terminal output.",
              parameters: {
                type: "object",
                properties: {
                  sessionId: { type: "string", description: "Optional session id." },
                  tailLines: { type: "number", description: "Lines of output to return." },
                },
              },
            },
          },
          {
            type: "function",
            function: {
              name: "terminal_send",
              description: "Send keystrokes to the terminal.",
              parameters: {
                type: "object",
                properties: {
                  process_id: { type: "string", description: "Interactive process id from terminal_exec tty mode." },
                  keys: { type: "string", description: "Keys to send." },
                  enter: { type: "boolean", description: "Send Enter after keys." },
                  yield_time_ms: { type: "number", description: "Wait window for collecting output after stdin write." },
                  maxChars: { type: "number", description: "Maximum output characters to return." },
                },
                required: ["process_id"],
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
      : []
    const runTool: ToolRun | null = termRuntime
      ? async (name, args, meta) => {
          const id0 = typeof meta?.id === "string" ? meta.id : ""
          const id = id0.trim() || "tool"
          const tool = name.trim()
          const numArg = (v: unknown) => {
            if (typeof v === "number" && Number.isFinite(v)) {
              return v
            }

            if (typeof v === "string") {
              const n0 = Number.parseInt(v, 10)
              return Number.isFinite(n0) ? n0 : undefined
            }

            return undefined
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
          const scoped = (raw: string) => scopeSessionPath(sid, raw)
          const callData = {
            ts: new Date().toISOString(),
            chatId: cid,
            sessionId: sid,
            model,
            tool,
            id,
            args,
          }

          emitTerm({ phase: "start", tool, id, args })
          await logger.write("logs", "tool_call", callData).catch(() => {})

          var result: unknown = { ok: false, error: "Unknown tool" }

          try {
            if (tool === "session_ensure") {
              const sessionId = typeof args.sessionId === "string" ? args.sessionId : sid
              result = { ok: true, sessionId, workdir: workspaceRootForSession(sessionId) }
            } else if (tool === "terminal_exec") {
              const command0 = typeof args.command === "string" ? args.command : ""
              var command = command0.trim()

              if (!command) {
                result = { ok: false, error: "Missing command" }
              } else {
                if (terminalOnly && allowExec && lookupIntent && lookupKind && !fileBuildIntent && !isLookupTerminalCommand(command)) {
                  const q0 = normalizeSearchQuery(query) || "research context"
                  const esc = q0.replace(/"/g, '\\"')
                  command = `mcp-search "${esc}"`
                }

                const sessionId = typeof args.sessionId === "string" ? args.sessionId : sid
                const timeoutMs = numArg(args.timeoutMs)
                const maxChars = numArg(args.maxChars)
                const cwd0 = typeof args.cwd === "string" ? args.cwd : ""
                const cwd = cwd0.trim() || "."
                const tty = args.tty === true
                const processId0 = typeof args.process_id === "string" ? args.process_id : ""
                const processId = processId0.trim() || undefined
                const out = await runExecCommand({
                  sessionId,
                  command,
                  workdir: cwd,
                  timeoutMs: typeof timeoutMs === "number" ? timeoutMs : undefined,
                  maxChars: typeof maxChars === "number" ? maxChars : undefined,
                  processId,
                  tty,
                })
                result = {
                  ok: true,
                  output: out.output,
                  exitCode: out.exitCode,
                  truncated: out.truncated,
                  processId: out.processId,
                  wallTimeMs: out.wallTimeMs,
                }
              }
            } else if (tool === "terminal_capture") {
              const sessionId = typeof args.sessionId === "string" ? args.sessionId : sid
              const tailLines = numArg(args.tailLines)
              const text = unifiedExecManager.capture(sessionId, tailLines)
              result = { ok: true, text }
            } else if (tool === "terminal_send") {
              const processId0 =
                typeof args.process_id === "string"
                  ? args.process_id
                  : typeof args.target_pane === "string"
                    ? args.target_pane
                    : ""
              const processId = processId0.trim()
              const keys = typeof args.keys === "string" ? args.keys : ""
              const enter = args.enter === true

              if (!processId) {
                result = {
                  ok: false,
                  error:
                    "Missing process_id. Start an interactive shell first with terminal_exec and tty=true, then call terminal_send with process_id.",
                }
              } else {
                const chars = `${keys}${enter ? "\n" : ""}`
                const yieldTimeMs = numArg(args.yield_time_ms)
                const maxChars = numArg(args.maxChars)
                var out = await runWriteStdin({
                  processId,
                  chars,
                  yieldTimeMs: typeof yieldTimeMs === "number" ? yieldTimeMs : undefined,
                  maxChars: typeof maxChars === "number" ? maxChars : undefined,
                })
                var usedProcessId = out.processId || processId
                var failed = false

                if (hasUnknownProcessError(out)) {
                  const recovered = await runExecCommand({
                    sessionId: sid,
                    command: "pwd",
                    workdir: ".",
                    timeoutMs: typeof yieldTimeMs === "number" ? yieldTimeMs : undefined,
                    maxChars: typeof maxChars === "number" ? maxChars : undefined,
                    tty: true,
                  })
                  const recoveredId0 = typeof recovered.processId === "string" ? recovered.processId : ""
                  const recoveredId = recoveredId0.trim()

                  if (!recoveredId) {
                    failed = true
                    result = {
                      ok: false,
                      error: `Unknown process_id: ${processId}. Automatic recovery failed to start a new interactive shell.`,
                    }
                  }

                  if (recoveredId) {
                    const replay = await runWriteStdin({
                      processId: recoveredId,
                      chars,
                      yieldTimeMs: typeof yieldTimeMs === "number" ? yieldTimeMs : undefined,
                      maxChars: typeof maxChars === "number" ? maxChars : undefined,
                    })
                    const replayText0 = typeof replay.output === "string" ? replay.output : ""
                    const replayText1 = replayText0.trim()
                    const replayHead = `Recovered stale process_id ${processId} by starting ${recoveredId}.`
                    const replayText = replayText1 ? `${replayHead}\n${replayText0}` : replayHead
                    out = { ...replay, output: replayText }
                    usedProcessId = recoveredId
                  }
                }

                if (!failed) {
                  result = {
                    ok: true,
                    output: out.output,
                    exitCode: out.exitCode,
                    truncated: out.truncated,
                    processId: usedProcessId,
                    wallTimeMs: out.wallTimeMs,
                  }
                }
              }
            } else if (tool === "fs_list") {
              const path0 = typeof args.path === "string" ? args.path : "."
              const path = scoped(path0 || ".")
              const recursive = args.recursive === true
              const maxEntries = numArg(args.max_entries)
              const maxDepth = numArg(args.max_depth)
              result = await fsList({ path, recursive, maxEntries, maxDepth })
            } else if (tool === "fs_stat") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()

              if (!pathRaw) {
                result = { ok: false, error: "Missing path" }
              } else {
                const path = scoped(pathRaw)
                result = await fsStat({ path })
              }
            } else if (tool === "fs_read") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()

              if (!pathRaw) {
                result = { ok: false, error: "Missing path" }
              } else {
                const path = scoped(pathRaw)
                const maxBytes = numArg(args.max_bytes)
                const startLine = numArg(args.start_line)
                const endLine = numArg(args.end_line)
                const binary = args.binary === true
                result = await fsRead({ path, maxBytes, startLine, endLine, binary })
              }
            } else if (tool === "fs_write") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()
              const content = typeof args.content === "string" ? args.content : ""

              if (!pathRaw) {
                result = { ok: false, error: "Missing path" }
              } else if (!content && args.content !== "") {
                result = { ok: false, error: "Missing content" }
              } else {
                const path = scoped(pathRaw)
                const atomic = args.atomic !== false
                const createParents = args.create_parents !== false
                result = await fsWrite({ path, content, atomic, createParents })
              }
            } else if (tool === "fs_move") {
              const src0 = typeof args.src === "string" ? args.src : ""
              const dst0 = typeof args.dst === "string" ? args.dst : ""
              const srcRaw = src0.trim()
              const dstRaw = dst0.trim()

              if (!srcRaw || !dstRaw) {
                result = { ok: false, error: "Missing src or dst" }
              } else {
                const src = scoped(srcRaw)
                const dst = scoped(dstRaw)
                const overwrite = args.overwrite === true
                result = await fsMove({ src, dst, overwrite })
              }
            } else if (tool === "fs_copy") {
              const src0 = typeof args.src === "string" ? args.src : ""
              const dst0 = typeof args.dst === "string" ? args.dst : ""
              const srcRaw = src0.trim()
              const dstRaw = dst0.trim()

              if (!srcRaw || !dstRaw) {
                result = { ok: false, error: "Missing src or dst" }
              } else {
                const src = scoped(srcRaw)
                const dst = scoped(dstRaw)
                const recursive = args.recursive !== false
                const overwrite = args.overwrite === true
                result = await fsCopy({ src, dst, recursive, overwrite })
              }
            } else if (tool === "fs_delete") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()

              if (!pathRaw) {
                result = { ok: false, error: "Missing path" }
              } else {
                const path = scoped(pathRaw)
                const recursive = args.recursive === true
                const toTrash = args.to_trash !== false
                result = await fsDelete({ path, recursive, toTrash })
              }
            } else if (tool === "fs_mkdir") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()

              if (!pathRaw) {
                result = { ok: false, error: "Missing path" }
              } else {
                const path = scoped(pathRaw)
                const parents = args.parents !== false
                result = await fsMkdir({ path, parents })
              }
            } else if (tool === "fs_purge") {
              const path0 = typeof args.path === "string" ? args.path.trim() : ""
              const path = path0 ? scoped(path0) : undefined
              const recursive = args.recursive !== false
              result = await fsPurge({ path, recursive })
            } else if (tool === "fs_apply_patch") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()
              const unifiedDiff = typeof args.unified_diff === "string" ? args.unified_diff : ""

              if (!pathRaw || !unifiedDiff) {
                result = { ok: false, error: "Missing path or unified_diff" }
              } else {
                const path = scoped(pathRaw)
                result = await fsApplyPatch({ path, unifiedDiff })
              }
            } else if (tool === "fs_replace_ranges") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()
              const ranges0 = Array.isArray(args.ranges) ? args.ranges : []
              const ranges = ranges0 as { start_line: number; end_line: number; content: string }[]

              if (!pathRaw || !ranges.length) {
                result = { ok: false, error: "Missing path or ranges" }
              } else {
                const path = scoped(pathRaw)
                result = await fsReplaceRanges({ path, ranges })
              }
            } else if (tool === "editor_open") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()

              if (!pathRaw) {
                result = { ok: false, error: "Missing path" }
              } else {
                const path = scoped(pathRaw)
                const editor = typeof args.editor === "string" ? args.editor : undefined
                const line = numArg(args.line)
                const col = numArg(args.col)
                const targetPane = typeof args.target_pane === "string" ? args.target_pane : undefined
                const sessionId0 = typeof args.sessionId === "string" ? args.sessionId : sid
                const sessionId = sessionTag(sessionId0)
                result = await editorOpen({ path, editor, line, col, targetPane, sessionId })
              }
            } else if (tool === "project_detect") {
              const root0 = typeof args.root === "string" ? args.root : ""
              const rootRaw = root0.trim()

              if (!rootRaw) {
                result = { ok: false, error: "Missing root" }
              } else {
                const root = scoped(rootRaw)
                result = await projectDetect({ root })
              }
            } else if (tool === "project_setup") {
              const root0 = typeof args.root === "string" ? args.root : ""
              const rootRaw = root0.trim()

              if (!rootRaw) {
                result = { ok: false, error: "Missing root" }
              } else {
                const root = scoped(rootRaw)
                result = await projectSetup({ root })
              }
            } else if (tool === "project_install") {
              const root0 = typeof args.root === "string" ? args.root : ""
              const rootRaw = root0.trim()

              if (!rootRaw) {
                result = { ok: false, error: "Missing root" }
              } else {
                const root = scoped(rootRaw)
                const locked = args.locked !== false
                const network = args.network !== false
                const hashes = args.hashes === true
                result = await projectInstall({ root, locked, network, hashes })
              }
            } else if (tool === "project_run") {
              const root0 = typeof args.root === "string" ? args.root : ""
              const rootRaw = root0.trim()
              const command0 = Array.isArray(args.command) ? args.command : []
              const command = command0.filter((item): item is string => typeof item === "string")

              if (!rootRaw || !command.length) {
                result = { ok: false, error: "Missing root or command" }
              } else {
                const root = scoped(rootRaw)
                const timeoutS = numArg(args.timeout_s)
                result = await projectRun({ root, command, timeoutS })
              }
            } else if (tool === "project_test") {
              const root0 = typeof args.root === "string" ? args.root : ""
              const rootRaw = root0.trim()

              if (!rootRaw) {
                result = { ok: false, error: "Missing root" }
              } else {
                const root = scoped(rootRaw)
                const timeoutS = numArg(args.timeout_s)
                result = await projectTest({ root, timeoutS })
              }
            }
          } catch (err) {
            const row = err && typeof err === "object" ? (err as { message?: unknown } | null) : null
            const m0 = typeof row?.message === "string" ? row.message : ""
            const m = m0.trim() || "Tool execution failed"
            result = { ok: false, error: m }
          }

          const ok = result && typeof result === "object" && (result as { ok?: unknown }).ok === true
          emitTerm({ phase: ok ? "done" : "error", tool, id, args, result })
          await logger
            .write("logs", "tool_result", {
              ...callData,
              result,
            })
            .catch(() => {})

          return result
        }
      : null

  return { termTools, runTool }
}

type RunHelloFallbackInput = {
  terminalOnly: boolean
  allowExec: boolean
  runTool: ToolRun | null
  query: string
}

export const runHelloSiteFallback = async (input: RunHelloFallbackInput) => {
  const terminalOnly = input.terminalOnly
  const allowExec = input.allowExec
  const runTool = input.runTool
  const query = input.query

      if (!terminalOnly || !allowExec || !runTool || !isHelloSiteIntent(query)) {
        return null
      }

      const files = helloSiteFiles()
      const results: ToolResult[] = []
      const nextId = () => {
        const rid0 = globalThis.crypto?.randomUUID?.() ?? ""
        return rid0 || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
      }

      for (var i = 0; i < files.length; i++) {
        const file = files[i]

        if (!file) {
          continue
        }

        const input = {
          path: file.path,
          content: file.content,
          atomic: true,
          create_parents: true,
        }
        const out = await runTool("fs_write", input, { id: nextId() })
        const ok = !!(out && typeof out === "object" && (out as { ok?: unknown }).ok === true)
        results.push({ tool: "fs_write", ok, input, result: out })
      }

      const listInput = {
        path: ".",
        recursive: true,
        max_depth: 2,
        max_entries: 200,
      }
      const listOut = await runTool("fs_list", listInput, { id: nextId() })
      const listOk = !!(listOut && typeof listOut === "object" && (listOut as { ok?: unknown }).ok === true)
      results.push({ tool: "fs_list", ok: listOk, input: listInput, result: listOut })

      const seen = new Set<string>()
      const listRow = (listOut && typeof listOut === "object" ? listOut : null) as { result?: unknown } | null
      const listResult = (listRow?.result && typeof listRow.result === "object" ? listRow.result : null) as {
        entries?: unknown
      } | null
      const entries = Array.isArray(listResult?.entries) ? listResult.entries : []

      for (var i = 0; i < entries.length; i++) {
        const row = (entries[i] && typeof entries[i] === "object" ? entries[i] : null) as {
          rel?: unknown
          path?: unknown
        } | null
        const rel0 = typeof row?.rel === "string" ? row.rel : ""
        const path0 = typeof row?.path === "string" ? row.path : ""
        const rel = clean(rel0).replace(/\\/g, "/")
        const path = clean(path0).replace(/\\/g, "/")

        if (rel) {
          seen.add(rel)
        }

        if (path) {
          seen.add(path)
          const tail = path.split("/").pop() ?? ""

          if (tail) {
            seen.add(tail)
          }
        }
      }

      const hasFile = (name: string) => {
        const target = clean(name).replace(/\\/g, "/")

        if (!target) {
          return false
        }

        if (seen.has(target)) {
          return true
        }

        const list = Array.from(seen)

        for (var i = 0; i < list.length; i++) {
          const row = list[i] ?? ""

          if (row.endsWith(`/${target}`)) {
            return true
          }
        }

        return false
      }
      const names = files.map((row) => row.path)
      const confirmed: string[] = []
      const missing: string[] = []

      for (var i = 0; i < names.length; i++) {
        const name = names[i] ?? ""

        if (!name) {
          continue
        }

        if (hasFile(name)) {
          confirmed.push(name)
          continue
        }

        missing.push(name)
      }

      const failed = toolFailureRows(results)
      const allOk = failed.length === 0
      const filesText = names.map((name) => `- ${name}`).join("\n")
      const confirmedText = confirmed.length ? confirmed.map((name) => `- ${name}`).join("\n") : "- none"
      var text = ""

      if (allOk && !missing.length) {
        text = [
          "Created a great-looking Hello World website in the active session folder using separate files.",
          "Files created:",
          filesText,
          "Verified with fs_list:",
          confirmedText,
          "Open index.html in the active session folder to preview the page.",
        ].join("\n")
      }

      if (!text && allOk) {
        text = [
          "Created a great-looking Hello World website in the active session folder using separate files.",
          "Files created:",
          filesText,
          "fs_list completed, but file-name confirmation was partial.",
          "Open index.html in the active session folder to preview the page.",
        ].join("\n")
      }

      if (!text) {
        const failText = failed.length
          ? failed.map((row) => `- ${row.tool}${row.input ? ` (${row.input})` : ""}: ${row.error}`).join("\n")
          : "- Unknown file operation failure."
        text = [
          "I could not finish creating the Hello World website in the active session folder because one or more file operations failed.",
          "Failed operations:",
          failText,
        ].join("\n")
      }

      const ctx = {
        type: "file_build_fallback",
        source: "deterministic",
        files: names,
        confirmed,
        missing,
        failed,
      }
      return { text, ctx, results }
}
