export type TermStatus = "running" | "done" | "failed"

export type TermLike = {
  id: string
  tool: string
  input: string
  output: string
  status: TermStatus
}

export type CreatedArtifact = {
  path: string
  kind: "file" | "folder"
  content: string
  source: "fs" | "shell"
  at: number
}

export type ExplorerNode = {
  path: string
  name: string
  kind: "file" | "folder"
  children: ExplorerNode[]
}

const str = (raw: unknown) => {
  const txt0 = typeof raw === "string" ? raw : ""
  return txt0
}

const trim = (raw: unknown) => {
  return str(raw).trim()
}

const obj = (raw: unknown) => {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
  return row
}

export const isShellToolName = (raw: string) => {
  const name = trim(raw).toLowerCase()

  if (!name) {
    return false
  }

  if (name === "terminal_exec") {
    return true
  }

  if (name === "terminal") {
    return true
  }

  if (name === "shell") {
    return true
  }

  if (name === "bash") {
    return true
  }

  if (name === "sh") {
    return true
  }

  if (name === "cmd") {
    return true
  }

  if (name === "command") {
    return true
  }

  if (name === "session_ensure") {
    return true
  }

  if (name.includes("terminal")) {
    return true
  }

  if (name.includes("shell")) {
    return true
  }

  if (name.includes("exec")) {
    return true
  }

  return false
}

const json = (raw: string) => {
  const txt = str(raw).trim()

  if (!txt) {
    return null
  }

  try {
    return JSON.parse(txt) as unknown
  } catch {
    return null
  }
}

const token = (raw: string) => {
  const txt0 = str(raw).trim()

  if (!txt0) {
    return ""
  }

  const q0 = txt0.startsWith('"') && txt0.endsWith('"')
  const q1 = txt0.startsWith("'") && txt0.endsWith("'")

  if (!q0 && !q1) {
    return txt0
  }

  const txt1 = txt0.slice(1, -1).trim()
  return txt1
}

const parts = (raw: string) => {
  const txt0 = token(raw)
  const txt1 = txt0.replace(/\\/g, "/").replace(/^[a-zA-Z]:\//, "").replace(/^\/+/, "")
  const txt2 = txt1.trim()

  if (!txt2) {
    return [] as string[]
  }

  const list = txt2.split("/")
  const out: string[] = []

  for (var i = 0; i < list.length; i++) {
    const row = (list[i] ?? "").trim()

    if (!row) {
      continue
    }

    if (row === ".") {
      continue
    }

    if (row === "..") {
      continue
    }

    out.push(row)
  }

  return out
}

const dropRoot = (list: string[]) => {
  const out = list.slice()

  if (out.length > 3) {
    const p0 = (out[0] ?? "").toLowerCase()
    const p1 = (out[1] ?? "").toLowerCase()

    if (p0 === "projects" && (p1 === "operator" || p1 === "_workspaces")) {
      return out.slice(3)
    }
  }

  if (out.length > 3) {
    const p0 = (out[0] ?? "").toLowerCase()
    const p1 = (out[1] ?? "").toLowerCase()

    if (p0 === "workspace" && p1 === "operator") {
      return out.slice(3)
    }
  }

  if (out.length > 2) {
    const p0 = (out[0] ?? "").toLowerCase()
    const p1 = trim(out[1] ?? "").toLowerCase()
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p1)
    const hash = /^[a-z0-9_-]{24,}$/.test(p1)
    const session = uuid || hash

    if (p0 === "operator" && session) {
      return out.slice(2)
    }
  }

  return out
}

export const normalizeArtifactPath = (raw: string) => {
  const list0 = parts(raw)
  const list = dropRoot(list0)
  const out = list.join("/").trim()
  return out
}

const readArgs = (input: string, tool: string) => {
  const src = trim(input)
  const name = trim(tool)

  if (!src) {
    return null
  }

  if (!name) {
    return null
  }

  if (!src.startsWith(name)) {
    return null
  }

  const raw = src.slice(name.length).trim()

  if (!raw) {
    return null
  }

  return obj(json(raw))
}

const readFsResult = (output: string) => {
  const row = obj(json(output))

  if (!row) {
    return null
  }

  if (row.ok !== true) {
    return null
  }

  const res = obj(row.result)
  return res
}

const fsCreated = (res: Record<string, unknown> | null) => {
  const before = obj(res?.before)
  const after = obj(res?.after)
  const prev = before?.exists
  const next = after?.exists
  return prev === false && next === true
}

