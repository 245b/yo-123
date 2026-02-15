import { clean } from "../utils/text"
import { TERM_AGENT_V1 } from "../../../packages/contracts/src/term-agent-http"

type TermBase = { ok: boolean; error?: string; requestId?: string }
type TermOp = { id?: string; ts?: string }
type TermObj = Record<string, unknown>
type TermOpOut<T> = TermBase & { op?: TermOp; result?: T; warnings?: string[] }

export type TermEnsureOut = TermBase & { sessionId?: string }
export type TermExecOut = TermBase & { output?: string; exitCode?: number; truncated?: boolean }
export type TermCaptureOut = TermBase & { text?: string }
export type TermSendOut = TermBase
export type TermOpenOut = TermBase & { processId?: string; targetPane?: string; sessionId?: string; cwd?: string }
export type TermResizeOut = TermBase & { processId?: string; cols?: number; rows?: number }
export type TermTerminateOut = TermBase & { processId?: string; terminated?: boolean }
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

const cleanSession = (raw: string) => {
  const text0 = clean(raw)
  const text1 = text0.replace(/[^a-zA-Z0-9_.-]+/g, "_")
  const text = clean(text1)

  if (text) {
    return text
  }

  return "operator"
}

const splitParts = (raw: string) => {
  const text0 = clean(raw)
  const text1 = text0.replace(/\\/g, "/").replace(/^[a-zA-Z]:\//, "").replace(/^\/+/, "")
  const text = clean(text1)

  if (!text) {
    return []
  }

  const list0 = text.split("/")
  const out: string[] = []

  for (var i = 0; i < list0.length; i++) {
    const row = clean(list0[i] || "")

    if (!row || row === "." || row === "..") {
      continue
    }

    out.push(row)
  }

  return out
}

const workspaceParts = () => {
  const e0 = envVal("OPERATOR_ENFORCED_ROOT")
  const w0 = envVal("VNC_WORKDIR")
  const w1 = w0 || envVal("OPERATOR_VNC_WORKDIR")
  const w2 = e0 || w1 || "/projects/operator"
  const list = splitParts(w2)
  const out: string[] = []

  for (var i = 0; i < list.length; i++) {
    out.push((list[i] || "").toLowerCase())
  }

  return out
}

const sessionFromPath = (raw: string, fallback: string) => {
  const parts = splitParts(raw)
  const lower: string[] = []

  if (!parts.length) {
    return cleanSession(fallback)
  }

  for (var i = 0; i < parts.length; i++) {
    lower.push((parts[i] || "").toLowerCase())
  }

  const base = workspaceParts()
  var from = 0

  if (base.length && lower.length > base.length) {
    var same = true

    for (var bi = 0; bi < base.length; bi++) {
      if ((lower[bi] || "") !== (base[bi] || "")) {
        same = false
        break
      }
    }

    if (same) {
      from = base.length
    }
  }

  const p0 = lower[0] || ""
  const p1 = lower[1] || ""
  const last = base.length ? base[base.length - 1] || "" : ""

  if (!from && p0 === "projects" && p1 === "operator" && lower.length > 2) {
    from = 2
  }

  if (!from && p0 === "operator" && lower.length > 1) {
    from = 1
  }

  if (!from && last && p0 === last && lower.length > 1) {
    from = 1
  }

  for (var i = from; i < parts.length; i++) {
    const row = clean(parts[i] || "")

    if (!row || row === "." || row === "..") {
      continue
    }

    return cleanSession(row)
  }

  return cleanSession(fallback)
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

const mkReqId = () => {
  const id0 = globalThis.crypto?.randomUUID?.() ?? ""
  const id = typeof id0 === "string" ? id0.trim() : ""

  if (id) {
    return id
  }

  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

const request = async (path: string, body: Record<string, unknown>, timeoutMs?: number, requestIdOverride?: string) => {
  const cfg = termCfg()
  const rid0 = typeof requestIdOverride === "string" ? requestIdOverride : ""
  const rid = clean(rid0)
  const requestId = rid || mkReqId()

  if (!cfg.base) {
    return { ok: false, error: "TERM_AGENT_URL not set", data: null as unknown, requestId }
  }

  if (!cfg.token) {
    return { ok: false, error: "Missing TERM_AGENT_TOKEN", data: null as unknown, requestId }
  }

  const url = buildUrl(cfg.base, path)
  const ms = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : cfg.timeoutMs
  const sig = AbortSignal.timeout(ms)
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-term-agent-token": cfg.token,
      "x-request-id": requestId,
    },
    body: JSON.stringify(body),
    signal: sig,
  }).catch(() => null)

  if (!res) {
    const msg = sig.aborted ? "Terminal request timed out" : "Terminal request failed"
    return { ok: false, error: msg, data: null as unknown, requestId }
  }

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null

  if (!res.ok) {
    const err0 = typeof json?.error === "string" ? json.error : ""
    const err = clean(err0)
    return { ok: false, error: err || `Terminal error (${res.status})`, data: json, requestId }
  }

  return { ok: true, error: "", data: json, requestId }
}

