#!/usr/bin/env bun
import path from "node:path"
import * as fs from "node:fs"
import { spawnSafe } from "../../../../packages/execution/src/spawn-safe"
import { HeadTailBuffer } from "../../../../packages/execution/src/head-tail-buffer"
import { TERM_AGENT_V1 } from "../../../../packages/contracts/src/term-agent-http"

const clean = (raw: unknown) => {
  const t0 = typeof raw === "string" ? raw : ""
  return t0.trim()
}

const intFrom = (raw: unknown, fallback: number) => {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.floor(raw) : fallback
  }

  const text = clean(raw)

  if (!text) {
    return fallback
  }

  const n0 = Number.parseInt(text, 10)
  return Number.isFinite(n0) ? Math.floor(n0) : fallback
}

const nowIso = () => {
  const iso = new Date().toISOString()
  const head = iso.split(".")[0] || iso
  return head.endsWith("Z") ? head : `${head}Z`
}

const opMeta = () => {
  const id0 = globalThis.crypto?.randomUUID?.() ?? ""
  const id = typeof id0 === "string" ? id0.trim() : ""
  return { id: id || `${Date.now()}-${Math.floor(Math.random() * 1e9)}`, ts: nowIso() }
}

const okOut = (result?: Record<string, unknown>, warnings?: string[]) => {
  const res = result && typeof result === "object" ? result : {}
  const warn = Array.isArray(warnings) ? warnings : []
  return { ok: true, op: opMeta(), result: res, warnings: warn }
}

const jsonRes = (status: number, obj: unknown) => {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  })
}

const readJson = async (req: Request) => {
  const out = await req.json().catch(() => null)
  return out && typeof out === "object" ? (out as Record<string, unknown>) : null
}

const TOKEN = clean(process.env.TERM_AGENT_TOKEN ?? "")
const RUN_USER = clean(process.env.RUN_USER ?? "operator") || "operator"
const RUN_HOME = clean(process.env.RUN_HOME ?? "/home/operator") || "/home/operator"
const PROJECTS_DIR = clean(process.env.PROJECTS_DIR ?? "/projects") || "/projects"
const OPERATOR_DIR = clean(process.env.OPERATOR_DIR ?? `${PROJECTS_DIR}/operator`) || `${PROJECTS_DIR}/operator`
const WORKSPACE_ROOT_RAW = clean(process.env.WORKSPACE_ROOT ?? OPERATOR_DIR) || OPERATOR_DIR
const TERM_SESSION_DIR_RAW = clean(process.env.TERM_SESSION_DIR ?? WORKSPACE_ROOT_RAW) || WORKSPACE_ROOT_RAW
const TRASH_DIR_RAW = clean(process.env.TRASH_DIR ?? "")
const PERMS_RAW = clean(process.env.TERM_AGENT_PERMS ?? "all").toLowerCase() || "all"
const PURGE_ON_START = ["1", "true", "yes", "on"].includes(clean(process.env.TERM_AGENT_PURGE_ON_START ?? "").toLowerCase())

const PORT_RAW = Number.parseInt(clean(process.env.TERM_AGENT_PORT ?? "7682"), 10)
const PORT = Number.isFinite(PORT_RAW) ? Math.max(1, Math.min(65535, Math.floor(PORT_RAW))) : 7682

const OPERATOR_ROOT = path.resolve(OPERATOR_DIR)
const ROOT0 = path.resolve(TERM_SESSION_DIR_RAW)

const pathInBase = (base: string, target: string) => {
  const b = path.resolve(base)
  const t = path.resolve(target)
  const rel = path.relative(b, t)

  if (!rel || rel === ".") {
    return true
  }

  if (rel.startsWith("..") || rel.startsWith(`..${path.sep}`)) {
    return false
  }

  if (path.isAbsolute(rel)) {
    return false
  }

  return true
}

const ROOT = pathInBase(OPERATOR_ROOT, ROOT0) ? ROOT0 : OPERATOR_ROOT
const TRASH_DIR = TRASH_DIR_RAW || "/trash"
const TRASH_PATH = path.resolve(TRASH_DIR)

const parsePerms = (raw: string) => {
  const text = clean(raw).toLowerCase()

  if (!text) {
    return new Set(["all"])
  }

  const parts = text.split(/[,\\s]+/g)
  const out = new Set<string>()

  for (var i = 0; i < parts.length; i++) {
    const p = clean(parts[i] ?? "")

    if (!p) {
      continue
    }

    out.add(p)
  }

  if (!out.size) {
    out.add("all")
  }

  return out
}

const PERMS = parsePerms(PERMS_RAW)

const allowPerm = (kind: string) => {
  if (PERMS.has("all")) {
    return true
  }

  return PERMS.has(kind)
}

const baseEnv = () => {
  return { ...process.env, HOME: RUN_HOME, USER: RUN_USER, LOGNAME: RUN_USER }
}

const readStream = async (s: ReadableStream<Uint8Array> | null, buf: HeadTailBuffer) => {
  if (!s) {
    return
  }

  const r = s.getReader()

  for (;;) {
    const row = await r.read().catch(() => null)

    if (!row) {
      break
    }

    if (row.done) {
      break
    }

    if (!row.value) {
      continue
    }

    buf.pushChunk(row.value)
  }
}

const tmuxCmd = async (args: string[], capture: boolean) => {
  const env = baseEnv()
  const cmd = ["runuser", "-u", RUN_USER, "--", "tmux", ...args]
  const p = spawnSafe({
    kind: "tool",
    cmd,
    env,
    stdout: capture ? "pipe" : "ignore",
    stderr: capture ? "pipe" : "ignore",
    stdin: "ignore",
  })
  const out = new HeadTailBuffer(256 * 1024)
  const err = new HeadTailBuffer(128 * 1024)
  const outP = capture ? readStream(p.stdout ?? null, out) : Promise.resolve()
  const errP = capture ? readStream(p.stderr ?? null, err) : Promise.resolve()
  const code = await p.exited.catch(() => 1)
  await Promise.all([outP, errP])
  return {
    code,
    stdout: Buffer.from(out.toBytes()).toString("utf8"),
    stderr: Buffer.from(err.toBytes()).toString("utf8"),
  }
}

const ensureDirs = async () => {
  await fs.promises.mkdir(ROOT, { recursive: true }).catch(() => undefined)
  await fs.promises.mkdir(TRASH_PATH, { recursive: true }).catch(() => undefined)
  await fs.promises.mkdir(path.join(TRASH_PATH, "files"), { recursive: true }).catch(() => undefined)
  await fs.promises.mkdir(path.join(TRASH_PATH, "info"), { recursive: true }).catch(() => undefined)

  if (!PURGE_ON_START) {
    return
  }

  const list = await fs.promises.readdir(ROOT, { withFileTypes: true }).catch(() => [])

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row) {
      continue
    }

    const fp = path.join(ROOT, row.name)

    if (fp === TRASH_PATH || fp.startsWith(`${TRASH_PATH}${path.sep}`)) {
      continue
    }

    await fs.promises.rm(fp, { recursive: true, force: true }).catch(() => undefined)
  }
}

const SESSION_RE = /[^a-zA-Z0-9_.-]+/g
const TARGET_RE = /[^a-zA-Z0-9_.:%-]+/g

const cleanSession = (raw: unknown) => {
  const val0 = clean(raw) || "operator"
  const val1 = val0.replace(SESSION_RE, "_")
  const val = clean(val1) || "operator"
  return val.slice(0, 64)
}

const cleanTarget = (raw: unknown) => {
  const val0 = clean(raw)

  if (!val0) {
    return ""
  }

  const val = val0.replace(TARGET_RE, "")
  return val.slice(0, 128)
}

