import { clean } from "../utils/text"

export type McpSearchItem = {
  url: string
  title: string
  date?: string
  outlet?: string
  source?: string
}

export type McpSearchOut = {
  ok: boolean
  error?: string
  results: McpSearchItem[]
  meta?: McpSearchMeta
}

export type McpProviderMeta = {
  id: string
  ok: boolean
  count: number
  error?: string
}

export type McpSearchMeta = {
  attemptedProviders: string[]
  usedProvider: string
  providers: McpProviderMeta[]
}

type McpConfig = {
  url: string
  tool: string
  headers: Record<string, string>
  protocol: string
  timeoutMs: number
  source: string
  args: Record<string, unknown>
  queryKey: string
  resultsKey: string
}

type RpcMsg = {
  jsonrpc?: unknown
  id?: unknown
  result?: unknown
  error?: unknown
}

type RpcErr = { message?: unknown }

type RpcRes = {
  ok: boolean
  error?: string
  msg?: RpcMsg | null
  headers?: Headers | null
}

type InitOut = {
  ok: boolean
  error?: string
  sessionId?: string
  proto?: string
}

const parseJson = (raw: string) => {
  const t = raw.trim()

  if (!t) {
    return null
  }

  try {
    return JSON.parse(t) as unknown
  } catch {
    return null
  }
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

const envVal = (key: string) => {
  const v0 = process.env[key] ?? ""
  const v1 = typeof v0 === "string" ? v0 : ""
  const v = v1.trim()
  return v
}

const pickEnv = (a: string, b?: string) => {
  var out = envVal(a)

  if (out) {
    return out
  }

  if (b) {
    out = envVal(b)
  }

  return out
}

const envKey = (prefix: string, key: string) => {
  const p0 = typeof prefix === "string" ? prefix : ""
  const p = p0.trim()

  if (!p) {
    return `MCP_${key}`
  }

  return `MCP_${p}_${key}`
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

const readHeaders = (raw: string, token: string, tokenHeader: string, tokenPrefix: string) => {
  const out: Record<string, string> = {}
  const parsed = raw ? parseJson(raw) : null
  const obj = (parsed && typeof parsed === "object" ? parsed : null) as Record<string, unknown> | null

  if (obj) {
    const keys = Object.keys(obj)

    for (var i = 0; i < keys.length; i++) {
      const k0 = keys[i] ?? ""
      const k = clean(k0)

      if (!k) {
        continue
      }

      const v0 = obj[k0]
      const v1 = typeof v0 === "string" ? v0 : ""
      const v = clean(v1)

      if (!v) {
        continue
      }

      out[k] = v
    }
  }

  const tok0 = clean(token)
  const tok = isPlaceholder(tok0) ? "" : tok0

  if (tok) {
    const h0 = isPlaceholder(tokenHeader) ? "" : clean(tokenHeader)
    const p0 = isPlaceholder(tokenPrefix) ? "" : clean(tokenPrefix)
    const h1 = h0 || "Authorization"
    const p1 = p0 || "Bearer"
    const val = p1 ? `${p1} ${tok}` : tok

    if (!out[h1]) {
      out[h1] = val
    }
  }

  return out
}

const readArgs = (raw: string) => {
  const parsed = raw ? parseJson(raw) : null
  const obj = (parsed && typeof parsed === "object" ? parsed : null) as Record<string, unknown> | null
  return obj || ({} as Record<string, unknown>)
}

const addArgs = (base: Record<string, unknown>, extra?: Record<string, unknown>) => {
  const row = (extra && typeof extra === "object" ? extra : null) as Record<string, unknown> | null

  if (!row) {
    return
  }

  const keys = Object.keys(row)

  for (var i = 0; i < keys.length; i++) {
    const k0 = keys[i] ?? ""
    const k = clean(k0)

    if (!k) {
      continue
    }

    if (Object.prototype.hasOwnProperty.call(base, k0)) {
      continue
    }

    base[k0] = row[k0]
  }
}

const protocolFrom = (raw: string) => {
  const v = clean(raw)
  return v || "2024-11-05"
}

const timeoutFrom = (raw: string) => {
  const v = clean(raw)
  return numFrom(v, 30000, 1000, 120000)
}

const cfgFromEnv = (prefix: string, fallback?: string, source?: string): McpConfig => {
  const url = pickEnv(envKey(prefix, "URL"), fallback ? envKey(fallback, "URL") : "")
  const tool = pickEnv(envKey(prefix, "TOOL"), fallback ? envKey(fallback, "TOOL") : "")
  const headRaw = pickEnv(envKey(prefix, "HEADERS"), fallback ? envKey(fallback, "HEADERS") : "")
  const token = pickEnv(envKey(prefix, "TOKEN"), fallback ? envKey(fallback, "TOKEN") : "")
  const tokenHeader = pickEnv(envKey(prefix, "TOKEN_HEADER"), fallback ? envKey(fallback, "TOKEN_HEADER") : "")
  const tokenPrefix = pickEnv(envKey(prefix, "TOKEN_PREFIX"), fallback ? envKey(fallback, "TOKEN_PREFIX") : "")
  const proto0 = pickEnv(envKey(prefix, "PROTOCOL_VERSION"), "MCP_PROTOCOL_VERSION")
  const proto = protocolFrom(proto0)
  const timeout0 = pickEnv(envKey(prefix, "TIMEOUT_MS"), "MCP_SEARCH_TIMEOUT_MS")
  const timeout1 = timeout0 || envVal("REQUEST_TIMEOUT_MS")
  const timeoutMs = timeoutFrom(timeout1)
  const argsRaw = pickEnv(envKey(prefix, "ARGS"), fallback ? envKey(fallback, "ARGS") : "")
  const qKey0 = pickEnv(envKey(prefix, "QUERY_KEY"), fallback ? envKey(fallback, "QUERY_KEY") : "")
  const rKey0 = pickEnv(envKey(prefix, "RESULTS_KEY"), fallback ? envKey(fallback, "RESULTS_KEY") : "")
  const qKey1 = clean(qKey0)
  const queryKey = isPlaceholder(qKey1) ? "query" : qKey1 || "query"
  const rKey1 = clean(rKey0)
  const rKeyDisabled = isPlaceholder(rKey1)
  const resultsKey = rKeyDisabled ? "" : rKey1 || "max_results"
  const headers = readHeaders(headRaw, token, tokenHeader, tokenPrefix)
  const args = readArgs(argsRaw)
  const src0 = clean(source ?? "")
  const src = src0 || "mcp"

  return { url, tool, headers, protocol: proto, timeoutMs, source: src, args, queryKey, resultsKey }
}

const timedSignal = (ms: number) => {
  const sig = AbortSignal.timeout(ms)
  var timed = false
  sig.addEventListener(
    "abort",
    () => {
      timed = true
    },
    { once: true },
  )
  return { sig, timed: () => timed }
}

const sseMessages = (txt: string) => {
  const out: string[] = []
  const lines = txt.split("\n")
  var cur: string[] = []

  for (var i = 0; i < lines.length; i++) {
    const line0 = lines[i] ?? ""
    const line = line0.trimEnd()

    if (!line) {
      if (cur.length) {
        out.push(cur.join("\n"))
        cur = []
      }
      continue
    }

    if (!line.startsWith("data:")) {
      continue
    }

    var val = line.slice(5)

    if (val.startsWith(" ")) {
      val = val.slice(1)
    }

    if (val) {
      cur.push(val)
    }
  }

  if (cur.length) {
    out.push(cur.join("\n"))
  }

  return out
}

const parseRpcList = (ct: string, txt: string) => {
  const out: RpcMsg[] = []

  if (ct.includes("application/json")) {
    const parsed = parseJson(txt)

    if (parsed) {
      if (Array.isArray(parsed)) {
        for (var i = 0; i < parsed.length; i++) {
          const it = parsed[i]
          if (it && typeof it === "object") {
            out.push(it as RpcMsg)
          }
        }
      }

      if (!Array.isArray(parsed) && parsed && typeof parsed === "object") {
        out.push(parsed as RpcMsg)
      }
    }
  }

  if (ct.includes("text/event-stream")) {
    const msgs = sseMessages(txt)

    for (var i = 0; i < msgs.length; i++) {
      const it = parseJson(msgs[i] ?? "")
      if (it && typeof it === "object") {
        out.push(it as RpcMsg)
      }
    }
  }

  if (!out.length) {
    const parsed = parseJson(txt)

    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed)) {
        for (var i = 0; i < parsed.length; i++) {
          const it = parsed[i]
          if (it && typeof it === "object") {
            out.push(it as RpcMsg)
          }
        }
      }

      if (!Array.isArray(parsed)) {
        out.push(parsed as RpcMsg)
      }
    }
  }

  return out
}