const asObj = (v: unknown) => (v && typeof v === "object" ? (v as TermObj) : null)

const opOut = (res: { ok: boolean; error?: string; data?: unknown; requestId?: string }, fallback: string): TermToolOut => {
  if (!res.ok) {
    return { ok: false, error: res.error || fallback, requestId: res.requestId }
  }

  const row = asObj(res.data)

  if (!row) {
    return { ok: false, error: fallback, requestId: res.requestId }
  }

  const ok = row.ok === true

  if (!ok) {
    const err0 = typeof row.error === "string" ? row.error : ""
    const err = clean(err0)
    return { ok: false, error: err || fallback, requestId: res.requestId }
  }

  return { ...(row as TermToolOut), requestId: res.requestId }
}

export const sessionEnsure = async (sessionId?: string): Promise<TermEnsureOut> => {
  const cfg = termCfg()
  const sid = clean(sessionId || cfg.sessionId)
  const res = await request(TERM_AGENT_V1.sessionEnsure, { sessionId: sid })

  if (!res.ok) {
    return { ok: false, error: res.error || "Session ensure failed", requestId: res.requestId }
  }

  const row = (res.data && typeof res.data === "object" ? res.data : null) as { sessionId?: unknown } | null
  const out = typeof row?.sessionId === "string" ? row.sessionId : sid
  return { ok: true, sessionId: clean(out) || sid, requestId: res.requestId }
}

export const terminalExec = async (args: {
  sessionId?: string
  command: string
  timeoutMs?: number
  maxChars?: number
  cwd?: string
  targetPane?: string
  requestId?: string
}): Promise<TermExecOut> => {
  const cfg = termCfg()
  const sid = clean(args.sessionId || cfg.sessionId)
  const res = await request(
    TERM_AGENT_V1.terminal.exec,
    {
      sessionId: sid,
      command: args.command,
      timeoutMs: args.timeoutMs,
      maxChars: args.maxChars,
      cwd: args.cwd,
      target_pane: args.targetPane,
    },
    args.timeoutMs,
    args.requestId,
  )

  if (!res.ok) {
    return { ok: false, error: res.error || "Terminal exec failed", requestId: res.requestId }
  }

  const row = (res.data && typeof res.data === "object" ? res.data : null) as {
    output?: unknown
    exitCode?: unknown
    truncated?: unknown
  } | null
  const output = typeof row?.output === "string" ? row.output : ""
  const exitCode = typeof row?.exitCode === "number" ? row.exitCode : undefined
  const truncated = row?.truncated === true ? true : undefined
  return { ok: true, output, exitCode, truncated, requestId: res.requestId }
}

export const terminalCapture = async (args: {
  sessionId?: string
  tailLines?: number
  targetPane?: string
  requestId?: string
}): Promise<TermCaptureOut> => {
  const cfg = termCfg()
  const sid = clean(args.sessionId || cfg.sessionId)
  const tail = typeof args.tailLines === "number" && args.tailLines > 0 ? Math.floor(args.tailLines) : 200
  const res = await request(
    TERM_AGENT_V1.terminal.capture,
    { sessionId: sid, tailLines: tail, target_pane: args.targetPane },
    undefined,
    args.requestId,
  )

  if (!res.ok) {
    return { ok: false, error: res.error || "Terminal capture failed", requestId: res.requestId }
  }

  const row = (res.data && typeof res.data === "object" ? res.data : null) as { text?: unknown } | null
  const text = typeof row?.text === "string" ? row.text : ""
  return { ok: true, text, requestId: res.requestId }
}