const pathFromFs = (res: Record<string, unknown> | null) => {
  const direct = trim(res?.path)

  if (direct) {
    return normalizeArtifactPath(direct)
  }

  const after = obj(res?.after)
  const fromAfter = trim(after?.path)
  return normalizeArtifactPath(fromAfter)
}

const fsWriteArtifact = (term: TermLike) => {
  if (term.tool !== "fs_write") {
    return [] as CreatedArtifact[]
  }

  const args = readArgs(term.input, "fs_write")
  const argPath = normalizeArtifactPath(str(args?.path))
  const argContent = str(args?.content)

  if (term.status === "running") {
    if (!argPath) {
      return [] as CreatedArtifact[]
    }

    const row: CreatedArtifact = {
      path: argPath,
      kind: "file",
      content: argContent,
      source: "fs",
      at: Date.now(),
    }
    return [row]
  }

  if (term.status !== "done") {
    return [] as CreatedArtifact[]
  }

  const res = readFsResult(term.output)
  const created = fsCreated(res)
  const path = pathFromFs(res) || argPath

  if (!path) {
    return [] as CreatedArtifact[]
  }

  if (!created && !argPath) {
    return [] as CreatedArtifact[]
  }

  const content = argContent
  const row: CreatedArtifact = {
    path,
    kind: "file",
    content,
    source: "fs",
    at: Date.now(),
  }
  return [row]
}

const fsMkdirArtifact = (term: TermLike) => {
  if (term.tool !== "fs_mkdir") {
    return [] as CreatedArtifact[]
  }

  const args = readArgs(term.input, "fs_mkdir")
  const argPath = normalizeArtifactPath(str(args?.path))

  if (term.status === "running") {
    if (!argPath) {
      return [] as CreatedArtifact[]
    }

    const row: CreatedArtifact = {
      path: argPath,
      kind: "folder",
      content: "",
      source: "fs",
      at: Date.now(),
    }
    return [row]
  }

  if (term.status !== "done") {
    return [] as CreatedArtifact[]
  }

  const res = readFsResult(term.output)
  const created = fsCreated(res)
  const path = pathFromFs(res) || argPath

  if (!path) {
    return [] as CreatedArtifact[]
  }

  if (!created && !argPath) {
    return [] as CreatedArtifact[]
  }

  const row: CreatedArtifact = {
    path,
    kind: "folder",
    content: "",
    source: "fs",
    at: Date.now(),
  }
  return [row]
}

const parseChunk = (raw: string) => {
  const out: string[] = []
  const re = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\S+/g

  for (;;) {
    const m = re.exec(raw)

    if (!m) {
      return out
    }

    const text0 = m[0] ?? ""
    const text = token(text0)

    if (!text) {
      continue
    }

    out.push(text)
  }
}

const pushShellRows = (out: CreatedArtifact[], list: string[], kind: "file" | "folder", at: number) => {
  for (var i = 0; i < list.length; i++) {
    const raw = list[i] ?? ""

    if (!raw) {
      continue
    }

    if (raw.startsWith("-")) {
      continue
    }

    const path = normalizeArtifactPath(raw)

    if (!path) {
      continue
    }

    if (path === "dev/null") {
      continue
    }

    out.push({
      path,
      kind,
      content: "",
      source: "shell",
      at,
    })
  }
}

const shellArtifacts = (term: TermLike) => {
  if (!isShellToolName(term.tool)) {
    return [] as CreatedArtifact[]
  }

  if (term.tool === "fs_write" || term.tool === "fs_mkdir") {
    return [] as CreatedArtifact[]
  }

  if (term.status !== "done" && term.status !== "running") {
    return [] as CreatedArtifact[]
  }

  const cmd = trim(term.input)

  if (!cmd) {
    return [] as CreatedArtifact[]
  }

  const at = Date.now()
  const out: CreatedArtifact[] = []
  const mkdirRe = /\bmkdir\b([^;&|\n\r]*)/g
  const touchRe = /\btouch\b([^;&|\n\r]*)/g

  for (;;) {
    const m = mkdirRe.exec(cmd)

    if (!m) {
      break
    }

    const chunk = trim(m[1])

    if (!chunk) {
      continue
    }

    const list = parseChunk(chunk)
    pushShellRows(out, list, "folder", at)
  }

  for (;;) {
    const m = touchRe.exec(cmd)

    if (!m) {
      break
    }

    const chunk = trim(m[1])

    if (!chunk) {
      continue
    }

    const list = parseChunk(chunk)
    pushShellRows(out, list, "file", at)
  }

  const redRe = /(?:^|[^0-9])>>?\s*("[^"]+"|'[^']+'|[^\s;&|]+)/g

  for (;;) {
    const m = redRe.exec(cmd)

    if (!m) {
      return out
    }

    const raw = token(m[1] ?? "")
    const path = normalizeArtifactPath(raw)

    if (!path) {
      continue
    }

    if (path === "dev/null") {
      continue
    }

    out.push({
      path,
      kind: "file",
      content: "",
      source: "shell",
      at,
    })
  }
}

