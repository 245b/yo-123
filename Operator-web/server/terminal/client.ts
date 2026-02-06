import { clean } from "../utils/text"

type TermBase = { ok: boolean; error?: string }
type TermOp = { id?: string; ts?: string }
type TermObj = Record<string, unknown>
type TermOpOut<T> = TermBase & { op?: TermOp; result?: T; warnings?: string[] }

export type TermEnsureOut = TermBase & { sessionId?: string }
export type TermExecOut = TermBase & { output?: string; exitCode?: number; truncated?: boolean }
export type TermCaptureOut = TermBase & { text?: string }
export type TermSendOut = TermBase
export type TermToolOut = TermOpOut<TermObj>

const envVal = (key: string) => {
  const v0 = process.env[key] ?? ""
  const v1 = typeof v0 === "string" ? v0 : ""
  return v1.trim()
}

const isPlaceholder = (raw: string) => {
  const t0 = clean(raw)
  const t = t0.toLowerCase()

  if (!t) {
    return false
  }

  if (t === "replace_me" || t === "replaceme") {
    return true
  }

  if (t === "disabled" || t === "none") {
    return true
  }

  if (t === "unset" || t === "null") {
    return true
  }

  return false
}

const normBase = (raw: string) => {
  const t = clean(raw)

  if (!t) {
    return ""
  }

  if (t.endsWith("/")) {
    return t.slice(0, -1)
  }

  return t
}

const numFrom = (v: unknown, def: number, min: number, max: number) => {
  const n0 = typeof v === "number" ? v : typeof v === "string" ? Number.parseInt(v, 10) : 0
  const n1 = Number.isFinite(n0) ? Math.floor(n0) : 0

  if (!n1) {
    return def
  }

  if (n1 < min) {
    return min
  }

  if (n1 > max) {
    return max
  }

  return n1
}

const termCfg = () => {
  const url0 = envVal("TERM_AGENT_URL")
  const url1 = isPlaceholder(url0) ? "" : url0
  const ws0 = envVal("WORKSPACE_TERM_AGENT")
  const ws1 = isPlaceholder(ws0) ? "" : ws0
  const base0 = url1 || ws1 || "http://workspace:7682"
  const base = normBase(base0)
  const tok0 = envVal("TERM_AGENT_TOKEN")
  const token = isPlaceholder(tok0) ? "" : tok0
  const raw0 = envVal("TERM_AGENT_TIMEOUT_MS") || envVal("REQUEST_TIMEOUT_MS")
  const timeoutMs = numFrom(raw0, 20000, 1000, 120000)
  const sessionId = envVal("TERM_SESSION_ID") || "operator"
  return { base, token, timeoutMs, sessionId }
}

const buildUrl = (base: string, path: string) => {
  if (!base) {
    return ""
  }

  if (path.startsWith("/")) {
    return `${base}${path}`
  }

  return `${base}/${path}`
}

const request = async (path: string, body: Record<string, unknown>, timeoutMs?: number) => {
  const cfg = termCfg()

  if (!cfg.base) {
    return { ok: false, error: "TERM_AGENT_URL not set", data: null as unknown }
  }

  if (!cfg.token) {
    return { ok: false, error: "Missing TERM_AGENT_TOKEN", data: null as unknown }
  }

  const url = buildUrl(cfg.base, path)
  const ms = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : cfg.timeoutMs
  const sig = AbortSignal.timeout(ms)
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-term-agent-token": cfg.token,
    },
    body: JSON.stringify(body),
    signal: sig,
  }).catch(() => null)

  if (!res) {
    const msg = sig.aborted ? "Terminal request timed out" : "Terminal request failed"
    return { ok: false, error: msg, data: null as unknown }
  }

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null

  if (!res.ok) {
    const err0 = typeof json?.error === "string" ? json.error : ""
    const err = clean(err0)
    return { ok: false, error: err || `Terminal error (${res.status})`, data: json }
  }

  return { ok: true, error: "", data: json }
}

const asObj = (v: unknown) => (v && typeof v === "object" ? (v as TermObj) : null)

const opOut = (res: { ok: boolean; error?: string; data?: unknown }, fallback: string): TermToolOut => {
  if (!res.ok) {
    return { ok: false, error: res.error || fallback }
  }

  const row = asObj(res.data)

  if (!row) {
    return { ok: false, error: fallback }
  }

  const ok = row.ok === true

  if (!ok) {
    const err0 = typeof row.error === "string" ? row.error : ""
    const err = clean(err0)
    return { ok: false, error: err || fallback }
  }

  return row as TermToolOut
}

