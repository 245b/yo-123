import path from "node:path"
import { mkdir, readdir, unlink } from "node:fs/promises"
import { fsDelete } from "../terminal/client"
import { inside, norm } from "../utils/path"
import { createCleanupQueueStore } from "../../../packages/data/src/cleanupQueueStore"

type QueueRow = {
  chatId: string
  ts: string
  attempts: number
}

export type ChatCleanupResult = {
  ok: boolean
  chatId: string
  removedPaths: string[]
  removedFiles: string[]
  errors: string[]
}

export type ChatCleanupService = {
  start: () => void
  request: (chatId: string) => Promise<ChatCleanupResult>
}

const parseJson = (raw: string) => {
  const t0 = typeof raw === "string" ? raw : ""
  const t = t0.trim()

  if (!t) {
    return null
  }

  try {
    return JSON.parse(t) as unknown
  } catch {
    return null
  }
}

const cleanId = (raw: string) => {
  const t0 = typeof raw === "string" ? raw : ""
  const t = t0.trim()

  if (!t) {
    return ""
  }

  if (!/^[a-zA-Z0-9_-]{4,128}$/.test(t)) {
    return ""
  }

  return t
}

const dataBase = (root: string) => {
  const v0 = process.env.OPERATOR_DATA_DIR ?? ""
  const v1 = typeof v0 === "string" ? v0 : ""
  const v = v1.trim()
  return v || path.join(root, "data")
}

const queuePath = (base: string) => path.join(base, "chat_cleanup_queue.json")

const workspaceRoot = () => {
  const v0 = process.env.WORKSPACE_ROOT ?? ""
  const v1 = typeof v0 === "string" ? v0 : ""
  const v = norm(v1.trim() || "/workspace")
  return v || "/workspace"
}