export const parseArtifactsFromTerm = (term: TermLike) => {
  const out0 = fsWriteArtifact(term)
  const out1 = fsMkdirArtifact(term)
  const out2 = shellArtifacts(term)
  const merged = out0.concat(out1).concat(out2)
  return mergeArtifacts([], merged)
}

const cloneArtifact = (row: CreatedArtifact) => {
  const path = normalizeArtifactPath(row.path)
  const kind = row.kind === "folder" ? "folder" : "file"
  const source = row.source === "shell" ? "shell" : "fs"
  const at0 = Number.parseInt(`${row.at}`, 10)
  const at = Number.isFinite(at0) ? at0 : Date.now()
  return {
    path,
    kind,
    content: str(row.content),
    source,
    at,
  } as CreatedArtifact
}

export const mergeArtifacts = (base: CreatedArtifact[], add: CreatedArtifact[]) => {
  const map: Record<string, CreatedArtifact> = {}

  for (var i = 0; i < base.length; i++) {
    const row = base[i]

    if (!row) {
      continue
    }

    const next = cloneArtifact(row)

    if (!next.path) {
      continue
    }

    map[next.path] = next
  }

  for (var i = 0; i < add.length; i++) {
    const row = add[i]

    if (!row) {
      continue
    }

    const next = cloneArtifact(row)

    if (!next.path) {
      continue
    }

    const cur = map[next.path]

    if (!cur) {
      map[next.path] = next
      continue
    }

    const kind = next.kind === "file" ? "file" : cur.kind
    const source = cur.source === "fs" || next.source !== "fs" ? cur.source : "fs"
    const content = next.content ? next.content : cur.content
    const at = next.at > cur.at ? next.at : cur.at
    map[next.path] = {
      path: next.path,
      kind,
      source,
      content,
      at,
    }
  }

  const keys = Object.keys(map).sort((a, b) => a.localeCompare(b))
  const out: CreatedArtifact[] = []

  for (var i = 0; i < keys.length; i++) {
    const key = keys[i] ?? ""
    const row = map[key]

    if (!row) {
      continue
    }

    out.push(row)
  }

  return out
}

type MutableNode = {
  path: string
  name: string
  kind: "file" | "folder"
  children: MutableNode[]
}

export const buildExplorerTree = (artifacts: CreatedArtifact[]) => {
  const root: MutableNode = {
    path: "",
    name: "",
    kind: "folder",
    children: [],
  }
  const folders: Record<string, MutableNode> = { "": root }
  const files: Record<string, MutableNode> = {}

  const ensureFolder = (path: string) => {
    const clean = normalizeArtifactPath(path)

    if (!clean) {
      return root
    }

    const list = clean.split("/")
    var cur = root
    var soFar = ""

    for (var i = 0; i < list.length; i++) {
      const name = (list[i] ?? "").trim()

      if (!name) {
        continue
      }

      const nextPath = soFar ? `${soFar}/${name}` : name
      var next = folders[nextPath]

      if (!next) {
        next = {
          path: nextPath,
          name,
          kind: "folder",
          children: [],
        }
        folders[nextPath] = next
        cur.children.push(next)
      }

      cur = next
      soFar = nextPath
    }

    return cur
  }

  for (var i = 0; i < artifacts.length; i++) {
    const row = artifacts[i]

    if (!row) {
      continue
    }

    const path = normalizeArtifactPath(row.path)

    if (!path) {
      continue
    }

    if (row.kind === "folder") {
      ensureFolder(path)
      continue
    }

    const list = path.split("/")
    const name = (list[list.length - 1] ?? "").trim()

    if (!name) {
      continue
    }

    const parentPath = list.slice(0, -1).join("/")
    const parent = ensureFolder(parentPath)
    const filePath = parentPath ? `${parentPath}/${name}` : name
    const old = files[filePath]

    if (old) {
      continue
    }

    const fileNode: MutableNode = {
      path: filePath,
      name,
      kind: "file",
      children: [],
    }
    files[filePath] = fileNode
    parent.children.push(fileNode)
  }

  const sortNode = (node: MutableNode) => {
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === "folder" ? -1 : 1
      }

      return a.name.localeCompare(b.name)
    })

    for (var i = 0; i < node.children.length; i++) {
      const child = node.children[i]

      if (!child) {
        continue
      }

      if (child.kind !== "folder") {
        continue
      }

      sortNode(child)
    }
  }

  sortNode(root)
  return root.children as ExplorerNode[]
}