const pickRpc = (list: RpcMsg[], id: string) => {
  if (!list.length) {
    return null
  }

  if (id) {
    for (var i = 0; i < list.length; i++) {
      const it = list[i]
      const id0 = typeof it?.id === "string" ? it.id : typeof it?.id === "number" ? `${it.id}` : ""

      if (id0 === id) {
        return it
      }
    }
  }

  return list[list.length - 1] ?? null
}

const buildHeaders = (cfg: McpConfig, sessionId: string, proto: string) => {
  const out: Record<string, string> = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
  }
  const keys = Object.keys(cfg.headers)

  for (var i = 0; i < keys.length; i++) {
    const k0 = keys[i] ?? ""
    const k = clean(k0)

    if (!k) {
      continue
    }

    const v0 = cfg.headers[k0] ?? ""
    const v1 = typeof v0 === "string" ? v0 : ""
    const v = clean(v1)

    if (!v) {
      continue
    }

    out[k] = v
  }

  if (sessionId) {
    out["MCP-Session-Id"] = sessionId
  }

  if (proto) {
    out["MCP-Protocol-Version"] = proto
  }

  return out
}

const rpcError = (msg: RpcMsg | null) => {
  const e0 = (msg?.error && typeof msg.error === "object" ? msg.error : null) as RpcErr | null
  const em0 = typeof e0?.message === "string" ? e0.message : ""
  const em = clean(em0)
  return em
}