const splitParts = (raw: unknown) => {
  const text0 = clean(raw)

  if (!text0) {
    return [] as string[]
  }

  const text1 = text0.replace(/\\/g, "/")
  const text2 = text1.replace(/^[a-zA-Z]:[\\/]+/, "")
  const text3 = text2.replace(/^[\\/]+/, "")
  const parts = text3.split("/")
  const out: string[] = []

  for (var i = 0; i < parts.length; i++) {
    const p = clean(parts[i] ?? "")

    if (!p || p === "." || p === "..") {
      continue
    }

    out.push(p)
  }

  return out
}

const sessionRoot = (sessionId: string) => {
  const sid = cleanSession(sessionId)
  const last = path.basename(ROOT)

  if (last.toLowerCase() === sid.toLowerCase()) {
    return ROOT
  }

  return path.join(ROOT, sid)
}

const ensureSessionRoot = async (sessionId: string) => {
  const base = sessionRoot(sessionId)
  await fs.promises.mkdir(base, { recursive: true }).catch(() => undefined)
  await fs.promises.chmod(base, 0o775).catch(() => undefined)
  return base
}

const scopedSessionPath = async (sessionId: string, raw: unknown) => {
  const base = await ensureSessionRoot(sessionId)
  const sid = cleanSession(sessionId)
  const parts = splitParts(raw)

  if (!parts.length) {
    return base
  }

  const lower = parts.map((x) => x.toLowerCase())
  const baseParts = splitParts(ROOT).map((x) => x.toLowerCase())
  var from = 0

  if (baseParts.length && lower.length >= baseParts.length) {
    var same = true

    for (var i = 0; i < baseParts.length; i++) {
      if ((lower[i] ?? "") !== (baseParts[i] ?? "")) {
        same = false
        break
      }
    }

    if (same) {
      from = baseParts.length
    }
  }

  const p0 = lower[0] ?? ""
  const p1 = lower[1] ?? ""

  if (!from && p0 === "projects" && p1 === "operator") {
    from = 2
  }

  if (!from && p0 === "operator") {
    from = 1
  }

  var tail = parts.slice(from)

  if (tail.length && (tail[0] ?? "").toLowerCase() === sid.toLowerCase()) {
    tail = tail.slice(1)
  }

  if (!tail.length) {
    return base
  }

  const target = path.resolve(base, ...tail)
  return pathInBase(base, target) ? target : base
}

const statInfo = async (fp: string) => {
  const target = path.resolve(fp)
  const rel = pathInBase(ROOT, target) ? path.relative(ROOT, target) : ""
  const st = await fs.promises.stat(target).catch(() => null)

  if (!st) {
    return { path: target, rel: rel === "." ? "" : rel, exists: false }
  }

  var kind = "other"

  if (st.isDirectory()) {
    kind = "dir"
  }

  if (st.isFile()) {
    kind = "file"
  }

  const mode = st.mode & 0o777
  const mtime = new Date(st.mtimeMs).toISOString().split(".")[0] + "Z"
  return { path: target, rel: rel === "." ? "" : rel, exists: true, type: kind, size: st.size, mtime, mode: `0o${mode.toString(8)}` }
}

const entryInfo = async (fp: string) => {
  const info = await statInfo(fp)
  return { ...(info as Record<string, unknown>), name: path.basename(fp) }
}

const ensureTmuxSession = async (sessionId: string) => {
  const sid = cleanSession(sessionId)
  const root = await ensureSessionRoot(sid)
  const has = await tmuxCmd(["has-session", "-t", sid], false)

  if (has.code === 0) {
    return { ok: true as const, sessionId: sid, root }
  }

  const created = await tmuxCmd(["new-session", "-d", "-s", sid, "-c", root], false)

  if (created.code === 0) {
    return { ok: true as const, sessionId: sid, root }
  }

  return { ok: false as const, error: "Failed to create tmux session", sessionId: sid, root }
}

const locks = new Map<string, Promise<void>>()

const withLock = async <T>(key: string, fn: () => Promise<T>) => {
  const k = clean(key) || "global"
  const prev = locks.get(k) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  locks.set(
    k,
    next.then(
      () => undefined,
      () => undefined,
    ),
  )
  return next
}

const resolvePath = async (fp: string, allowMissing: boolean) => {
  const p0 = clean(fp)

  if (!p0) {
    return { ok: false as const, error: "Missing path" }
  }

  const p = path.isAbsolute(p0) ? path.resolve(p0) : path.resolve(ROOT, p0)

  if (!pathInBase(ROOT, p)) {
    return { ok: false as const, error: "Path escapes workspace root" }
  }

  if (allowMissing) {
    return { ok: true as const, path: p }
  }

  const st = await fs.promises.stat(p).catch(() => null)
  return st ? { ok: true as const, path: p } : { ok: false as const, error: "Not found" }
}

const resolveDir = async (fp: string) => {
  const out = await resolvePath(fp, false)

  if (!out.ok) {
    return out
  }

  const st = await fs.promises.stat(out.path).catch(() => null)

  if (!st || !st.isDirectory()) {
    return { ok: false as const, error: "Not a directory" }
  }

  return out
}

const fsList = async (fp: string, recursive: boolean, maxEntries: number, maxDepth: number) => {
  const out = await resolvePath(fp, false)

  if (!out.ok) {
    return out
  }

  const st = await fs.promises.stat(out.path).catch(() => null)

  if (!st || !st.isDirectory()) {
    return { ok: false as const, error: "Not a directory" }
  }

  const max = Number.isFinite(maxEntries) && maxEntries > 0 ? Math.floor(maxEntries) : 2000
  const depthCap = Number.isFinite(maxDepth) ? Math.floor(maxDepth) : 20
  const entries: Record<string, unknown>[] = []
  var count = 0
  var truncated = false

  const push = async (fp2: string) => {
    if (truncated) {
      return
    }

    if (count >= max) {
      truncated = true
      return
    }

    entries.push(await entryInfo(fp2))
    count += 1
  }

  if (!recursive) {
    const list = await fs.promises.readdir(out.path, { withFileTypes: true }).catch(() => [])

    for (var i = 0; i < list.length; i++) {
      const row = list[i]

      if (!row) {
        continue
      }

      await push(path.join(out.path, row.name))
    }
  }

  if (recursive) {
    const baseDepth = splitParts(path.relative(ROOT, out.path)).length
    const walk = async (dir: string) => {
      if (truncated) {
        return
      }

      const depth = splitParts(path.relative(ROOT, dir)).length - baseDepth

      if (depthCap >= 0 && depth > depthCap) {
        return
      }

      const list = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])

      for (var i = 0; i < list.length; i++) {
        const row = list[i]

        if (!row) {
          continue
        }

        const child = path.join(dir, row.name)
        await push(child)

        if (row.isDirectory()) {
          await walk(child)
        }
      }
    }

    await walk(out.path)
  }

  const warnings: string[] = []

  if (truncated) {
    warnings.push("Result truncated due to max_entries limit.")
  }

  const rel = path.relative(ROOT, out.path)
  return { ok: true as const, out: okOut({ path: out.path, rel: rel === "." ? "" : rel, entries, count: entries.length, truncated }, warnings) }
}

const fsStat = async (fp: string) => {
  const out = await resolvePath(fp, true)

  if (!out.ok) {
    return out
  }

  return { ok: true as const, out: okOut(await statInfo(out.path), []) }
}