export const terminalSend = async (args: {
  sessionId?: string
  keys?: string
  enter?: boolean
  targetPane?: string
  requestId?: string
}): Promise<TermSendOut> => {
  const cfg = termCfg()
  const sid = clean(args.sessionId || cfg.sessionId)
  const keys = typeof args.keys === "string" ? args.keys : ""
  const enter = args.enter === true
  const res = await request(
    TERM_AGENT_V1.terminal.send,
    { sessionId: sid, keys, enter, target_pane: args.targetPane },
    undefined,
    args.requestId,
  )

  if (!res.ok) {
    return { ok: false, error: res.error || "Terminal send failed", requestId: res.requestId }
  }

  return { ok: true, requestId: res.requestId }
}

export const terminalOpen = async (args: {
  sessionId?: string
  cwd?: string
  cols?: number
  rows?: number
  requestId?: string
}): Promise<TermOpenOut> => {
  const cfg = termCfg()
  const sid = clean(args.sessionId || cfg.sessionId)
  const res = await request(
    TERM_AGENT_V1.terminal.open,
    {
      sessionId: sid,
      cwd: args.cwd,
      cols: args.cols,
      rows: args.rows,
    },
    undefined,
    args.requestId,
  )

  if (!res.ok) {
    return { ok: false, error: res.error || "Terminal open failed", requestId: res.requestId }
  }

  const row = (res.data && typeof res.data === "object" ? res.data : null) as {
    process_id?: unknown
    target_pane?: unknown
    sessionId?: unknown
    cwd?: unknown
  } | null
  const processId = typeof row?.process_id === "string" ? clean(row.process_id) : ""
  const targetPane = typeof row?.target_pane === "string" ? clean(row.target_pane) : ""
  const nextSessionId = typeof row?.sessionId === "string" ? clean(row.sessionId) : sid
  const cwd = typeof row?.cwd === "string" ? clean(row.cwd) : ""
  return {
    ok: true,
    processId: processId || undefined,
    targetPane: targetPane || undefined,
    sessionId: nextSessionId || sid,
    cwd: cwd || undefined,
    requestId: res.requestId,
  }
}

export const terminalResize = async (args: {
  processId: string
  cols?: number
  rows?: number
  requestId?: string
}): Promise<TermResizeOut> => {
  const processId = clean(args.processId)

  if (!processId) {
    return { ok: false, error: "Missing processId" }
  }

  const res = await request(
    TERM_AGENT_V1.terminal.resize,
    {
      process_id: processId,
      cols: args.cols,
      rows: args.rows,
    },
    undefined,
    args.requestId,
  )

  if (!res.ok) {
    return { ok: false, error: res.error || "Terminal resize failed", requestId: res.requestId }
  }

  const row = (res.data && typeof res.data === "object" ? res.data : null) as {
    cols?: unknown
    rows?: unknown
  } | null
  const cols = typeof row?.cols === "number" ? row.cols : undefined
  const rows = typeof row?.rows === "number" ? row.rows : undefined
  return {
    ok: true,
    processId,
    cols,
    rows,
    requestId: res.requestId,
  }
}

export const terminalTerminate = async (args: { processId: string; requestId?: string }): Promise<TermTerminateOut> => {
  const processId = clean(args.processId)

  if (!processId) {
    return { ok: false, error: "Missing processId" }
  }

  const res = await request(
    TERM_AGENT_V1.terminal.terminate,
    {
      process_id: processId,
    },
    undefined,
    args.requestId,
  )

  if (!res.ok) {
    return { ok: false, error: res.error || "Terminal terminate failed", requestId: res.requestId }
  }

  const row = (res.data && typeof res.data === "object" ? res.data : null) as { terminated?: unknown } | null
  const terminated = row?.terminated === true
  return {
    ok: true,
    processId,
    terminated,
    requestId: res.requestId,
  }
}