const sendRpc = async (cfg: McpConfig, body: Record<string, unknown>, sessionId: string, proto: string): Promise<RpcRes> => {
  const ms = cfg.timeoutMs
  const to = timedSignal(ms)
  const headers = buildHeaders(cfg, sessionId, proto)
  const res = await fetch(cfg.url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: to.sig,
  }).catch(() => null)

  if (!res) {
    if (to.timed()) {
      return { ok: false, error: "MCP request timed out" }
    }
    return { ok: false, error: "MCP request failed" }
  }

  const txt0 = await res.text().catch(() => "")
  const txt = typeof txt0 === "string" ? txt0 : ""
  const ct = (res.headers.get("content-type") ?? "").toLowerCase()
  const list = parseRpcList(ct, txt)
  const id0 = typeof body?.id === "string" ? body.id : typeof body?.id === "number" ? `${body.id}` : ""
  const msg = pickRpc(list, id0)
  const err = rpcError(msg)

  if (!res.ok) {
    const code = `MCP error (${res.status})`
    const reason = err || txt.trim() || code
    return { ok: false, error: reason, msg, headers: res.headers }
  }

  if (err) {
    return { ok: false, error: err, msg, headers: res.headers }
  }

  return { ok: true, msg, headers: res.headers }
}

const initReq = (proto: string) => {
  const id = `init_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  const params = {
    protocolVersion: proto,
    capabilities: {},
    clientInfo: { name: "operator-web", version: "1.0.0" },
  }
  return { jsonrpc: "2.0", id, method: "initialize", params }
}

const initNote = () => ({ jsonrpc: "2.0", method: "notifications/initialized" })

const callReq = (tool: string, args: Record<string, unknown>) => {
  const id = `call_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name: tool, arguments: args } }
}

const sessionCache = new Map<string, { sessionId: string; proto: string }>()