const parseToken = (raw: string) => {
  const t0 = typeof raw === "string" ? raw : ""
  var t = t0.trim()

  if (!t) {
    return ""
  }

  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim()
  }

  if (!t) {
    return ""
  }

  if (t.startsWith("-")) {
    return ""
  }

  if (/[`$*?<>|]/.test(t)) {
    return ""
  }

  return t
}

const asWorkspacePath = (raw: string, root: string) => {
  const tok0 = parseToken(raw)
  const tok1 = tok0.replace(/\\/g, "/")
  const tok = tok1.trim()

  if (!tok) {
    return ""
  }

  const abs0 = tok.startsWith("/") ? tok : `${root}/${tok}`
  const abs = norm(abs0)

  if (!abs) {
    return ""
  }

  if (!inside(root, abs)) {
    return ""
  }

  if (abs === root || abs === `${root}/`) {
    return ""
  }

  return abs
}

const commandPaths = (cmd: string, root: string) => {
  const out: string[] = []
  const re = /\bmkdir\b([^;&|\n\r]*)/g

  for (;;) {
    const m = re.exec(cmd)

    if (!m) {
      break
    }

    const chunk0 = m[1] ?? ""
    const chunk = chunk0.trim()

    if (!chunk) {
      continue
    }

    const parts = chunk.split(/\s+/)

    for (var i = 0; i < parts.length; i++) {
      const part = parts[i] ?? ""
      const abs = asWorkspacePath(part, root)

      if (!abs) {
        continue
      }

      out.push(abs)
    }
  }

  return out
}

const dedupe = (list: string[]) => {
  const seen: Record<string, 1> = {}
  const out: string[] = []

  for (var i = 0; i < list.length; i++) {
    const it0 = list[i] ?? ""
    const it = it0.trim()

    if (!it) {
      continue
    }

    if (seen[it]) {
      continue
    }

    seen[it] = 1
    out.push(it)
  }

  return out
}

const readQueue = async (fp: string) => {
  const txt0 = await Bun.file(fp).text().catch(() => "")
  const txt = txt0.trim()

  if (!txt) {
    return [] as QueueRow[]
  }

  const parsed = parseJson(txt)
  const list = Array.isArray(parsed) ? parsed : []
  const out: QueueRow[] = []

  for (var i = 0; i < list.length; i++) {
    const row = (list[i] && typeof list[i] === "object" ? list[i] : null) as {
      chatId?: unknown
      ts?: unknown
      attempts?: unknown
    } | null

    if (!row) {
      continue
    }

    const id0 = typeof row.chatId === "string" ? row.chatId : ""
    const chatId = cleanId(id0)

    if (!chatId) {
      continue
    }

    const ts0 = typeof row.ts === "string" ? row.ts : ""
    const ts = ts0.trim() || new Date().toISOString()
    const attempts0 = typeof row.attempts === "number" ? row.attempts : Number.parseInt(`${row.attempts ?? 0}`, 10)
    const attempts = Number.isFinite(attempts0) ? Math.max(0, Math.floor(attempts0)) : 0
    out.push({ chatId, ts, attempts })
  }

  return out
}

const writeQueue = async (fp: string, rows: QueueRow[]) => {
  const dir = path.dirname(fp)
  await mkdir(dir, { recursive: true }).catch(() => {})
  const body = JSON.stringify(rows, null, 2)
  const ok = await Bun.write(fp, body).then(() => true).catch(() => false)
  return ok
}

const matchChat = (raw: string, chatId: string) => {
  if (!raw) {
    return false
  }

  if (raw.includes(`"chatId":"${chatId}"`)) {
    return true
  }

  if (raw.includes(`"chatId": "${chatId}"`)) {
    return true
  }

  return false
}

const listFiles = async (dir: string) => {
  const names = await readdir(dir).catch(() => [] as string[])
  const out: string[] = []

  for (var i = 0; i < names.length; i++) {
    const name = names[i] ?? ""

    if (!name || !name.endsWith(".json")) {
      continue
    }

    out.push(path.join(dir, name))
  }

  return out
}

const collectPaths = async (logsDir: string, chatId: string, root: string) => {
  const files = await listFiles(logsDir)
  const out: string[] = []

  for (var i = 0; i < files.length; i++) {
    const fp = files[i] ?? ""

    if (!fp) {
      continue
    }

    const raw = await Bun.file(fp).text().catch(() => "")

    if (!matchChat(raw, chatId)) {
      continue
    }

    const obj0 = parseJson(raw)
    const obj = (obj0 && typeof obj0 === "object" ? obj0 : null) as {
      chatId?: unknown
      tool?: unknown
      args?: unknown
    } | null

    if (!obj) {
      continue
    }

    const id0 = typeof obj.chatId === "string" ? obj.chatId : ""
    const id = cleanId(id0)

    if (id !== chatId) {
      continue
    }

    const tool0 = typeof obj.tool === "string" ? obj.tool : ""
    const tool = tool0.trim()
    const args = (obj.args && typeof obj.args === "object" ? obj.args : null) as {
      command?: unknown
      path?: unknown
    } | null

    if (!args) {
      continue
    }

    if (tool === "terminal_exec") {
      const command0 = typeof args.command === "string" ? args.command : ""
      const command = command0.trim()

      if (!command) {
        continue
      }

      const list = commandPaths(command, root)

      for (var j = 0; j < list.length; j++) {
        out.push(list[j] ?? "")
      }
    }

    if (tool === "fs_mkdir") {
      const path0 = typeof args.path === "string" ? args.path : ""
      const abs = asWorkspacePath(path0, root)

      if (abs) {
        out.push(abs)
      }
    }
  }

  return dedupe(out)
}

const removePath = async (target: string) => {
  const res = await fsDelete({ path: target, recursive: true, toTrash: false })

  if (res.ok) {
    return { ok: true, error: "" }
  }

  const err0 = typeof res.error === "string" ? res.error : "Delete failed"
  const err = err0.trim()

  if (/not found|does not exist|enoent/i.test(err)) {
    return { ok: true, error: "" }
  }

  return { ok: false, error: err || "Delete failed" }
}

const removeChatFiles = async (dirs: string[], chatId: string) => {
  const removed: string[] = []
  const errors: string[] = []

  for (var di = 0; di < dirs.length; di++) {
    const dir = dirs[di] ?? ""
    const files = await listFiles(dir)

    for (var i = 0; i < files.length; i++) {
      const fp = files[i] ?? ""
      const raw = await Bun.file(fp).text().catch(() => "")

      if (!matchChat(raw, chatId)) {
        continue
      }

      const ok = await unlink(fp).then(() => true).catch(() => false)

      if (ok) {
        removed.push(fp)
        continue
      }

      errors.push(`Failed to remove log file: ${fp}`)
    }
  }

  return { removed, errors }
}

const createResult = (chatId: string): ChatCleanupResult => ({
  ok: true,
  chatId,
  removedPaths: [],
  removedFiles: [],
  errors: [],
})

export const createChatCleanupService = (root: string): ChatCleanupService => {
  const base = dataBase(root)
  const logs = path.join(base, "logs")
  const transcripts = path.join(base, "transcripts")
  const sessions = path.join(base, "sessions")
  const queueStore = createCleanupQueueStore(base)
  const ws = workspaceRoot()
  const everyMs = 10 * 60 * 1000
  var timer: ReturnType<typeof setInterval> | null = null
  var running = false

  const runCleanup = async (chatId: string) => {
    const out = createResult(chatId)
    const targets = await collectPaths(logs, chatId, ws)

    for (var i = 0; i < targets.length; i++) {
      const target = targets[i] ?? ""

      if (!target) {
        continue
      }

      const res = await removePath(target)

      if (res.ok) {
        out.removedPaths.push(target)
        continue
      }

      out.ok = false
      out.errors.push(`Failed to remove ${target}: ${res.error}`)
    }

    const rm = await removeChatFiles([logs, transcripts, sessions], chatId)

    for (var i = 0; i < rm.removed.length; i++) {
      out.removedFiles.push(rm.removed[i] ?? "")
    }

    for (var i = 0; i < rm.errors.length; i++) {
      out.errors.push(rm.errors[i] ?? "")
      out.ok = false
    }

    return out
  }

  const queueUpsert = async (chatId: string) => {
    await queueStore.upsert(chatId)
  }

  const queueDrop = async (chatId: string) => {
    await queueStore.drop(chatId)
  }

  const processQueue = async () => {
    if (running) {
      return
    }

    running = true
    const list = await queueStore.list()
    const keep: QueueRow[] = []

    for (var i = 0; i < list.length; i++) {
      const row = list[i]
      const chatId = cleanId(row?.chatId ?? "")

      if (!chatId) {
        continue
      }

      const res = await runCleanup(chatId)

      if (res.ok) {
        continue
      }

      const attempts = (row?.attempts ?? 0) + 1

      if (attempts >= 24) {
        continue
      }

      keep.push({ chatId, ts: new Date().toISOString(), attempts })
    }

    await queueStore.replace(keep)
    running = false
  }

  const request = async (rawChatId: string) => {
    const chatId = cleanId(rawChatId)

    if (!chatId) {
      return {
        ok: false,
        chatId: "",
        removedPaths: [],
        removedFiles: [],
        errors: ["Invalid chatId"],
      } as ChatCleanupResult
    }

    await queueUpsert(chatId)
    const res = await runCleanup(chatId)

    if (res.ok) {
      await queueDrop(chatId)
      return res
    }

    return res
  }

  const start = () => {
    if (timer) {
      return
    }

    void mkdir(base, { recursive: true }).catch(() => {})
    timer = setInterval(() => {
      void processQueue()
    }, everyMs)

    void processQueue()
  }

  return { start, request }
}
