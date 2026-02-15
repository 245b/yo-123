export const TERM_AGENT_V1 = {
  health: "/v1/health",
  ready: "/v1/ready",
  sessionEnsure: "/v1/session/ensure",
  terminal: {
    open: "/v1/terminal/open",
    send: "/v1/terminal/send",
    capture: "/v1/terminal/capture",
    exec: "/v1/terminal/exec",
    resize: "/v1/terminal/resize",
    terminate: "/v1/terminal/terminate",
  },
  fs: {
    list: "/v1/fs/list",
    stat: "/v1/fs/stat",
    read: "/v1/fs/read",
    write: "/v1/fs/write",
    move: "/v1/fs/move",
    copy: "/v1/fs/copy",
    delete: "/v1/fs/delete",
    mkdir: "/v1/fs/mkdir",
    purge: "/v1/fs/purge",
    applyPatch: "/v1/fs/apply_patch",
    replaceRanges: "/v1/fs/replace_ranges",
  },
  editor: {
    open: "/v1/editor/open",
  },
  project: {
    detect: "/v1/project/detect",
    setup: "/v1/project/setup",
    install: "/v1/project/install",
    run: "/v1/project/run",
    test: "/v1/project/test",
  },
} as const

export type TermAgentOpMeta = {
  id: string
  ts: string
}

export type TermAgentOk<T> = {
  ok: true
  op: TermAgentOpMeta
  result: T
  warnings: string[]
}

export type TermAgentFail = {
  ok: false
  error: string
  errorCode?: string
  details?: unknown
}

export type TermAgentEntryInfo = {
  path: string
  rel: string
  name: string
  exists: boolean
  type?: "dir" | "file" | "other"
  size?: number
  mtime?: string
  mode?: string
}

export type TermAgentFsListResult = {
  path: string
  rel: string
  entries: TermAgentEntryInfo[]
  count: number
  truncated: boolean
}

export type TermAgentFsWriteResult = {
  path: string
  bytes: number
  before: TermAgentEntryInfo
  after: TermAgentEntryInfo
}

export type TermAgentFsMoveResult = {
  src: string
  dst: string
  before: TermAgentEntryInfo
  after: TermAgentEntryInfo
}

export type TermAgentFsCopyResult = {
  src: string
  dst: string
  after: TermAgentEntryInfo
}

export type TermAgentTerminalExecResponse = {
  output: string
  exitCode: number
  truncated?: boolean
}

export type TermAgentTerminalCaptureResponse = {
  text: string
}

export type TermAgentTerminalOpenResponse = {
  ok: true
  process_id: string
  target_pane: string
  sessionId: string
  cwd: string
}

export type TermAgentTerminalSendResponse = {
  ok: true
}

export type TermAgentTerminalResizeResponse = {
  ok: true
  process_id: string
  target_pane: string
  cols: number
  rows: number
}

export type TermAgentTerminalTerminateResponse = {
  ok: true
  process_id: string
  terminated: boolean
}

export type TermAgentSessionEnsureRequest = {
  sessionId: string
}

export type TermAgentTerminalOpenRequest = {
  sessionId: string
  cwd?: string
  cols?: number
  rows?: number
}

export type TermAgentTerminalSendRequest = {
  sessionId: string
  keys?: string
  enter?: boolean
  target_pane?: string
}

export type TermAgentTerminalCaptureRequest = {
  sessionId: string
  tailLines?: number
  target_pane?: string
}

export type TermAgentTerminalExecRequest = {
  sessionId: string
  command: string
  timeoutMs?: number
  maxChars?: number
  cwd?: string
  target_pane?: string
}

export type TermAgentTerminalResizeRequest = {
  sessionId: string
  process_id: string
  cols?: number
  rows?: number
}

export type TermAgentTerminalTerminateRequest = {
  sessionId: string
  process_id: string
}

export type TermAgentFsListRequest = {
  sessionId: string
  path: string
  recursive?: boolean
  max_entries?: number
  max_depth?: number
}

export type TermAgentFsStatRequest = {
  sessionId: string
  path: string
}

export type TermAgentFsReadRequest = {
  sessionId: string
  path: string
  max_bytes?: number
  start_line?: number
  end_line?: number
  binary?: boolean
}

export type TermAgentFsWriteRequest = {
  sessionId: string
  path: string
  content: string
  atomic?: boolean
  create_parents?: boolean
}

export type TermAgentFsMoveRequest = {
  sessionId: string
  src: string
  dst: string
  overwrite?: boolean
}

export type TermAgentFsCopyRequest = {
  sessionId: string
  src: string
  dst: string
  recursive?: boolean
  overwrite?: boolean
}

export type TermAgentFsDeleteRequest = {
  sessionId: string
  path: string
  recursive?: boolean
  to_trash?: boolean
}

export type TermAgentFsMkdirRequest = {
  sessionId: string
  path: string
  parents?: boolean
}

export type TermAgentFsPurgeRequest = {
  sessionId: string
  path?: string
  recursive?: boolean
}

export type TermAgentFsApplyPatchRequest = {
  sessionId: string
  path: string
  unified_diff: string
}

export type TermAgentReplaceRange = {
  start_line: number
  end_line: number
  content: string
}

export type TermAgentFsReplaceRangesRequest = {
  sessionId: string
  path: string
  ranges: TermAgentReplaceRange[]
}

export type TermAgentEditorOpenRequest = {
  sessionId: string
  path: string
  editor?: string
  line?: number
  col?: number
  target_pane?: string
}

export type TermAgentEditorOpenResult = {
  path: string
  editor: string
  target_pane?: string
}

export type TermAgentProjectDetectRequest = {
  sessionId: string
  root: string
}

export type TermAgentProjectDetectResult = {
  type: string
  manager: string
  root: string
  warnings: string[]
}

export type TermAgentProjectSetupRequest = {
  sessionId: string
  root: string
}

export type TermAgentProjectSetupResult = {
  type: string
  manager: string
  root: string
  venv?: string
}

export type TermAgentProjectInstallRequest = {
  sessionId: string
  root: string
  locked?: boolean
  network?: boolean
  hashes?: boolean
}

export type TermAgentProjectInstallResult = {
  type: string
  manager: string
  root: string
  command: string[]
  exitCode: number
  stdout: string
  stderr: string
}

export type TermAgentProjectRunRequest = {
  sessionId: string
  root: string
  command: string[]
  timeout_s?: number
}

export type TermAgentProjectRunResult = {
  root: string
  command: string[]
  exitCode: number
  stdout: string
  stderr: string
}

export type TermAgentProjectTestRequest = {
  sessionId: string
  root: string
  timeout_s?: number
}

export type TermAgentProjectTestResult = {
  type: string
  root: string
  command: string[]
  exitCode: number
  stdout: string
  stderr: string
}