const fsRead = async (fp: string, maxBytes: number, startLine: number, endLine: number, binary: boolean) => {
  const out = await resolvePath(fp, false)

  if (!out.ok) {
    return out
  }

  const st = await fs.promises.stat(out.path).catch(() => null)

  if (!st || !st.isFile()) {
    return { ok: false as const, error: "Not a file" }
  }

  const file = Bun.file(out.path)
  const buf0 = await file.arrayBuffer().catch(() => null)

  if (!buf0) {
    return { ok: false as const, error: "Read failed" }
  }

  const data0 = new Uint8Array(buf0)
  var data = data0
  var truncated = false

  if (maxBytes > 0 && data0.length > maxBytes) {
    data = data0.slice(0, maxBytes)
    truncated = true
  }

  if (binary) {
    const b64 = Buffer.from(data).toString("base64")
    return { ok: true as const, out: okOut({ path: out.path, size: data.length, data_b64: b64, truncated }, []) }
  }

  var text = Buffer.from(data).toString("utf8")

  if (startLine > 0 || endLine > 0) {
    const lines = text.match(/.*(?:\\r?\\n|$)/g) ?? []
    const start = startLine > 0 ? startLine : 1
    const end = endLine > 0 ? endLine : lines.length

    if (end < start) {
      return { ok: false as const, error: "Invalid line range" }
    }

    text = lines.slice(start - 1, end).join("")
    return { ok: true as const, out: okOut({ path: out.path, content: text, start_line: start, end_line: end, truncated, size: data.length }, []) }
  }

  return { ok: true as const, out: okOut({ path: out.path, content: text, truncated, size: data.length }, []) }
}

const writeAtomic = async (fp: string, data: Uint8Array, createParents: boolean) => {
  const p = path.resolve(fp)

  if (createParents) {
    await fs.promises.mkdir(path.dirname(p), { recursive: true }).catch(() => undefined)
  }

  const before = await statInfo(p)
  const tmp = path.join(path.dirname(p), `.tmp.${opMeta().id}`)
  await Bun.write(tmp, data)
  await fs.promises.rename(tmp, p).catch(async () => {
    await fs.promises.rm(tmp, { force: true }).catch(() => undefined)
  })
  const after = await statInfo(p)
  return { before, after, bytes: data.length }
}

const fsWrite = async (fp: string, content: unknown, atomic: boolean, createParents: boolean) => {
  const out = await resolvePath(fp, true)

  if (!out.ok) {
    return out
  }

  const st = await fs.promises.stat(out.path).catch(() => null)

  if (st && st.isDirectory()) {
    return { ok: false as const, error: "Path is a directory" }
  }

  const text = typeof content === "string" ? content : ""
  const data = Buffer.from(text, "utf8")
  const res = await writeAtomic(out.path, data, createParents)
  return atomic
    ? { ok: true as const, out: okOut({ ...(res as Record<string, unknown>), path: out.path }, []) }
    : { ok: true as const, out: okOut({ ...(res as Record<string, unknown>), path: out.path }, []) }
}

const fsMkdir = async (fp: string, parents: boolean) => {
  const out = await resolvePath(fp, true)

  if (!out.ok) {
    return out
  }

  const before = await statInfo(out.path)
  await fs.promises.mkdir(out.path, { recursive: parents }).catch(() => undefined)
  const after = await statInfo(out.path)
  return { ok: true as const, out: okOut({ path: out.path, before, after }, []) }
}

const fsMove = async (src: string, dst: string, overwrite: boolean) => {
  const s = await resolvePath(src, false)

  if (!s.ok) {
    return s
  }

  const d = await resolvePath(dst, true)

  if (!d.ok) {
    return d
  }

  const dstSt = await fs.promises.stat(d.path).catch(() => null)

  if (dstSt && !overwrite) {
    return { ok: false as const, error: "Destination exists" }
  }

  if (dstSt && overwrite) {
    await fs.promises.rm(d.path, { recursive: true, force: true }).catch(() => undefined)
  }

  const before = await statInfo(s.path)
  await fs.promises.rename(s.path, d.path).catch(() => undefined)
  const after = await statInfo(d.path)
  return { ok: true as const, out: okOut({ src: s.path, dst: d.path, before, after }, []) }
}

const fsCopy = async (src: string, dst: string, recursive: boolean, overwrite: boolean) => {
  const s = await resolvePath(src, false)

  if (!s.ok) {
    return s
  }

  const d = await resolvePath(dst, true)

  if (!d.ok) {
    return d
  }

  const st = await fs.promises.stat(s.path).catch(() => null)

  if (!st) {
    return { ok: false as const, error: "Not found" }
  }

  const dstSt = await fs.promises.stat(d.path).catch(() => null)

  if (dstSt && !overwrite) {
    return { ok: false as const, error: "Destination exists" }
  }

  if (dstSt && overwrite) {
    await fs.promises.rm(d.path, { recursive: true, force: true }).catch(() => undefined)
  }

  if (st.isDirectory()) {
    if (!recursive) {
      return { ok: false as const, error: "Recursive flag required for directory copy" }
    }

    await fs.promises.cp(s.path, d.path, { recursive: true, force: overwrite }).catch(() => undefined)
    return { ok: true as const, out: okOut({ src: s.path, dst: d.path, after: await statInfo(d.path) }, []) }
  }

  await fs.promises.copyFile(s.path, d.path).catch(() => undefined)
  return { ok: true as const, out: okOut({ src: s.path, dst: d.path, after: await statInfo(d.path) }, []) }
}

const trashItem = async (fp: string) => {
  await ensureDirs()
  const name = `${Math.floor(Date.now() / 1000)}_${opMeta().id}_${path.basename(fp)}`
  const dest = path.join(TRASH_PATH, "files", name)
  const info = path.join(TRASH_PATH, "info", `${name}.json`)
  await fs.promises.rename(fp, dest).catch(() => undefined)
  const meta = { original_path: fp, trashed_path: dest, deleted_at: nowIso() }
  await Bun.write(info, JSON.stringify(meta, null, 2))
  return { original_path: fp, trashed_path: dest, info_path: info }
}

const purgeTrash = async () => {
  await fs.promises.rm(path.join(TRASH_PATH, "files"), { recursive: true, force: true }).catch(() => undefined)
  await fs.promises.rm(path.join(TRASH_PATH, "info"), { recursive: true, force: true }).catch(() => undefined)
  await ensureDirs()
  return { trash_path: TRASH_PATH }
}

const fsDelete = async (fp: string, recursive: boolean, toTrash: boolean) => {
  const out = await resolvePath(fp, false)

  if (!out.ok) {
    return out
  }

  const before = await statInfo(out.path)

  if (toTrash) {
    return { ok: true as const, out: okOut({ ...(await trashItem(out.path)), before }, []) }
  }

  const st = await fs.promises.stat(out.path).catch(() => null)

  if (st && st.isDirectory() && !recursive) {
    return { ok: false as const, error: "Recursive flag required for directory delete" }
  }

  await fs.promises.rm(out.path, { recursive: true, force: true }).catch(() => undefined)
  return { ok: true as const, out: okOut({ path: out.path, before }, []) }
}

const fsPurge = async (fp: string, recursive: boolean) => {
  const seed = clean(fp)

  if (!seed) {
    return { ok: true as const, out: okOut(await purgeTrash(), []) }
  }

  const out = await resolvePath(fp, false)

  if (!out.ok) {
    return out
  }

  const st = await fs.promises.stat(out.path).catch(() => null)

  if (st && st.isDirectory() && !recursive) {
    return { ok: false as const, error: "Recursive flag required for directory delete" }
  }

  await fs.promises.rm(out.path, { recursive: true, force: true }).catch(() => undefined)
  return { ok: true as const, out: okOut({ path: out.path }, []) }
}

type HunkLine = { tag: " " | "-" | "+"; text: string }
type Hunk = { oldStart: number; lines: HunkLine[] }

const parseDiff = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.replace(/\r\n/g, "\n").trimEnd()

  if (!text) {
    return { ok: false as const, error: "Missing diff" }
  }

  const lines = text.split("\n").map((x) => `${x}\n`)
  const hunks: Hunk[] = []
  var cur: Hunk | null = null

  for (var i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""

    if (line.startsWith("@@")) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)

      if (!m) {
        return { ok: false as const, error: "Invalid hunk header" }
      }

      const n0 = Number.parseInt(m[1] ?? "0", 10)
      const n = Number.isFinite(n0) ? Math.floor(n0) : 0
      cur = { oldStart: n, lines: [] }
      hunks.push(cur)
      continue
    }

    if (line.startsWith("---") || line.startsWith("+++")) {
      continue
    }

    if (line.startsWith("\\")) {
      continue
    }

    if (!cur) {
      continue
    }

    const tag = line[0] ?? ""

    if (tag !== " " && tag !== "-" && tag !== "+") {
      return { ok: false as const, error: "Invalid diff line" }
    }

    cur.lines.push({ tag: tag as " " | "-" | "+", text: line.slice(1) })
  }

  if (!hunks.length) {
    return { ok: false as const, error: "No hunks found" }
  }

  return { ok: true as const, hunks }
}