const ensureInit = async (cfg: McpConfig): Promise<InitOut> => {
  if (!cfg.url) {
    return { ok: false, error: "MCP search not configured" }
  }

  const cached = sessionCache.get(cfg.url) ?? null

  if (cached && cached.proto) {
    return { ok: true, sessionId: cached.sessionId, proto: cached.proto }
  }

  const proto = cfg.protocol
  const req = initReq(proto)
  const res = await sendRpc(cfg, req, "", "")

  if (!res.ok) {
    return { ok: false, error: res.error || "MCP initialize failed" }
  }

  const msg = res.msg
  const rs0 = (msg?.result && typeof msg.result === "object" ? msg.result : null) as { protocolVersion?: unknown } | null
  const p0 = typeof rs0?.protocolVersion === "string" ? rs0.protocolVersion : ""
  const p1 = clean(p0)
  const p = p1

  if (!p) {
    return { ok: false, error: "MCP initialize missing protocolVersion" }
  }

  const sid0 = res.headers?.get("mcp-session-id") ?? ""
  const sid = clean(sid0)

  const note = initNote()
  const noted = await sendRpc(cfg, note, sid, p)

  if (!noted.ok) {
    return { ok: false, error: noted.error || "MCP initialized notification failed" }
  }

  sessionCache.set(cfg.url, { sessionId: sid, proto: p })

  return { ok: true, sessionId: sid, proto: p }
}

const jsonFromContent = (content: unknown[]) => {
  for (var i = 0; i < content.length; i++) {
    const it0 = content[i]
    const it = (it0 && typeof it0 === "object" ? it0 : null) as { type?: unknown; json?: unknown; data?: unknown } | null

    if (!it) {
      continue
    }

    const type0 = typeof it.type === "string" ? it.type : ""
    const type = clean(type0)

    if (type !== "json") {
      continue
    }

    if (it.json) {
      return it.json
    }

    if (it.data) {
      return it.data
    }
  }

  return null
}

const textFromContent = (content: unknown[]) => {
  const out: string[] = []

  for (var i = 0; i < content.length; i++) {
    const it0 = content[i]
    const it = (it0 && typeof it0 === "object" ? it0 : null) as { type?: unknown; text?: unknown } | null

    if (!it) {
      continue
    }

    const type0 = typeof it.type === "string" ? it.type : ""
    const type = clean(type0)

    if (type !== "text") {
      continue
    }

    const t0 = typeof it.text === "string" ? it.text : ""
    const t = clean(t0)

    if (!t) {
      continue
    }

    out.push(t)
  }

  return out.join("\n")
}

const rawTextFromContent = (content: unknown[]) => {
  const out: string[] = []

  for (var i = 0; i < content.length; i++) {
    const it0 = content[i]
    const it = (it0 && typeof it0 === "object" ? it0 : null) as { type?: unknown; text?: unknown } | null

    if (!it) {
      continue
    }

    const type0 = typeof it.type === "string" ? it.type : ""
    const type = clean(type0)

    if (type !== "text") {
      continue
    }

    const t0 = typeof it.text === "string" ? it.text : ""

    if (!t0) {
      continue
    }

    out.push(t0)
  }

  return out.join("\n")
}

const listFrom = (raw: unknown) => {
  if (!raw) {
    return [] as Record<string, unknown>[]
  }

  if (Array.isArray(raw)) {
    return raw.filter((it) => it && typeof it === "object") as Record<string, unknown>[]
  }

  const obj = (raw && typeof raw === "object" ? raw : null) as {
    results?: unknown
    items?: unknown
    data?: unknown
  } | null

  if (!obj) {
    return [] as Record<string, unknown>[]
  }

  if (Array.isArray(obj.results)) {
    return obj.results.filter((it) => it && typeof it === "object") as Record<string, unknown>[]
  }

  if (Array.isArray(obj.items)) {
    return obj.items.filter((it) => it && typeof it === "object") as Record<string, unknown>[]
  }

  if (Array.isArray(obj.data)) {
    return obj.data.filter((it) => it && typeof it === "object") as Record<string, unknown>[]
  }

  return [] as Record<string, unknown>[]
}

const mapItem = (it: Record<string, unknown>, source: string) => {
  const u0 = typeof it.url === "string" ? it.url : typeof it.link === "string" ? it.link : ""
  const t0 = typeof it.title === "string" ? it.title : typeof it.name === "string" ? it.name : typeof it.text === "string" ? it.text : ""
  const d0 = typeof it.date === "string" ? it.date : typeof it.published === "string" ? it.published : ""
  const o0 = typeof it.outlet === "string" ? it.outlet : typeof it.source === "string" ? it.source : typeof it.site === "string" ? it.site : ""
  const url = clean(u0)
  const title = clean(t0)
  const date = clean(d0)
  const outlet = clean(o0)

  if (!url || !title) {
    return null
  }

  return { url, title, date, outlet, source } as McpSearchItem
}