export const fsList = async (args: {
  path: string
  recursive?: boolean
  maxEntries?: number
  maxDepth?: number
  sessionId?: string
  requestId?: string
}): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const sessionId = sid || sessionFromPath(args.path, cfg.sessionId)
  const res = await request(
    TERM_AGENT_V1.fs.list,
    {
      sessionId,
      path: args.path,
      recursive: args.recursive === true,
      max_entries: args.maxEntries,
      max_depth: args.maxDepth,
    },
    undefined,
    args.requestId,
  )
  return opOut(res, "FS list failed")
}

export const fsStat = async (args: { path: string; sessionId?: string; requestId?: string }): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const sessionId = sid || sessionFromPath(args.path, cfg.sessionId)
  const res = await request(TERM_AGENT_V1.fs.stat, { sessionId, path: args.path }, undefined, args.requestId)
  return opOut(res, "FS stat failed")
}

export const fsRead = async (args: {
  path: string
  maxBytes?: number
  startLine?: number
  endLine?: number
  binary?: boolean
  timeoutMs?: number
  sessionId?: string
  requestId?: string
}): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const sessionId = sid || sessionFromPath(args.path, cfg.sessionId)
  const res = await request(
    TERM_AGENT_V1.fs.read,
    {
      sessionId,
      path: args.path,
      max_bytes: args.maxBytes,
      start_line: args.startLine,
      end_line: args.endLine,
      binary: args.binary === true,
    },
    args.timeoutMs,
    args.requestId,
  )
  return opOut(res, "FS read failed")
}

export const fsWrite = async (args: {
  path: string
  content: string
  atomic?: boolean
  createParents?: boolean
  sessionId?: string
  requestId?: string
}): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const sessionId = sid || sessionFromPath(args.path, cfg.sessionId)
  const res = await request(
    TERM_AGENT_V1.fs.write,
    {
      sessionId,
      path: args.path,
      content: args.content,
      atomic: args.atomic !== false,
      create_parents: args.createParents !== false,
    },
    undefined,
    args.requestId,
  )
  return opOut(res, "FS write failed")
}

export const fsMove = async (args: {
  src: string
  dst: string
  overwrite?: boolean
  sessionId?: string
  requestId?: string
}): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const sessionId = sid || sessionFromPath(args.src, cfg.sessionId)
  const res = await request(
    TERM_AGENT_V1.fs.move,
    {
      sessionId,
      src: args.src,
      dst: args.dst,
      overwrite: args.overwrite === true,
    },
    undefined,
    args.requestId,
  )
  return opOut(res, "FS move failed")
}

export const fsCopy = async (args: {
  src: string
  dst: string
  recursive?: boolean
  overwrite?: boolean
  sessionId?: string
  requestId?: string
}): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const sessionId = sid || sessionFromPath(args.src, cfg.sessionId)
  const res = await request(
    TERM_AGENT_V1.fs.copy,
    {
      sessionId,
      src: args.src,
      dst: args.dst,
      recursive: args.recursive !== false,
      overwrite: args.overwrite === true,
    },
    undefined,
    args.requestId,
  )
  return opOut(res, "FS copy failed")
}

export const fsDelete = async (args: {
  path: string
  recursive?: boolean
  toTrash?: boolean
  sessionId?: string
  requestId?: string
}): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const sessionId = sid || sessionFromPath(args.path, cfg.sessionId)
  const res = await request(
    TERM_AGENT_V1.fs.delete,
    {
      sessionId,
      path: args.path,
      recursive: args.recursive === true,
      to_trash: args.toTrash !== false,
    },
    undefined,
    args.requestId,
  )
  return opOut(res, "FS delete failed")
}

export const fsMkdir = async (args: {
  path: string
  parents?: boolean
  sessionId?: string
  requestId?: string
}): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const sessionId = sid || sessionFromPath(args.path, cfg.sessionId)
  const res = await request(
    TERM_AGENT_V1.fs.mkdir,
    {
      sessionId,
      path: args.path,
      parents: args.parents !== false,
    },
    undefined,
    args.requestId,
  )
  return opOut(res, "FS mkdir failed")
}