const applyHunks = (lines: string[], hunks: Hunk[]) => {
  const out = lines.slice()
  var off = 0

  for (var hi = 0; hi < hunks.length; hi++) {
    const h = hunks[hi]

    if (!h) {
      continue
    }

    var idx = h.oldStart - 1 + off

    if (idx < 0 || idx > out.length) {
      return { ok: false as const, error: "Hunk out of range" }
    }

    for (var li = 0; li < h.lines.length; li++) {
      const row = h.lines[li]

      if (!row) {
        continue
      }

      if (row.tag === " ") {
        if (out[idx] !== row.text) {
          return { ok: false as const, error: "Hunk context mismatch" }
        }

        idx += 1
        continue
      }

      if (row.tag === "-") {
        if (out[idx] !== row.text) {
          return { ok: false as const, error: "Hunk remove mismatch" }
        }

        out.splice(idx, 1)
        off -= 1
        continue
      }

      out.splice(idx, 0, row.text)
      idx += 1
      off += 1
    }
  }

  return { ok: true as const, lines: out }
}

const fsApplyPatch = async (fp: string, diff: string) => {
  const out = await resolvePath(fp, false)

  if (!out.ok) {
    return out
  }

  const st = await fs.promises.stat(out.path).catch(() => null)

  if (!st || !st.isFile()) {
    return { ok: false as const, error: "Not a file" }
  }

  const parsed = parseDiff(diff)

  if (!parsed.ok) {
    return { ok: false as const, error: parsed.error }
  }

  const before = await statInfo(out.path)
  const text0 = await Bun.file(out.path).text().catch(() => "")
  const text = typeof text0 === "string" ? text0 : ""
  const lines = text.match(/.*(?:\r?\n|$)/g) ?? []
  const applied = applyHunks(lines, parsed.hunks)

  if (!applied.ok) {
    return { ok: false as const, error: applied.error }
  }

  await Bun.write(out.path, applied.lines.join(""))
  const after = await statInfo(out.path)
  return { ok: true as const, out: okOut({ path: out.path, before, after }, []) }
}

const fsReplaceRanges = async (
  fp: string,
  ranges: Array<{ start_line: number; end_line: number; content: string }>,
) => {
  const out = await resolvePath(fp, false)

  if (!out.ok) {
    return out
  }

  const st = await fs.promises.stat(out.path).catch(() => null)

  if (!st || !st.isFile()) {
    return { ok: false as const, error: "Not a file" }
  }

  const list0 = Array.isArray(ranges) ? ranges : []

  if (!list0.length) {
    return { ok: false as const, error: "Ranges must be a list" }
  }

  const before = await statInfo(out.path)
  const text0 = await Bun.file(out.path).text().catch(() => "")
  const text = typeof text0 === "string" ? text0 : ""
  const lines = text.match(/.*(?:\r?\n|$)/g) ?? []
  const next = lines.slice()
  const list = list0.slice().sort((a, b) => a.start_line - b.start_line)
  var off = 0

  for (var i = 0; i < list.length; i++) {
    const r = list[i]

    if (!r) {
      continue
    }

    const a = Math.floor(r.start_line)
    const b = Math.floor(r.end_line)

    if (a < 1 || b < a) {
      return { ok: false as const, error: "Invalid range" }
    }

    const i0 = a - 1 + off
    const i1 = b + off

    if (i0 < 0 || i1 > next.length) {
      return { ok: false as const, error: "Range out of bounds" }
    }

    const chunk = typeof r.content === "string" ? r.content : ""
    const repl = chunk ? (chunk.match(/.*(?:\r?\n|$)/g) ?? []) : []
    next.splice(i0, i1 - i0, ...repl)
    off += repl.length - (i1 - i0)
  }

  await Bun.write(out.path, next.join(""))
  const after = await statInfo(out.path)
  return { ok: true as const, out: okOut({ path: out.path, before, after }, []) }
}

type PtyRow = {
  sessionId: string
  target_pane: string
  cwd: string
}

const PTYS = new Map<string, PtyRow>()

const resolveSessionDir = async (sessionId: string, raw: unknown) => {
  const base = await ensureSessionRoot(sessionId)
  const val0 = clean(raw)

  if (!val0) {
    return { ok: true as const, dir: base }
  }

  const dir = path.isAbsolute(val0) ? path.resolve(val0) : path.resolve(base, val0)

  if (!pathInBase(base, dir)) {
    return { ok: false as const, error: "cwd escapes session root" }
  }

  const st = await fs.promises.stat(dir).catch(() => null)

  if (!st) {
    return { ok: false as const, error: "Not found" }
  }

  if (!st.isDirectory()) {
    return { ok: false as const, error: "Not a directory" }
  }

  return { ok: true as const, dir }
}

const TRAVERSE_RE = /(^|[\s;|&(){}])\.\.([/\\]|$|[\s;|&(){}])/