const listFromText = (text: string, source: string) => {
  const out: McpSearchItem[] = []
  const lines = text.split("\n")

  for (var i = 0; i < lines.length; i++) {
    const line0 = lines[i] ?? ""
    const line = clean(line0)

    if (!line) {
      continue
    }

    const m = line.match(/https?:\/\/[^\s)]+/i)
    const u0 = m?.[0] ?? ""
    const url = clean(u0)

    if (!url) {
      continue
    }

    const title0 = clean(line.replace(url, "").replace(/[-–—:]\s*$/, "").trim())
    const title = title0 || url
    out.push({ url, title, source })
  }

  return out
}

const parseSearxngMcpText = (raw: string, source: string) => {
  const text = typeof raw === "string" ? raw : ""
  const norm = text.replace(/\r\n/g, "\n").trim()

  if (!norm) {
    return [] as McpSearchItem[]
  }

  var blocks = norm.split(/\n{2,}/)

  if (blocks.length <= 1) {
    blocks = norm.split(/\n(?=Title:\s)/g)
  }
  const out: McpSearchItem[] = []
  const seen = new Set<string>()

  for (var i = 0; i < blocks.length; i++) {
    const block0 = blocks[i] ?? ""
    const block = block0.trim()

    if (!block) {
      continue
    }

    const t0 = block.match(/^Title:\s*(.*)$/m)?.[1] ?? ""
    const u0 = block.match(/^URL:\s*(.*)$/m)?.[1] ?? ""
    const d0 = block.match(/^Description:\s*([\s\S]*?)(?:\nURL:|\nRelevance Score:|$)/m)?.[1] ?? ""
    const title = clean(t0)
    const url = clean(u0)
    const desc = clean(d0)

    if (!title && !url && !desc) {
      continue
    }

    if (!url) {
      continue
    }

    if (seen.has(url)) {
      continue
    }

    seen.add(url)

    const name = title || url
    out.push({ url, title: name, source })
  }

  return out
}

const resultsFrom = (raw: unknown, source: string) => {
  const out: McpSearchItem[] = []
  const list = listFrom(raw)

  for (var i = 0; i < list.length; i++) {
    const row = list[i]
    const item = mapItem(row, source)

    if (!item) {
      continue
    }

    out.push(item)
  }

  return out
}

const mcpSearch = async (cfg: McpConfig, query: string, maxResults: number, extra?: Record<string, unknown>): Promise<McpSearchOut> => {
  if (!cfg.url) {
    return { ok: false, error: "MCP search not configured", results: [] }
  }

  if (!cfg.tool) {
    return { ok: false, error: "MCP search tool not configured", results: [] }
  }

  const init = await ensureInit(cfg)

  if (!init.ok) {
    return { ok: false, error: init.error || "MCP initialize failed", results: [] }
  }

  const args = Object.assign({}, cfg.args)
  addArgs(args, extra)

  if (!Object.prototype.hasOwnProperty.call(args, cfg.queryKey)) {
    args[cfg.queryKey] = query
  }

  if (maxResults > 0) {
    if (cfg.resultsKey) {
      if (!Object.prototype.hasOwnProperty.call(args, cfg.resultsKey)) {
        args[cfg.resultsKey] = maxResults
      }
    }
  }

  const req = callReq(cfg.tool, args)
  const res = await sendRpc(cfg, req, init.sessionId || "", init.proto || "")

  if (!res.ok) {
    return { ok: false, error: res.error || "MCP tool call failed", results: [] }
  }

  const msg = res.msg
  const result0 = (msg?.result && typeof msg.result === "object" ? msg.result : null) as {
    content?: unknown
    isError?: unknown
  } | null
  const isErr = result0?.isError === true

  if (isErr) {
    return { ok: false, error: "MCP tool returned error", results: [] }
  }

  const content = Array.isArray(result0?.content) ? result0?.content ?? [] : []
  const json = jsonFromContent(content)
  const rawText = cfg.source === "searxng" ? rawTextFromContent(content) : ""
  const text = textFromContent(content)
  var results = resultsFrom(json, cfg.source)

  if (!results.length && text) {
    if (cfg.source === "searxng") {
      const parsed = parseSearxngMcpText(rawText || text, cfg.source)
      if (parsed.length) {
        results = parsed
      }
    }
  }

  if (!results.length && text) {
    const parsed = parseJson(text)

    if (parsed) {
      results = resultsFrom(parsed, cfg.source)
    }
  }

  if (!results.length && text) {
    results = listFromText(text, cfg.source)
  }

  if (!results.length) {
    return { ok: false, error: "MCP search returned no results", results: [] }
  }

  if (maxResults > 0 && results.length > maxResults) {
    results = results.slice(0, maxResults)
  }

  return { ok: true, results }
}