export const sessionEnsure = async (sessionId?: string): Promise<TermEnsureOut> => {
  const cfg = termCfg()
  const sid = clean(sessionId || cfg.sessionId)
  const res = await request("/v1/session/ensure", { sessionId: sid })

  if (!res.ok) {
    return { ok: false, error: res.error || "Session ensure failed" }
  }

  const row = (res.data && typeof res.data === "object" ? res.data : null) as { sessionId?: unknown } | null
  const out = typeof row?.sessionId === "string" ? row.sessionId : sid
  return { ok: true, sessionId: clean(out) || sid }
}

export const terminalExec = async (args: {
  sessionId?: string
  command: string
  timeoutMs?: number
  maxChars?: number
  cwd?: string
  targetPane?: string
}): Promise<TermExecOut> => {
  const cfg = termCfg()
  const sid = clean(args.sessionId || cfg.sessionId)
  const res = await request(
    "/v1/terminal/exec",
    {
      sessionId: sid,
      command: args.command,
      timeoutMs: args.timeoutMs,
      maxChars: args.maxChars,
      cwd: args.cwd,
      target_pane: args.targetPane,
    },
    args.timeoutMs,
  )

  if (!res.ok) {
    return { ok: false, error: res.error || "Terminal exec failed" }
  }

  const row = (res.data && typeof res.data === "object" ? res.data : null) as {
    output?: unknown
    exitCode?: unknown
    truncated?: unknown
  } | null
  const output = typeof row?.output === "string" ? row.output : ""
  const exitCode = typeof row?.exitCode === "number" ? row.exitCode : undefined
  const truncated = row?.truncated === true ? true : undefined
  return { ok: true, output, exitCode, truncated }
}

export const terminalCapture = async (args: {
  sessionId?: string
  tailLines?: number
  targetPane?: string
}): Promise<TermCaptureOut> => {
  const cfg = termCfg()
  const sid = clean(args.sessionId || cfg.sessionId)
  const tail = typeof args.tailLines === "number" && args.tailLines > 0 ? Math.floor(args.tailLines) : 200
  const res = await request("/v1/terminal/capture", { sessionId: sid, tailLines: tail, target_pane: args.targetPane })

  if (!res.ok) {
    return { ok: false, error: res.error || "Terminal capture failed" }
  }

  const row = (res.data && typeof res.data === "object" ? res.data : null) as { text?: unknown } | null
  const text = typeof row?.text === "string" ? row.text : ""
  return { ok: true, text }
}

export const terminalSend = async (args: {
  sessionId?: string
  keys?: string
  enter?: boolean
  targetPane?: string
}): Promise<TermSendOut> => {
  const cfg = termCfg()
  const sid = clean(args.sessionId || cfg.sessionId)
  const keys = typeof args.keys === "string" ? args.keys : ""
  const enter = args.enter === true
  const res = await request("/v1/terminal/send", { sessionId: sid, keys, enter, target_pane: args.targetPane })

  if (!res.ok) {
    return { ok: false, error: res.error || "Terminal send failed" }
  }

  return { ok: true }
}

export const fsList = async (args: {
  path: string
  recursive?: boolean
  maxEntries?: number
  maxDepth?: number
}): Promise<TermToolOut> => {
  const res = await request("/v1/fs/list", {
    path: args.path,
    recursive: args.recursive === true,
    max_entries: args.maxEntries,
    max_depth: args.maxDepth,
  })
  return opOut(res, "FS list failed")
}

export const fsStat = async (args: { path: string }): Promise<TermToolOut> => {
  const res = await request("/v1/fs/stat", { path: args.path })
  return opOut(res, "FS stat failed")
}

export const fsRead = async (args: {
  path: string
  maxBytes?: number
  startLine?: number
  endLine?: number
  binary?: boolean
}): Promise<TermToolOut> => {
  const res = await request("/v1/fs/read", {
    path: args.path,
    max_bytes: args.maxBytes,
    start_line: args.startLine,
    end_line: args.endLine,
    binary: args.binary === true,
  })
  return opOut(res, "FS read failed")
}