const cmdTokens = (raw: string) => {
  const text = clean(raw)

  if (!text) {
    return [] as string[]
  }

  const re = /(?:[^\s"'\\]+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')+/g
  return text.match(re) ?? []
}

const tokenCandidates = (raw: string) => {
  const text = clean(raw)

  if (!text) {
    return [] as string[]
  }

  const out = [text]
  const eq = text.indexOf("=")

  if (eq > 0 && eq < text.length - 1) {
    out.push(text.slice(eq + 1))
  }

  return out
}

const cleanCandidate = (raw: string) => {
  const text = clean(raw)

  if (!text) {
    return ""
  }

  return text.replace(/^[`"'(){}\[\];|&]+|[`"'(){}\[\];|&]+$/g, "").trim()
}

const commandBoundaryError = async (sessionId: string, raw: unknown) => {
  const text = clean(raw)

  if (!text) {
    return ""
  }

  if (TRAVERSE_RE.test(text)) {
    return "Session boundary violation: .."
  }

  const base = await ensureSessionRoot(sessionId)
  const tokens = cmdTokens(text)

  for (var i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? ""

    if (!token) {
      continue
    }

    const list = tokenCandidates(token)

    for (var j = 0; j < list.length; j++) {
      const item0 = cleanCandidate(list[j] ?? "").replace(/\\\\/g, "/")

      if (!item0) {
        continue
      }

      if (item0.startsWith("~")) {
        return `Session boundary violation: ${token}`
      }

      if (item0 === ".." || item0.startsWith("../") || item0.endsWith("/..") || item0.includes("/../")) {
        return `Session boundary violation: ${token}`
      }

      if (!item0.startsWith("/")) {
        continue
      }

      const target = path.resolve(item0)

      if (pathInBase(base, target)) {
        continue
      }

      return `Session boundary violation: ${token}`
    }
  }

  return ""
}

const sendKeys = async (sessionId: string, keys: string, enter: boolean, target: string) => {
  const tgt = cleanTarget(target) || cleanSession(sessionId)

  if (keys) {
    await tmuxCmd(["send-keys", "-t", tgt, keys], false)
  }

  if (enter) {
    await tmuxCmd(["send-keys", "-t", tgt, "Enter"], false)
  }
}

const capturePane = async (sessionId: string, tailLines: number, target: string) => {
  const tgt = cleanTarget(target) || cleanSession(sessionId)
  const tail0 = Number.isFinite(tailLines) ? Math.max(1, Math.floor(tailLines)) : 200
  const res = await tmuxCmd(["capture-pane", "-p", "-t", tgt, "-S", `-${tail0}`], true)

  if (res.code !== 0) {
    return { ok: false as const, error: "capture failed", text: "" }
  }

  return { ok: true as const, text: res.stdout || "" }
}

const runCmd = async (argv: string[], cwd: string, timeoutS: number, env: Record<string, string>) => {
  const list0 = Array.isArray(argv) ? argv : []
  const list: string[] = []

  for (var i = 0; i < list0.length; i++) {
    const row = list0[i]

    if (typeof row !== "string") {
      continue
    }

    const item = row.trim()

    if (!item) {
      continue
    }

    list.push(item)
  }

  if (!list.length) {
    return { ok: false, error: "Missing command", exitCode: 127, stdout: "", stderr: "" }
  }

  const cmd = ["runuser", "-u", RUN_USER, "--", ...list]
  const ms = Number.isFinite(timeoutS) ? Math.max(1, Math.floor(timeoutS * 1000)) : 1200_000
  const p = spawnSafe({ kind: "tool", cmd, cwd, env, stdout: "pipe", stderr: "pipe", stdin: "ignore" })
  const out = new HeadTailBuffer(1024 * 1024)
  const err = new HeadTailBuffer(512 * 1024)
  const outP = readStream(p.stdout ?? null, out)
  const errP = readStream(p.stderr ?? null, err)
  var timed = false
  const timer = setTimeout(() => {
    timed = true
    p.kill()
  }, ms)
  const code0 = await p.exited.catch(() => 127)
  clearTimeout(timer)
  await Promise.all([outP, errP])
  const stdout = Buffer.from(out.toBytes()).toString("utf8")
  const stderr = Buffer.from(err.toBytes()).toString("utf8")

  if (timed) {
    return { ok: false, error: "Command timed out", exitCode: 124, stdout: "", stderr: "" }
  }

  return { ok: true, exitCode: code0, stdout, stderr }
}

const envWithVenv = (root: string) => {
  const env = baseEnv()
  const venv = path.join(root, ".venv")
  const bin = path.join(venv, "bin")

  if (!fs.existsSync(bin)) {
    return env
  }

  env.VIRTUAL_ENV = venv
  env.PATH = `${bin}:${env.PATH || ""}`
  return env
}

const ensureVenv = async (root: string) => {
  const venv = path.join(root, ".venv")

  if (fs.existsSync(venv)) {
    return { ok: true as const, venv }
  }

  const res = await runCmd(["python", "-m", "venv", ".venv"], root, 600, baseEnv())

  if (!res.ok || res.exitCode !== 0) {
    return { ok: false as const, error: res.error || "venv failed", venv }
  }

  return { ok: true as const, venv }
}

const nodeManager = (root: string) => {
  const has = (name: string) => fs.existsSync(path.join(root, name))

  if (has("bun.lockb") || has("bun.lock")) {
    return "bun"
  }

  if (has("pnpm-lock.yaml")) {
    return "pnpm"
  }

  if (has("yarn.lock")) {
    return "yarn"
  }

  if (has("package-lock.json")) {
    return "npm"
  }

  return "npm"
}

const detectProject = (root: string) => {
  const flags: string[] = []
  const has = (name: string) => fs.existsSync(path.join(root, name))

  if (has("package.json")) {
    flags.push("node")
  }

  if (has("pyproject.toml") || has("requirements.txt")) {
    flags.push("python")
  }

  if (has("Cargo.toml")) {
    flags.push("rust")
  }

  if (has("go.mod")) {
    flags.push("go")
  }

  if (has("pom.xml") || has("build.gradle") || has("build.gradle.kts")) {
    flags.push("java")
  }

  const order = ["node", "python", "rust", "go", "java"]
  var picked = ""

  for (var i = 0; i < order.length; i++) {
    const kind = order[i] ?? ""

    if (kind && flags.includes(kind)) {
      picked = kind
      break
    }
  }

  const warnings: string[] = []

  if (flags.length > 1) {
    warnings.push(`Multiple project types detected: ${flags.join(", ")}.`)
  }

  var manager = ""

  if (picked === "node") {
    manager = nodeManager(root)
  }

  if (picked === "python") {
    manager = "pip"
  }

  if (picked === "rust") {
    manager = "cargo"
  }

  if (picked === "go") {
    manager = "go"
  }

  if (picked === "java") {
    manager = has("pom.xml") ? "maven" : "gradle"
  }

  return { type: picked, manager, root, warnings }
}

const editorOpen = async (sessionId: string, fp: string, editor: string, line: number, col: number, target: string) => {
  const out = await resolvePath(fp, false)

  if (!out.ok) {
    return out
  }

  const ensured = await ensureTmuxSession(sessionId)

  if (!ensured.ok) {
    return { ok: false as const, error: ensured.error || "Failed to ensure tmux session" }
  }

  const cmd: string[] = [clean(editor) || "nvim"]

  if (line > 0 && col > 0) {
    cmd.push(`+call cursor(${line},${col})`)
  }

  if (line > 0 && col <= 0) {
    cmd.push(`+${line}`)
  }

  cmd.push(out.path)
  const dir = path.dirname(out.path)
  const tgt = cleanTarget(target)

  if (tgt) {
    const res = await tmuxCmd(["split-window", "-t", tgt, "-c", dir, "--", ...cmd], false)

    if (res.code !== 0) {
      return { ok: false as const, error: "Failed to open editor pane" }
    }

    return { ok: true as const, out: okOut({ path: out.path, target_pane: tgt, editor: cmd[0] }, []) }
  }

  const res = await tmuxCmd(["new-window", "-t", ensured.sessionId, "-c", dir, "--", ...cmd], false)

  if (res.code !== 0) {
    return { ok: false as const, error: "Failed to open editor window" }
  }

  return { ok: true as const, out: okOut({ path: out.path, editor: cmd[0] }, []) }
}

const projectDetect = async (root: string) => {
  const out = await resolveDir(root)

  if (!out.ok) {
    return out
  }

  const info = detectProject(out.path)
  const warnings = Array.isArray(info.warnings) ? info.warnings : []
  return { ok: true as const, out: okOut(info as Record<string, unknown>, warnings) }
}

const projectSetup = async (root: string) => {
  const out = await resolveDir(root)

  if (!out.ok) {
    return out
  }

  const info = detectProject(out.path)
  const kind = clean(info.type)
  const warnings = Array.isArray(info.warnings) ? info.warnings : []
  const result: Record<string, unknown> = { type: kind, manager: info.manager, root: out.path }

  if (kind === "python") {
    const v = await ensureVenv(out.path)

    if (!v.ok) {
      return { ok: false as const, error: v.error }
    }

    result.venv = v.venv
  }

  return { ok: true as const, out: okOut(result, warnings) }
}

const projectInstall = async (root: string, locked: boolean, network: boolean, hashes: boolean) => {
  const out = await resolveDir(root)

  if (!out.ok) {
    return out
  }

  if (!network) {
    return { ok: false as const, error: "Network disabled" }
  }

  const info = detectProject(out.path)
  const kind = clean(info.type)

  if (!kind) {
    return { ok: false as const, error: "Unsupported project type" }
  }

  const warnings = Array.isArray(info.warnings) ? info.warnings : []
  var cmd: string[] = []
  var env = baseEnv()

  const has = (name: string) => fs.existsSync(path.join(out.path, name))

  if (kind === "node") {
    const manager = clean(info.manager) || "npm"

    if (manager === "bun") {
      if (locked && !(has("bun.lockb") || has("bun.lock"))) {
        return { ok: false as const, error: "Missing bun.lockb or bun.lock" }
      }

      cmd = locked ? ["bun", "install", "--frozen-lockfile"] : ["bun", "install"]
    }

    if (manager === "pnpm") {
      if (locked && !has("pnpm-lock.yaml")) {
        return { ok: false as const, error: "Missing pnpm-lock.yaml" }
      }

      cmd = locked ? ["pnpm", "install", "--frozen-lockfile"] : ["pnpm", "install"]
    }

    if (manager === "yarn") {
      if (locked && !has("yarn.lock")) {
        return { ok: false as const, error: "Missing yarn.lock" }
      }

      cmd = locked ? ["yarn", "install", "--immutable"] : ["yarn", "install"]
    }

    if (manager === "npm") {
      if (locked && !has("package-lock.json")) {
        return { ok: false as const, error: "Missing package-lock.json" }
      }

      cmd = locked ? ["npm", "ci"] : ["npm", "install"]
    }
  }

  if (kind === "python") {
    if (locked && !has("requirements.txt")) {
      return { ok: false as const, error: "Missing requirements.txt" }
    }

    const v = await ensureVenv(out.path)

    if (!v.ok) {
      return { ok: false as const, error: v.error }
    }

    env = envWithVenv(out.path)
    cmd = ["python", "-m", "pip", "install", "-r", "requirements.txt"]

    if (hashes) {
      cmd.push("--require-hashes")
    }
  }

  if (kind === "rust") {
    cmd = locked ? ["cargo", "fetch", "--locked"] : ["cargo", "fetch"]
  }

  if (kind === "go") {
    cmd = locked ? ["go", "mod", "download", "-mod=readonly"] : ["go", "mod", "download"]
  }

  if (kind === "java") {
    if (has("pom.xml")) {
      cmd = ["mvn", "-q", "-DskipTests", "dependency:go-offline"]
    }

    if (!cmd.length && has("gradlew")) {
      cmd = ["./gradlew", "--no-daemon", "dependencies"]
    }

    if (!cmd.length && has("build.gradle")) {
      cmd = ["gradle", "dependencies"]
    }
  }

  if (!cmd.length) {
    return { ok: false as const, error: "Unsupported project type" }
  }

  const res = await runCmd(cmd, out.path, 1200, env)
  const result = {
    type: kind,
    manager: info.manager,
    root: out.path,
    command: cmd,
    exitCode: res.exitCode,
    stdout: res.stdout,
    stderr: res.stderr,
  }

  if (!res.ok) {
    return { ok: false as const, error: res.error || "Install failed", details: result }
  }

  return { ok: true as const, out: okOut(result, warnings) }
}

const projectRun = async (root: string, command: unknown, timeoutS: number) => {
  const out = await resolveDir(root)

  if (!out.ok) {
    return out
  }

  const list0 = Array.isArray(command) ? command : []
  const cmd: string[] = []

  for (var i = 0; i < list0.length; i++) {
    const row = list0[i]

    if (typeof row !== "string") {
      continue
    }

    const item = row.trim()

    if (!item) {
      continue
    }

    cmd.push(item)
  }

  if (!cmd.length) {
    return { ok: false as const, error: "Command must be a list" }
  }

  const env = envWithVenv(out.path)
  const res = await runCmd(cmd, out.path, timeoutS, env)
  const result = { root: out.path, command: cmd, exitCode: res.exitCode, stdout: res.stdout, stderr: res.stderr }

  if (!res.ok) {
    return { ok: false as const, error: res.error || "Run failed", details: result }
  }

  return { ok: true as const, out: okOut(result, []) }
}

const projectTest = async (root: string, timeoutS: number) => {
  const out = await resolveDir(root)

  if (!out.ok) {
    return out
  }

  const info = detectProject(out.path)
  const kind = clean(info.type)

  if (!kind) {
    return { ok: false as const, error: "Unsupported project type" }
  }

  var cmd: string[] = []
  const has = (name: string) => fs.existsSync(path.join(out.path, name))

  if (kind === "node") {
    const manager = clean(info.manager) || "npm"

    if (manager === "bun") {
      cmd = ["bun", "test"]
    }

    if (manager === "pnpm") {
      cmd = ["pnpm", "test"]
    }

    if (manager === "yarn") {
      cmd = ["yarn", "test"]
    }

    if (manager === "npm") {
      cmd = ["npm", "test"]
    }
  }

  if (kind === "python") {
    cmd = ["python", "-m", "pytest"]
  }

  if (kind === "rust") {
    cmd = ["cargo", "test"]
  }

  if (kind === "go") {
    cmd = ["go", "test", "./..."]
  }

  if (kind === "java") {
    if (has("pom.xml")) {
      cmd = ["mvn", "-q", "test"]
    }

    if (!cmd.length && has("gradlew")) {
      cmd = ["./gradlew", "--no-daemon", "test"]
    }

    if (!cmd.length && has("build.gradle")) {
      cmd = ["gradle", "test"]
    }
  }

  if (!cmd.length) {
    return { ok: false as const, error: "Unsupported project type" }
  }

  const env = envWithVenv(out.path)
  const res = await runCmd(cmd, out.path, timeoutS, env)
  const result = { type: kind, root: out.path, command: cmd, exitCode: res.exitCode, stdout: res.stdout, stderr: res.stderr }
  const warnings = Array.isArray(info.warnings) ? info.warnings : []

  if (!res.ok) {
    return { ok: false as const, error: res.error || "Test failed", details: result }
  }

  return { ok: true as const, out: okOut(result, warnings) }
}

const authorize = (req: Request) => {
  if (!TOKEN) {
    return { ok: false as const, res: jsonRes(500, { error: "TERM_AGENT_TOKEN not set" }) }
  }

  const tok = clean(req.headers.get("x-term-agent-token") ?? "")

  if (tok !== TOKEN) {
    return { ok: false as const, res: jsonRes(401, { error: "Unauthorized" }) }
  }

  return { ok: true as const }
}

const permCheck = (kind: "read" | "write" | "exec") => {
  if (allowPerm(kind)) {
    return { ok: true as const }
  }

  return { ok: false as const, res: jsonRes(403, { ok: false, error: "Permission denied" }) }
}

const healthPayload = () => {
  return {
    ok: true,
    ts: nowIso(),
    session_root: ROOT,
    workspace_root: ROOT,
    token_configured: !!TOKEN,
    tmux_available: !!Bun.which("tmux"),
    perms: Array.from(PERMS).sort(),
  }
}

await ensureDirs()

const srv = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  fetch: async (req) => {
    const url = new URL(req.url)
    const p = url.pathname

    if (req.method === "GET" && (p === TERM_AGENT_V1.health || p === TERM_AGENT_V1.ready)) {
      return jsonRes(200, healthPayload())
    }

    if (req.method !== "POST") {
      return jsonRes(404, { error: "Not found" })
    }

    const auth = authorize(req)

    if (!auth.ok) {
      return auth.res
    }

    const data = await readJson(req)

    if (!data) {
      return jsonRes(400, { error: "Invalid JSON body" })
    }

    const sid = cleanSession(data.sessionId)

    if (p === TERM_AGENT_V1.sessionEnsure) {
      const ensured = await ensureTmuxSession(sid)

      if (!ensured.ok) {
        return jsonRes(500, { error: ensured.error })
      }

      return jsonRes(200, { ok: true, sessionId: ensured.sessionId })
    }

    if (p === TERM_AGENT_V1.terminal.open) {
      const perm = permCheck("exec")

      if (!perm.ok) {
        return perm.res
      }

      const ensured = await ensureTmuxSession(sid)

      if (!ensured.ok) {
        return jsonRes(400, { ok: false, error: ensured.error })
      }

      const dir = await resolveSessionDir(sid, data.cwd)

      if (!dir.ok) {
        return jsonRes(400, { ok: false, error: dir.error })
      }

      return withLock(sid, async () => {
        const res = await tmuxCmd(["new-window", "-P", "-F", "#{pane_id}", "-t", sid, "-c", dir.dir], true)

        if (res.code !== 0) {
          return jsonRes(400, { ok: false, error: "Failed to open PTY" })
        }

        const pane = clean(res.stdout.split(/\r?\n/g).filter((x) => clean(x)).slice(-1)[0] ?? "")

        if (!pane) {
          return jsonRes(400, { ok: false, error: "Failed to allocate PTY pane" })
        }

        const cols0 = intFrom(data.cols, 0)
        const rows0 = intFrom(data.rows, 0)
        const cols = cols0 > 0 ? cols0 : 0
        const rows = rows0 > 0 ? rows0 : 0

        if (cols > 0 || rows > 0) {
          const cmd: string[] = ["resize-pane", "-t", pane]

          if (cols > 0) {
            cmd.push("-x", `${cols}`)
          }

          if (rows > 0) {
            cmd.push("-y", `${rows}`)
          }

          await tmuxCmd(cmd, false)
        }

        const pid = opMeta().id
        PTYS.set(pid, { sessionId: sid, target_pane: pane, cwd: dir.dir })
        return jsonRes(200, { ok: true, process_id: pid, target_pane: pane, sessionId: sid, cwd: dir.dir })
      })
    }

    if (p === TERM_AGENT_V1.terminal.resize) {
      const perm = permCheck("exec")

      if (!perm.ok) {
        return perm.res
      }

      const pid = cleanTarget(data.process_id)
      const row = pid ? (PTYS.get(pid) ?? null) : null

      if (!row) {
        return jsonRes(400, { ok: false, error: "Unknown process_id" })
      }

      const cols0 = intFrom(data.cols, 0)
      const rows0 = intFrom(data.rows, 0)
      const cols = cols0 > 0 ? cols0 : 0
      const rows = rows0 > 0 ? rows0 : 0

      if (cols <= 0 && rows <= 0) {
        return jsonRes(400, { ok: false, error: "Missing cols/rows" })
      }

      const cmd: string[] = ["resize-pane", "-t", row.target_pane]

      if (cols > 0) {
        cmd.push("-x", `${cols}`)
      }

      if (rows > 0) {
        cmd.push("-y", `${rows}`)
      }

      const res = await tmuxCmd(cmd, false)

      if (res.code !== 0) {
        return jsonRes(400, { ok: false, error: "Failed to resize PTY" })
      }

      return jsonRes(200, { ok: true, process_id: pid, target_pane: row.target_pane, cols, rows })
    }

    if (p === TERM_AGENT_V1.terminal.terminate) {
      const perm = permCheck("exec")

      if (!perm.ok) {
        return perm.res
      }

      const pid = cleanTarget(data.process_id)
      const row = pid ? (PTYS.get(pid) ?? null) : null

      if (!row) {
        return jsonRes(400, { ok: false, error: "Unknown process_id" })
      }

      await tmuxCmd(["kill-pane", "-t", row.target_pane], false)
      PTYS.delete(pid)
      return jsonRes(200, { ok: true, process_id: pid, terminated: true })
    }

    if (p === TERM_AGENT_V1.terminal.send) {
      const perm = permCheck("exec")

      if (!perm.ok) {
        return perm.res
      }

      const ensured = await ensureTmuxSession(sid)

      if (!ensured.ok) {
        return jsonRes(500, { error: ensured.error })
      }

      const keys = clean(data.keys)
      const enter = data.enter === true
      const target = typeof data.target_pane === "string" ? data.target_pane : ""
      const boundary = await commandBoundaryError(sid, keys)

      if (boundary) {
        return jsonRes(400, { ok: false, error: boundary })
      }

      return withLock(sid, async () => {
        await sendKeys(sid, keys, enter, target)
        return jsonRes(200, { ok: true })
      })
    }

    if (p === TERM_AGENT_V1.terminal.capture) {
      const perm = permCheck("exec")

      if (!perm.ok) {
        return perm.res
      }

      const ensured = await ensureTmuxSession(sid)

      if (!ensured.ok) {
        return jsonRes(500, { error: ensured.error })
      }

      const tail0 = intFrom(data.tailLines, 200)
      const tail = Math.max(1, tail0)
      const target = typeof data.target_pane === "string" ? data.target_pane : ""

      return withLock(sid, async () => {
        const cap = await capturePane(sid, tail, target)
        return cap.ok ? jsonRes(200, { text: cap.text }) : jsonRes(500, { error: cap.error })
      })
    }

    if (p === TERM_AGENT_V1.terminal.exec) {
      const perm = permCheck("exec")

      if (!perm.ok) {
        return perm.res
      }

      const ensured = await ensureTmuxSession(sid)

      if (!ensured.ok) {
        return jsonRes(500, { error: ensured.error })
      }

      const cmd0 = typeof data.command === "string" ? data.command : ""
      const cmd = cmd0.trim()

      if (!cmd) {
        return jsonRes(504, { error: "Missing command", exitCode: 127, output: "", truncated: false })
      }

      const boundary = await commandBoundaryError(sid, cmd)

      if (boundary) {
        return jsonRes(504, { error: boundary, exitCode: 126, output: boundary, truncated: false })
      }

      const dir = await resolveSessionDir(sid, data.cwd)

      if (!dir.ok) {
        return jsonRes(504, { error: dir.error, exitCode: 127, output: "", truncated: false })
      }

      const ms0 = intFrom(data.timeoutMs, 20000)
      const ms = Math.max(200, ms0)
      const max0 = intFrom(data.maxChars, 4000)
      const max = max0 > 0 ? max0 : 0
      const mark = opMeta().id
      const start = `DS_START${mark}_`
      const end = `DS_END${mark}_`
      const target = typeof data.target_pane === "string" ? data.target_pane : ""
      const tgt = cleanTarget(target) || sid
      const full = `cd ${JSON.stringify(dir.dir)} && ${cmd}`
      const b64 = Buffer.from(full, "utf8").toString("base64")
      const line = `printf '${start}\\n'; DS_CMD=$(printf %s ${JSON.stringify(b64)} | base64 -d); bash -lc \"$DS_CMD\"; code=$?; printf '${end} exit=%s\\n' \"$code\"`
      const deadline = Date.now() + ms
      const tail = max > 0 ? Math.max(200, Math.floor(max / 4)) : 200

      return withLock(sid, async () => {
        await sendKeys(sid, "stty -echo", true, tgt)
        await sendKeys(sid, line, true, tgt)

        for (;;) {
          if (Date.now() > deadline) {
            await tmuxCmd(["send-keys", "-t", tgt, "C-c"], false)
            await sendKeys(sid, "stty echo", true, tgt)
            return jsonRes(504, { error: "Command timed out", exitCode: 124, output: "", truncated: false })
          }

          const cap = await capturePane(sid, tail, tgt)

          if (!cap.ok) {
            await Bun.sleep(100)
            continue
          }

          const txt = cap.text
          const e = txt.lastIndexOf(end)

          if (e < 0) {
            await Bun.sleep(100)
            continue
          }

          const s = txt.lastIndexOf(start, e)

          if (s < 0) {
            await Bun.sleep(100)
            continue
          }

          const nl = txt.indexOf("\n", s)
          const bodyStart = nl < 0 ? s + start.length : nl + 1
          var out = txt.slice(bodyStart, e).replace(/\n+$/g, "")
          var truncated = false

          if (max > 0 && out.length > max) {
            out = out.slice(0, max)
            truncated = true
          }

          const endLineEnd = txt.indexOf("\n", e)
          const lineEnd = endLineEnd < 0 ? txt.length : endLineEnd
          const endLine = txt.slice(e, lineEnd)
          const m = endLine.match(/exit=([-0-9]+)/)
          const code0 = m ? Number.parseInt(m[1] ?? "0", 10) : 0
          const code = Number.isFinite(code0) ? Math.floor(code0) : 0
          await sendKeys(sid, "stty echo", true, tgt)
          return jsonRes(200, { exitCode: code, output: out, truncated })
        }
      })
    }

    if (p === TERM_AGENT_V1.editor.open) {
      const perm = permCheck("exec")

      if (!perm.ok) {
        return perm.res
      }

      const scoped = await scopedSessionPath(sid, data.path)
      const editor = typeof data.editor === "string" ? data.editor : "nvim"
      const line0 = intFrom(data.line, 0)
      const col0 = intFrom(data.col, 0)
      const line = line0 > 0 ? line0 : 0
      const col = col0 > 0 ? col0 : 0
      const target = typeof data.target_pane === "string" ? data.target_pane : ""
      const out = await editorOpen(sid, scoped, editor, line, col, target)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error })
    }

    if (p === TERM_AGENT_V1.project.detect) {
      const perm = permCheck("read")

      if (!perm.ok) {
        return perm.res
      }

      const scoped = await scopedSessionPath(sid, data.root)
      const out = await projectDetect(scoped)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error })
    }

    if (p === TERM_AGENT_V1.project.setup) {
      const perm = permCheck("exec")

      if (!perm.ok) {
        return perm.res
      }

      const scoped = await scopedSessionPath(sid, data.root)
      const out = await projectSetup(scoped)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error })
    }

    if (p === TERM_AGENT_V1.project.install) {
      const perm = permCheck("exec")

      if (!perm.ok) {
        return perm.res
      }

      const scoped = await scopedSessionPath(sid, data.root)
      const locked = data.locked !== false
      const network = data.network !== false
      const hashes = data.hashes === true
      const out = await projectInstall(scoped, locked, network, hashes)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error, details: (out as { details?: unknown }).details })
    }

    if (p === TERM_AGENT_V1.project.run) {
      const perm = permCheck("exec")

      if (!perm.ok) {
        return perm.res
      }

      const scoped = await scopedSessionPath(sid, data.root)
      const command = data.command
      const timeout0 = intFrom(data.timeout_s, 1200)
      const timeoutS = Math.max(1, timeout0)
      const out = await projectRun(scoped, command, timeoutS)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error, details: (out as { details?: unknown }).details })
    }

    if (p === TERM_AGENT_V1.project.test) {
      const perm = permCheck("exec")

      if (!perm.ok) {
        return perm.res
      }

      const scoped = await scopedSessionPath(sid, data.root)
      const timeout0 = intFrom(data.timeout_s, 1200)
      const timeoutS = Math.max(1, timeout0)
      const out = await projectTest(scoped, timeoutS)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error, details: (out as { details?: unknown }).details })
    }

    if (p === TERM_AGENT_V1.fs.list) {
      const perm = permCheck("read")

      if (!perm.ok) {
        return perm.res
      }

      const scoped = await scopedSessionPath(sid, data.path)
      const recursive = data.recursive === true
      const maxEntries0 = intFrom(data.max_entries, 2000)
      const maxEntries = Math.max(1, maxEntries0)
      const maxDepth0 = intFrom(data.max_depth, 20)
      const maxDepth = Math.max(-1, maxDepth0)
      const out = await fsList(scoped, recursive, maxEntries, maxDepth)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error })
    }

    if (p === TERM_AGENT_V1.fs.stat) {
      const perm = permCheck("read")

      if (!perm.ok) {
        return perm.res
      }

      const scoped = await scopedSessionPath(sid, data.path)
      const out = await fsStat(scoped)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error })
    }

    if (p === TERM_AGENT_V1.fs.read) {
      const perm = permCheck("read")

      if (!perm.ok) {
        return perm.res
      }

      const scoped = await scopedSessionPath(sid, data.path)
      const maxBytes0 = intFrom(data.max_bytes, 0)
      const maxBytes = maxBytes0 > 0 ? maxBytes0 : 0
      const startLine0 = intFrom(data.start_line, 0)
      const startLine = startLine0 > 0 ? startLine0 : 0
      const endLine0 = intFrom(data.end_line, 0)
      const endLine = endLine0 > 0 ? endLine0 : 0
      const binary = data.binary === true
      const out = await fsRead(scoped, maxBytes, startLine, endLine, binary)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error })
    }

    if (p === TERM_AGENT_V1.fs.write) {
      const perm = permCheck("write")

      if (!perm.ok) {
        return perm.res
      }

      const scoped = await scopedSessionPath(sid, data.path)
      const atomic = data.atomic !== false
      const createParents = data.create_parents !== false
      const out = await fsWrite(scoped, data.content, atomic, createParents)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error })
    }

    if (p === TERM_AGENT_V1.fs.move) {
      const perm = permCheck("write")

      if (!perm.ok) {
        return perm.res
      }

      const src = await scopedSessionPath(sid, data.src)
      const dst = await scopedSessionPath(sid, data.dst)
      const overwrite = data.overwrite === true
      const out = await fsMove(src, dst, overwrite)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error })
    }

    if (p === TERM_AGENT_V1.fs.copy) {
      const perm = permCheck("write")

      if (!perm.ok) {
        return perm.res
      }

      const src = await scopedSessionPath(sid, data.src)
      const dst = await scopedSessionPath(sid, data.dst)
      const recursive = data.recursive !== false
      const overwrite = data.overwrite === true
      const out = await fsCopy(src, dst, recursive, overwrite)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error })
    }

    if (p === TERM_AGENT_V1.fs.delete) {
      const perm = permCheck("write")

      if (!perm.ok) {
        return perm.res
      }

      const scoped = await scopedSessionPath(sid, data.path)
      const recursive = data.recursive === true
      const toTrash = data.to_trash !== false
      const out = await fsDelete(scoped, recursive, toTrash)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error })
    }

    if (p === TERM_AGENT_V1.fs.mkdir) {
      const perm = permCheck("write")

      if (!perm.ok) {
        return perm.res
      }

      const scoped = await scopedSessionPath(sid, data.path)
      const parents = data.parents !== false
      const out = await fsMkdir(scoped, parents)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error })
    }

    if (p === TERM_AGENT_V1.fs.purge) {
      const perm = permCheck("write")

      if (!perm.ok) {
        return perm.res
      }

      const p0 = clean(data.path)
      const scoped = p0 ? await scopedSessionPath(sid, p0) : ""
      const recursive = data.recursive !== false
      const out = await fsPurge(scoped, recursive)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error })
    }

    if (p === TERM_AGENT_V1.fs.applyPatch) {
      const perm = permCheck("write")

      if (!perm.ok) {
        return perm.res
      }

      const scoped = await scopedSessionPath(sid, data.path)
      const diff = typeof data.unified_diff === "string" ? data.unified_diff : ""
      const out = await fsApplyPatch(scoped, diff)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error })
    }

    if (p === TERM_AGENT_V1.fs.replaceRanges) {
      const perm = permCheck("write")

      if (!perm.ok) {
        return perm.res
      }

      const scoped = await scopedSessionPath(sid, data.path)
      const list0 = Array.isArray(data.ranges) ? data.ranges : []
      const ranges: Array<{ start_line: number; end_line: number; content: string }> = []

      for (var i = 0; i < list0.length; i++) {
        const row = list0[i]
        const obj = row && typeof row === "object" ? (row as Record<string, unknown>) : null

        if (!obj) {
          continue
        }

        const a0 = intFrom(obj.start_line, 0)
        const b0 = intFrom(obj.end_line, 0)
        const a = a0 > 0 ? a0 : 0
        const b = b0 > 0 ? b0 : 0
        const content = typeof obj.content === "string" ? obj.content : ""

        if (a < 1 || b < a) {
          continue
        }

        ranges.push({ start_line: a, end_line: b, content })
      }

      if (!ranges.length) {
        return jsonRes(400, { ok: false, error: "Ranges must be a list" })
      }

      const out = await fsReplaceRanges(scoped, ranges)
      return out.ok ? jsonRes(200, out.out) : jsonRes(400, { ok: false, error: out.error })
    }

    return jsonRes(404, { error: "Not found" })
  },
})

console.log(`term-agent-server listening on ${srv.hostname}:${srv.port}`)