const normProvider = (raw: string) => {
  const t = clean(raw).toLowerCase()

  if (!t) {
    return ""
  }

  if (t === "ddg" || t === "duckduckgo" || t === "duck") {
    return "ddg"
  }

  if (t === "searxng" || t === "searx") {
    return "searxng"
  }

  if (t === "ctx7" || t === "context7") {
    return "ctx7"
  }

  return ""
}

const providerArgs = (id: string, kind: string) => {
  const out: Record<string, unknown> = {}

  if (id !== "searxng") {
    return out
  }

  if (kind !== "news") {
    return out
  }

  out.categories = "news"
  out.time_range = "day"
  return out
}

const mergeResults = (base: McpSearchItem[], extra: McpSearchItem[], limit: number) => {
  if (!extra.length) {
    return base
  }

  const out = base.slice()
  const seen = new Set<string>()

  for (var i = 0; i < out.length; i++) {
    const url0 = clean(out[i]?.url ?? "")

    if (!url0) {
      continue
    }

    seen.add(url0)
  }

  for (var i = 0; i < extra.length; i++) {
    if (limit > 0 && out.length >= limit) {
      break
    }

    const row = extra[i]
    const url = clean(row?.url ?? "")

    if (!url) {
      continue
    }

    if (seen.has(url)) {
      continue
    }

    seen.add(url)
    out.push(row)
  }

  if (limit > 0 && out.length > limit) {
    return out.slice(0, limit)
  }

  return out
}

export const mcpSearchChain = async (query: string, maxResults: number, kind?: string, provider?: string) => {
  const k0 = typeof kind === "string" ? kind : ""
  const k1 = clean(k0).toLowerCase()
  const k = k1 || "web"
  const pref = normProvider(typeof provider === "string" ? provider : "")
  var list = [
    { id: "searxng", cfg: cfgFromEnv("SEARXNG", "", "searxng") },
    { id: "ddg", cfg: cfgFromEnv("DDG", "", "ddg") },
    { id: "ctx7", cfg: cfgFromEnv("CTX7", "", "ctx7") },
  ]
  if (pref) {
    var next: { id: string; cfg: McpConfig }[] = []

    for (var i = 0; i < list.length; i++) {
      const row = list[i]

      if (row?.id === pref) {
        next.push(row)
      }
    }

    if (next.length) {
      list = next
    }
  }
  const attempted: string[] = []
  const providers: McpProviderMeta[] = []
  var used = ""
  var results: McpSearchItem[] = []

  for (var i = 0; i < list.length; i++) {
    const row = list[i]
    const cfg = row?.cfg

    if (!cfg || !cfg.url || !cfg.tool) {
      continue
    }

    attempted.push(row.id)
    const extra = providerArgs(row.id, k)
    const res = await mcpSearch(cfg, query, maxResults, extra)
    const count = res.results.length
    const err0 = typeof res.error === "string" ? res.error : ""
    const err = clean(err0)
    providers.push({ id: row.id, ok: res.ok, count, error: err || undefined })

    if (!res.ok || !count) {
      continue
    }

    if (!used) {
      used = row.id
    }

    results = mergeResults(results, res.results, maxResults)

    if (maxResults > 0 && results.length >= maxResults) {
      break
    }
  }

  if (!used && pref) {
    used = pref
  }

  const meta = { attemptedProviders: attempted, usedProvider: used, providers }

  if (results.length) {
    return { ok: true, results, meta }
  }

  var err = ""

  for (var i = providers.length - 1; i >= 0; i--) {
    const e0 = providers[i]?.error
    const msg = clean(typeof e0 === "string" ? e0 : "")

    if (msg) {
      err = msg
      break
    }
  }

  const error = err || "MCP search failed"
  return { ok: false, error, results: [], meta }
}