export const fsWrite = async (args: {
  path: string
  content: string
  atomic?: boolean
  createParents?: boolean
}): Promise<TermToolOut> => {
  const res = await request("/v1/fs/write", {
    path: args.path,
    content: args.content,
    atomic: args.atomic !== false,
    create_parents: args.createParents !== false,
  })
  return opOut(res, "FS write failed")
}

export const fsMove = async (args: { src: string; dst: string; overwrite?: boolean }): Promise<TermToolOut> => {
  const res = await request("/v1/fs/move", {
    src: args.src,
    dst: args.dst,
    overwrite: args.overwrite === true,
  })
  return opOut(res, "FS move failed")
}

export const fsCopy = async (args: {
  src: string
  dst: string
  recursive?: boolean
  overwrite?: boolean
}): Promise<TermToolOut> => {
  const res = await request("/v1/fs/copy", {
    src: args.src,
    dst: args.dst,
    recursive: args.recursive !== false,
    overwrite: args.overwrite === true,
  })
  return opOut(res, "FS copy failed")
}

export const fsDelete = async (args: {
  path: string
  recursive?: boolean
  toTrash?: boolean
}): Promise<TermToolOut> => {
  const res = await request("/v1/fs/delete", {
    path: args.path,
    recursive: args.recursive === true,
    to_trash: args.toTrash !== false,
  })
  return opOut(res, "FS delete failed")
}

export const fsMkdir = async (args: { path: string; parents?: boolean }): Promise<TermToolOut> => {
  const res = await request("/v1/fs/mkdir", {
    path: args.path,
    parents: args.parents !== false,
  })
  return opOut(res, "FS mkdir failed")
}

export const fsPurge = async (args: { path?: string; recursive?: boolean }): Promise<TermToolOut> => {
  const res = await request("/v1/fs/purge", {
    path: args.path,
    recursive: args.recursive !== false,
  })
  return opOut(res, "FS purge failed")
}

export const fsApplyPatch = async (args: { path: string; unifiedDiff: string }): Promise<TermToolOut> => {
  const res = await request("/v1/fs/apply_patch", {
    path: args.path,
    unified_diff: args.unifiedDiff,
  })
  return opOut(res, "FS apply_patch failed")
}

export const fsReplaceRanges = async (args: {
  path: string
  ranges: { start_line: number; end_line: number; content: string }[]
}): Promise<TermToolOut> => {
  const res = await request("/v1/fs/replace_ranges", {
    path: args.path,
    ranges: args.ranges,
  })
  return opOut(res, "FS replace_ranges failed")
}

export const editorOpen = async (args: {
  path: string
  editor?: string
  line?: number
  col?: number
  targetPane?: string
  sessionId?: string
}): Promise<TermToolOut> => {
  const res = await request("/v1/editor/open", {
    path: args.path,
    editor: args.editor,
    line: args.line,
    col: args.col,
    target_pane: args.targetPane,
    sessionId: args.sessionId,
  })
  return opOut(res, "Editor open failed")
}

export const projectDetect = async (args: { root: string }): Promise<TermToolOut> => {
  const res = await request("/v1/project/detect", { root: args.root })
  return opOut(res, "Project detect failed")
}

export const projectSetup = async (args: { root: string }): Promise<TermToolOut> => {
  const res = await request("/v1/project/setup", { root: args.root })
  return opOut(res, "Project setup failed")
}

export const projectInstall = async (args: {
  root: string
  locked?: boolean
  network?: boolean
  hashes?: boolean
}): Promise<TermToolOut> => {
  const res = await request("/v1/project/install", {
    root: args.root,
    locked: args.locked !== false,
    network: args.network !== false,
    hashes: args.hashes === true,
  })
  return opOut(res, "Project install failed")
}

export const projectRun = async (args: {
  root: string
  command: string[]
  timeoutS?: number
}): Promise<TermToolOut> => {
  const res = await request("/v1/project/run", {
    root: args.root,
    command: args.command,
    timeout_s: args.timeoutS,
  })
  return opOut(res, "Project run failed")
}

export const projectTest = async (args: { root: string; timeoutS?: number }): Promise<TermToolOut> => {
  const res = await request("/v1/project/test", {
    root: args.root,
    timeout_s: args.timeoutS,
  })
  return opOut(res, "Project test failed")
}