const un = (raw: string) => {
  var out = ""

  for (var i = 0; i < raw.length; i++) {
    const ch = raw[i] ?? ""

    if (ch !== "\\") {
      out += ch
      continue
    }

    const next = raw[i + 1] ?? ""

    if (!next) {
      out += ch
      continue
    }

    if (next === "n") {
      out += "\n"
      i++
      continue
    }

    if (next === "r") {
      out += "\r"
      i++
      continue
    }

    if (next === "t") {
      out += "\t"
      i++
      continue
    }

    if (next === "\\") {
      out += "\\"
      i++
      continue
    }

    out += ch
  }

  return out
}

type IndexedTerm = {
  idx: number
  pos: number
  term: TermLike
}

export const parseTermsText = (raw: string) => {
  const txt0 = str(raw)
  const txt = txt0.trim()

  if (!txt) {
    return [] as TermLike[]
  }

  const ls = txt
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const rows: IndexedTerm[] = []

  for (var i = 0; i < ls.length; i++) {
    const line = ls[i] ?? ""
    const parts = line.split("\t")
    const idx0 = Number.parseInt((parts[0] ?? "").trim(), 10)
    const idx = Number.isFinite(idx0) ? idx0 : -1

    if (idx < 0) {
      continue
    }

    const id = un((parts[1] ?? "").trim())
    const tool = un((parts[2] ?? "").trim()) || "terminal"
    const status0 = un((parts[3] ?? "").trim())
    const input = un((parts[4] ?? "").trim())
    const output = un(parts.slice(5).join("\t"))
    const status = status0 === "running" || status0 === "failed" ? status0 : "done"
    rows.push({
      idx,
      pos: i,
      term: {
        id,
        tool,
        input,
        output,
        status,
      },
    })
  }

  rows.sort((a, b) => {
    if (a.idx !== b.idx) {
      return a.idx - b.idx
    }

    return a.pos - b.pos
  })

  const out: TermLike[] = []

  for (var i = 0; i < rows.length; i++) {
    const row = rows[i]

    if (!row) {
      continue
    }

    out.push(row.term)
  }

  return out
}

export const artifactsFromTermsText = (raw: string) => {
  const terms = parseTermsText(raw)
  var out: CreatedArtifact[] = []

  for (var i = 0; i < terms.length; i++) {
    const term = terms[i]

    if (!term) {
      continue
    }

    const next = parseArtifactsFromTerm(term)
    out = mergeArtifacts(out, next)
  }

  return out
}

export const parseArtifactsText = (raw: string) => {
  const parsed = json(raw)
  const list = Array.isArray(parsed) ? parsed : []
  const out: CreatedArtifact[] = []

  for (var i = 0; i < list.length; i++) {
    const row = obj(list[i])

    if (!row) {
      continue
    }

    const path = normalizeArtifactPath(str(row.path))

    if (!path) {
      continue
    }

    const kind = row.kind === "folder" ? "folder" : "file"
    const source = row.source === "shell" ? "shell" : "fs"
    const at0 = Number.parseInt(`${row.at ?? 0}`, 10)
    const at = Number.isFinite(at0) ? at0 : Date.now()
    const content = str(row.content)
    out.push({ path, kind, source, at, content })
  }

  return mergeArtifacts([], out)
}

export const toArtifactsText = (list: CreatedArtifact[]) => {
  return JSON.stringify(list)
}

export const parseTermLike = (raw: unknown) => {
  const row = obj(raw)

  if (!row) {
    return null
  }

  const id = trim(row.id)
  const tool = trim(row.tool)
  const status0 = trim(row.status)
  const status = status0 === "running" || status0 === "failed" ? status0 : "done"

  if (!id) {
    return null
  }

  if (!tool) {
    return null
  }

  return {
    id,
    tool,
    input: str(row.input),
    output: str(row.output),
    status,
  } as TermLike
}