export const fsPurge = async (args: {
  path?: string
  recursive?: boolean
  sessionId?: string
  requestId?: string
}): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const seed = typeof args.path === "string" ? args.path : ""
  const sessionId = sid || sessionFromPath(seed, cfg.sessionId)
  const res = await request(
    TERM_AGENT_V1.fs.purge,
    {
      sessionId,
      path: args.path,
      recursive: args.recursive !== false,
    },
    undefined,
    args.requestId,
  )
  return opOut(res, "FS purge failed")
}

export const fsApplyPatch = async (args: {
  path: string
  unifiedDiff: string
  sessionId?: string
  requestId?: string
}): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const sessionId = sid || sessionFromPath(args.path, cfg.sessionId)
  const res = await request(
    TERM_AGENT_V1.fs.applyPatch,
    {
      sessionId,
      path: args.path,
      unified_diff: args.unifiedDiff,
    },
    undefined,
    args.requestId,
  )
  return opOut(res, "FS apply_patch failed")
}

export const fsReplaceRanges = async (args: {
  path: string
  ranges: { start_line: number; end_line: number; content: string }[]
  sessionId?: string
  requestId?: string
}): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const sessionId = sid || sessionFromPath(args.path, cfg.sessionId)
  const res = await request(
    TERM_AGENT_V1.fs.replaceRanges,
    {
      sessionId,
      path: args.path,
      ranges: args.ranges,
    },
    undefined,
    args.requestId,
  )
  return opOut(res, "FS replace_ranges failed")
}

export const editorOpen = async (args: {
  path: string
  editor?: string
  line?: number
  col?: number
  targetPane?: string
  sessionId?: string
  requestId?: string
}): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sessionId = cleanSession(args.sessionId || sessionFromPath(args.path, cfg.sessionId))
  const res = await request(
    TERM_AGENT_V1.editor.open,
    {
      sessionId,
      path: args.path,
      editor: args.editor,
      line: args.line,
      col: args.col,
      target_pane: args.targetPane,
    },
    undefined,
    args.requestId,
  )
  return opOut(res, "Editor open failed")
}

export const projectDetect = async (args: { root: string; sessionId?: string; requestId?: string }): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const sessionId = sid || sessionFromPath(args.root, cfg.sessionId)
  const res = await request(TERM_AGENT_V1.project.detect, { sessionId, root: args.root }, undefined, args.requestId)
  return opOut(res, "Project detect failed")
}

export const projectSetup = async (args: { root: string; sessionId?: string; requestId?: string }): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const sessionId = sid || sessionFromPath(args.root, cfg.sessionId)
  const res = await request(TERM_AGENT_V1.project.setup, { sessionId, root: args.root }, undefined, args.requestId)
  return opOut(res, "Project setup failed")
}

export const projectInstall = async (args: {
  root: string
  locked?: boolean
  network?: boolean
  hashes?: boolean
  sessionId?: string
  requestId?: string
}): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const sessionId = sid || sessionFromPath(args.root, cfg.sessionId)
  const res = await request(
    TERM_AGENT_V1.project.install,
    {
      sessionId,
      root: args.root,
      locked: args.locked !== false,
      network: args.network !== false,
      hashes: args.hashes === true,
    },
    undefined,
    args.requestId,
  )
  return opOut(res, "Project install failed")
}

export const projectRun = async (args: {
  root: string
  command: string[]
  timeoutS?: number
  sessionId?: string
  requestId?: string
}): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const sessionId = sid || sessionFromPath(args.root, cfg.sessionId)
  const res = await request(
    TERM_AGENT_V1.project.run,
    {
      sessionId,
      root: args.root,
      command: args.command,
      timeout_s: args.timeoutS,
    },
    undefined,
    args.requestId,
  )
  return opOut(res, "Project run failed")
}

export const projectTest = async (args: {
  root: string
  timeoutS?: number
  sessionId?: string
  requestId?: string
}): Promise<TermToolOut> => {
  const cfg = termCfg()
  const sid0 = typeof args.sessionId === "string" ? args.sessionId : ""
  const sid = cleanSession(sid0)
  const sessionId = sid || sessionFromPath(args.root, cfg.sessionId)
  const res = await request(
    TERM_AGENT_V1.project.test,
    {
      sessionId,
      root: args.root,
      timeout_s: args.timeoutS,
    },
    undefined,
    args.requestId,
  )
  return opOut(res, "Project test failed")
}
