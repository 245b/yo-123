#!/usr/bin/env node
const { argv, env, stdout, exit } = process

const clean = (val) => (typeof val === "string" ? val.trim() : "")
const lower = (val) => clean(val).toLowerCase()

const normProv = (val) => {
  const t = lower(val)
  if (!t) {
    return ""
  }
  if (t === "ddg" || t === "duck" || t === "duckduckgo") {
    return "ddg"
  }
  if (t === "ctx7" || t === "context7") {
    return "ctx7"
  }
  if (t === "both" || t === "all") {
    return "both"
  }
  if (t === "auto") {
    return "auto"
  }
  return ""
}

const hasKey = (txt, keys) => {
  for (var i = 0; i < keys.length; i++) {
    const k0 = keys[i] || ""
    const k = k0.trim()
    if (!k) {
      continue
    }
    if (txt.includes(k)) {
      return true
    }
  }
  return false
}

const isDocs = (txt) => {
  const keys = [
    "docs",
    "documentation",
    "api reference",
    "reference",
    "sdk",
    "library",
    "package",
    "usage",
    "how to",
    "guide",
    "manual",
    "configure",
    "configuration",
    "setup",
  ]
  return hasKey(txt, keys)
}

const isNews = (txt) => {
  const keys = ["news", "headlines", "top stories", "breaking", "current events", "latest news"]
  return hasKey(txt, keys)
}

const isResearch = (txt) => {
  const keys = [
    "research",
    "deep dive",
    "in-depth",
    "comprehensive",
    "systematic",
    "survey",
    "literature",
    "meta-analysis",
    "whitepaper",
    "benchmark",
    "compare",
  ]
  return hasKey(txt, keys)
}

const pickProvider = (query, lib, libId, prov) => {
  const forced = normProv(prov)
  if (forced && forced !== "auto") {
    return forced
  }
  const t = lower(query)
  if (isResearch(t)) {
    return "both"
  }
  if (lib || libId || isDocs(t)) {
    return "ctx7"
  }
  if (isNews(t)) {
    return "ddg"
  }
  return "ddg"
}

const parseArgs = (list) => {
  var provider = ""
  var lib = ""
  var libId = ""
  var max = 0
  const parts = []
  for (var i = 0; i < list.length; i++) {
    const cur = list[i] || ""
    if (cur === "--provider" || cur === "-p") {
      provider = list[i + 1] || ""
      i++
      continue
    }
    if (cur.startsWith("--provider=")) {
      provider = cur.slice("--provider=".length)
      continue
    }
    if (cur === "--ddg") {
      provider = "ddg"
      continue
    }
    if (cur === "--ctx7" || cur === "--context7") {
      provider = "ctx7"
      continue
    }
    if (cur === "--both") {
      provider = "both"
      continue
    }
    if (cur === "--lib" || cur === "--library") {
      lib = list[i + 1] || ""
      i++
      continue
    }
    if (cur === "--library-id" || cur === "--lib-id") {
      libId = list[i + 1] || ""
      i++
      continue
    }
    if (cur.startsWith("--lib=")) {
      lib = cur.slice("--lib=".length)
      continue
    }
    if (cur.startsWith("--library=")) {
      lib = cur.slice("--library=".length)
      continue
    }
    if (cur.startsWith("--library-id=")) {
      libId = cur.slice("--library-id=".length)
      continue
    }
    if (cur.startsWith("--lib-id=")) {
      libId = cur.slice("--lib-id=".length)
      continue
    }
    if (cur === "--query") {
      for (var j = i + 1; j < list.length; j++) {
        parts.push(list[j] || "")
      }
      i = list.length
      continue
    }
    if (cur === "--max" || cur === "--limit") {
      max = numFrom(list[i + 1], 0, 1, 500)
      i++
      continue
    }
    if (cur.startsWith("--max=")) {
      max = numFrom(cur.slice("--max=".length), 0, 1, 500)
      continue
    }
    if (cur.startsWith("--limit=")) {
      max = numFrom(cur.slice("--limit=".length), 0, 1, 500)
      continue
    }
    parts.push(cur)
  }
  const query = parts.join(" ").trim()
  return { query, provider, lib, libId, max }
}

const parseJson = (raw) => {
  const text = clean(raw)
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const numFrom = (val, def, min, max) => {
  const n0 = typeof val === "number" ? val : typeof val === "string" ? Number.parseInt(val, 10) : NaN
  const n1 = Number.isFinite(n0) ? Math.floor(n0) : NaN
  if (!Number.isFinite(n1)) {
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

const envVal = (key) => clean(env[key] || "")

const pickEnv = (first, fallback) => {
  const v0 = envVal(first)
  if (v0) {
    return v0
  }
  if (!fallback) {
    return ""
  }
  return envVal(fallback)
}

const isPlaceholder = (raw) => {
  const text = clean(raw).toLowerCase()
  if (!text) {
    return false
  }
  if (text === "replace_me" || text === "replaceme") {
    return true
  }
  if (text === "disabled" || text === "none") {
    return true
  }
  if (text === "unset" || text === "null") {
    return true
  }
  return false
}

const splitList = (raw) => {
  const text = clean(raw)
  if (!text) {
    return []
  }
  const parts = text.split(",")
  const out = []
  const seen = new Set()
  for (var i = 0; i < parts.length; i++) {
    const it = parts[i] || ""
    const v = clean(it)
    if (!v) {
      continue
    }
    if (seen.has(v)) {
      continue
    }
    seen.add(v)
    out.push(v)
  }
  return out
}

const readHeaders = (raw, token, tokenHeader, tokenPrefix) => {
  const out = {}
  const parsed = parseJson(raw)
  const obj = parsed && typeof parsed === "object" ? parsed : null
  if (obj) {
    const keys = Object.keys(obj)
    for (var i = 0; i < keys.length; i++) {
      const k0 = keys[i] || ""
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
  if (!tok) {
    return out
  }
  const h0 = isPlaceholder(tokenHeader) ? "" : clean(tokenHeader)
  const p0 = isPlaceholder(tokenPrefix) ? "" : clean(tokenPrefix)
  const h1 = h0 || "Authorization"
  const p1 = p0 || "Bearer"
  const val = p1 ? `${p1} ${tok}` : tok
  if (!out[h1]) {
    out[h1] = val
  }
  return out
}

const readArgs = (raw) => {
  const parsed = parseJson(raw)
  const obj = parsed && typeof parsed === "object" ? parsed : null
  return obj || {}
}

const sseMessages = (txt) => {
  const out = []
  const lines = txt.split("\n")
  var cur = []
  for (var i = 0; i < lines.length; i++) {
    const line0 = lines[i] || ""
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

const parseRpcList = (ct, txt) => {
  const out = []
  if (ct.includes("application/json")) {
    const parsed = parseJson(txt)
    if (parsed) {
      if (Array.isArray(parsed)) {
        for (var i = 0; i < parsed.length; i++) {
          const it = parsed[i]
          if (it && typeof it === "object") {
            out.push(it)
          }
        }
      }
      if (!Array.isArray(parsed) && parsed && typeof parsed === "object") {
        out.push(parsed)
      }
    }
  }
  if (ct.includes("text/event-stream")) {
    const msgs = sseMessages(txt)
    for (var i = 0; i < msgs.length; i++) {
      const it = parseJson(msgs[i] || "")
      if (it && typeof it === "object") {
        out.push(it)
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
            out.push(it)
          }
        }
      }
      if (!Array.isArray(parsed)) {
        out.push(parsed)
      }
    }
  }
  return out
}

const pickRpc = (list, id) => {
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
  return list[list.length - 1] || null
}

const rpcError = (msg) => {
  const err = msg && typeof msg.error === "object" ? msg.error : null
  const em0 = err && typeof err.message === "string" ? err.message : ""
  const em = clean(em0)
  return em
}

const buildHeaders = (cfg, sessionId, proto) => {
  const out = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
  }
  const keys = Object.keys(cfg.headers)
  for (var i = 0; i < keys.length; i++) {
    const k0 = keys[i] || ""
    const k = clean(k0)
    if (!k) {
      continue
    }
    const v0 = cfg.headers[k0] || ""
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

const sendRpc = async (cfg, body, sessionId, proto) => {
  const sig = AbortSignal.timeout(cfg.timeoutMs)
  var timed = false
  sig.addEventListener(
    "abort",
    () => {
      timed = true
    },
    { once: true },
  )
  const headers = buildHeaders(cfg, sessionId, proto)
  const res = await fetch(cfg.url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: sig,
  }).catch(() => null)
  if (!res) {
    if (timed) {
      return { ok: false, error: "MCP request timed out" }
    }
    return { ok: false, error: "MCP request failed" }
  }
  const txt0 = await res.text().catch(() => "")
  const txt = typeof txt0 === "string" ? txt0 : ""
  const ct = (res.headers.get("content-type") || "").toLowerCase()
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

const initReq = (proto) => {
  const id = `init_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  return {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: proto,
      capabilities: {},
      clientInfo: { name: "mcp-search", version: "1.0.0" },
    },
  }
}

const initNote = () => ({ jsonrpc: "2.0", method: "notifications/initialized" })

const callReq = (tool, args) => {
  const id = `call_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name: tool, arguments: args } }
}

const cfgFromEnv = () => {
  const url = pickEnv("MCP_DDG_URL", "MCP_SEARCH_URL") || "http://duckduckgo-mcp:8020/mcp"
  const toolRaw = pickEnv("MCP_DDG_TOOL", "MCP_SEARCH_TOOL") || "web-search"
  const tools = splitList(toolRaw)
  const toolList = tools.length ? tools : ["web-search"]
  const headRaw = pickEnv("MCP_DDG_HEADERS", "MCP_SEARCH_HEADERS")
  const token = pickEnv("MCP_DDG_TOKEN", "MCP_SEARCH_TOKEN")
  const tokenHeader = pickEnv("MCP_DDG_TOKEN_HEADER", "MCP_SEARCH_TOKEN_HEADER")
  const tokenPrefix = pickEnv("MCP_DDG_TOKEN_PREFIX", "MCP_SEARCH_TOKEN_PREFIX")
  const proto0 = pickEnv("MCP_DDG_PROTOCOL_VERSION", "MCP_PROTOCOL_VERSION")
  const proto = proto0 || "2024-11-05"
  const timeout0 = pickEnv("MCP_DDG_TIMEOUT_MS", "MCP_SEARCH_TIMEOUT_MS")
  const timeout1 = timeout0 || envVal("REQUEST_TIMEOUT_MS")
  const timeoutMs = numFrom(timeout1, 30000, 1000, 120000)
  const retryRaw = pickEnv("MCP_DDG_RETRIES", "MCP_SEARCH_RETRIES") || envVal("MCP_RETRIES")
  const retries = numFrom(retryRaw, 2, 0, 5)
  const delayRaw = pickEnv("MCP_DDG_RETRY_DELAY_MS", "MCP_SEARCH_RETRY_DELAY_MS") || envVal("MCP_RETRY_DELAY_MS")
  const retryDelayMs = numFrom(delayRaw, 1500, 250, 10000)
  const argsRaw = pickEnv("MCP_DDG_ARGS", "MCP_SEARCH_ARGS")
  const qKey0 = pickEnv("MCP_DDG_QUERY_KEY", "MCP_SEARCH_QUERY_KEY")
  const rKey0 = pickEnv("MCP_DDG_RESULTS_KEY", "MCP_SEARCH_RESULTS_KEY")
  const qKey1 = clean(qKey0)
  const rKey1 = clean(rKey0)
  const queryKey = isPlaceholder(qKey1) ? "query" : qKey1 || "query"
  const rKeyDisabled = isPlaceholder(rKey1)
  const resultsKey = rKeyDisabled ? "" : rKey1 || "numResults"
  const headers = readHeaders(headRaw, token, tokenHeader, tokenPrefix)
  const args = readArgs(argsRaw)
  return { url, tools: toolList, headers, protocol: proto, timeoutMs, retries, retryDelayMs, args, queryKey, resultsKey }
}

const cfgCtx7FromEnv = () => {
  const url = pickEnv("MCP_CTX7_URL", "MCP_CONTEXT7_URL") || "http://context7-mcp:8010/mcp"
  const resolveTool =
    pickEnv("MCP_CTX7_TOOL_RESOLVE", "MCP_CONTEXT7_TOOL_RESOLVE") ||
    pickEnv("MCP_CTX7_TOOL", "MCP_CONTEXT7_TOOL") ||
    "resolve-library-id"
  const queryTool = pickEnv("MCP_CTX7_TOOL_QUERY", "MCP_CONTEXT7_TOOL_QUERY") || "query-docs"
  const headRaw = pickEnv("MCP_CTX7_HEADERS", "MCP_CONTEXT7_HEADERS")
  const token = pickEnv("MCP_CTX7_TOKEN", "MCP_CONTEXT7_TOKEN")
  const tokenHeader = pickEnv("MCP_CTX7_TOKEN_HEADER", "MCP_CONTEXT7_TOKEN_HEADER")
  const tokenPrefix = pickEnv("MCP_CTX7_TOKEN_PREFIX", "MCP_CONTEXT7_TOKEN_PREFIX")
  const proto0 = pickEnv("MCP_CTX7_PROTOCOL_VERSION", "MCP_PROTOCOL_VERSION")
  const proto = proto0 || "2024-11-05"
  const timeout0 = pickEnv("MCP_CTX7_TIMEOUT_MS", "MCP_SEARCH_TIMEOUT_MS")
  const timeout1 = timeout0 || envVal("REQUEST_TIMEOUT_MS")
  const timeoutMs = numFrom(timeout1, 30000, 1000, 120000)
  const retryRaw = pickEnv("MCP_CTX7_RETRIES", "MCP_SEARCH_RETRIES") || envVal("MCP_RETRIES")
  const retries = numFrom(retryRaw, 2, 0, 5)
  const delayRaw = pickEnv("MCP_CTX7_RETRY_DELAY_MS", "MCP_SEARCH_RETRY_DELAY_MS") || envVal("MCP_RETRY_DELAY_MS")
  const retryDelayMs = numFrom(delayRaw, 1500, 250, 10000)
  const argsRaw = pickEnv("MCP_CTX7_ARGS", "MCP_CONTEXT7_ARGS")
  const resolveArgsRaw = pickEnv("MCP_CTX7_RESOLVE_ARGS", "MCP_CONTEXT7_RESOLVE_ARGS")
  const queryArgsRaw = pickEnv("MCP_CTX7_QUERY_ARGS", "MCP_CONTEXT7_QUERY_ARGS")
  const queryKeyRaw = clean(pickEnv("MCP_CTX7_QUERY_KEY", "MCP_CONTEXT7_QUERY_KEY"))
  const libNameKeyRaw = clean(pickEnv("MCP_CTX7_LIBRARY_NAME_KEY", "MCP_CONTEXT7_LIBRARY_NAME_KEY"))
  const libKeyRaw = clean(pickEnv("MCP_CTX7_LIBRARY_KEY", "MCP_CONTEXT7_LIBRARY_KEY"))
  const resultsKeyRaw = clean(pickEnv("MCP_CTX7_RESULTS_KEY", "MCP_CONTEXT7_RESULTS_KEY"))
  var queryKey = queryKeyRaw || "query"
  if (queryKey === "libraryName") {
    queryKey = "query"
  }
  var libraryNameKey = libNameKeyRaw
  if (!libraryNameKey && queryKeyRaw === "libraryName") {
    libraryNameKey = "libraryName"
  }
  if (!libraryNameKey) {
    libraryNameKey = "libraryName"
  }
  const libraryKey = libKeyRaw || "libraryId"
  const resultsKey = isPlaceholder(resultsKeyRaw) ? "" : resultsKeyRaw
  const headers = readHeaders(headRaw, token, tokenHeader, tokenPrefix)
  const args = readArgs(argsRaw)
  const resolveArgs = readArgs(resolveArgsRaw)
  const queryArgs = readArgs(queryArgsRaw)
  return {
    url,
    resolveTool,
    queryTool,
    headers,
    protocol: proto,
    timeoutMs,
    retries,
    retryDelayMs,
    args,
    resolveArgs,
    queryArgs,
    queryKey,
    libraryNameKey,
    libraryKey,
    resultsKey,
  }
}

const resultFrom = (msg) => {
  if (!msg || typeof msg !== "object") {
    return null
  }
  if (Object.prototype.hasOwnProperty.call(msg, "result")) {
    return msg.result
  }
  return null
}

const resultError = (res) => {
  const obj = res && typeof res === "object" ? res : null
  if (!obj) {
    return ""
  }
  if (obj.isError !== true) {
    return ""
  }
  const list = Array.isArray(obj.content) ? obj.content : []
  for (var i = 0; i < list.length; i++) {
    const it = list[i]
    const type = clean(it?.type ?? "")
    const text = clean(it?.text ?? "")
    if (type === "text" && text) {
      return text
    }
  }
  return "MCP tool returned an error"
}

const contentFrom = (res) => {
  const obj = res && typeof res === "object" ? res : null
  if (!obj) {
    return []
  }
  const list = Array.isArray(obj.content) ? obj.content : []
  return list
}

const jsonFromContent = (content) => {
  for (var i = 0; i < content.length; i++) {
    const it = content[i]
    const type = clean(it?.type ?? "")
    if (type !== "json") {
      continue
    }
    if (it?.json) {
      return it.json
    }
    if (it?.data) {
      return it.data
    }
  }
  return null
}

const textFromContent = (content) => {
  const out = []
  for (var i = 0; i < content.length; i++) {
    const it = content[i]
    const type = clean(it?.type ?? "")
    const text = clean(it?.text ?? "")
    if (type !== "text") {
      continue
    }
    if (!text) {
      continue
    }
    out.push(text)
  }
  return out.join("\n")
}

const listFrom = (raw) => {
  if (!raw) {
    return []
  }
  if (Array.isArray(raw)) {
    return raw.filter((it) => it && typeof it === "object")
  }
  const obj = raw && typeof raw === "object" ? raw : null
  if (!obj) {
    return []
  }
  if (Array.isArray(obj.results)) {
    return obj.results.filter((it) => it && typeof it === "object")
  }
  if (Array.isArray(obj.items)) {
    return obj.items.filter((it) => it && typeof it === "object")
  }
  if (Array.isArray(obj.data)) {
    return obj.data.filter((it) => it && typeof it === "object")
  }
  return []
}

const pickLibIdFromRow = (raw) => {
  const row = raw && typeof raw === "object" ? raw : null
  if (!row) {
    return ""
  }
  const id0 =
    typeof row.libraryId === "string"
      ? row.libraryId
      : typeof row.library_id === "string"
        ? row.library_id
        : typeof row.id === "string"
          ? row.id
          : typeof row.slug === "string"
            ? row.slug
            : ""
  const id = clean(id0)
  return id
}

const pickLibIdFromJson = (raw) => {
  if (!raw) {
    return ""
  }
  if (typeof raw === "string") {
    return clean(raw)
  }
  if (Array.isArray(raw)) {
    for (var i = 0; i < raw.length; i++) {
      const id = pickLibIdFromRow(raw[i])
      if (id) {
        return id
      }
    }
    return ""
  }
  const id0 = pickLibIdFromRow(raw)
  if (id0) {
    return id0
  }
  const list = listFrom(raw)
  for (var i = 0; i < list.length; i++) {
    const id = pickLibIdFromRow(list[i])
    if (id) {
      return id
    }
  }
  return ""
}

const pickLibIdFromText = (raw) => {
  const text = clean(raw)
  if (!text) {
    return ""
  }
  const lines = text.split("\n")
  for (var i = 0; i < lines.length; i++) {
    const line0 = lines[i] || ""
    const line = clean(line0)
    if (!line) {
      continue
    }
    const low = line.toLowerCase()
    if (!low.includes("library id")) {
      continue
    }
    if (low.includes("format") && low.includes("/org/project")) {
      continue
    }
    const m = line.match(/(\/[a-z0-9._-]+\/[a-z0-9._-]+)/i)
    if (m && m[1]) {
      return clean(m[1])
    }
  }
  const m0 = text.match(/libraryId\s*[:=]\s*(\/?[a-z0-9._/-]+)/i)
  if (m0 && m0[1]) {
    return clean(m0[1])
  }
  const m1 = text.match(/library_id\s*[:=]\s*(\/?[a-z0-9._/-]+)/i)
  if (m1 && m1[1]) {
    return clean(m1[1])
  }
  const m2 = text.match(/(\/[a-z0-9._-]+\/[a-z0-9._-]+)/i)
  if (m2 && m2[1]) {
    return clean(m2[1])
  }
  return ""
}

const pickLibId = (res) => {
  const direct = pickLibIdFromJson(res)
  if (direct) {
    return direct
  }
  const content = contentFrom(res)
  const json = jsonFromContent(content)
  const fromJson = pickLibIdFromJson(json)
  if (fromJson) {
    return fromJson
  }
  const text = textFromContent(content)
  const fromText = pickLibIdFromText(text)
  if (fromText) {
    return fromText
  }
  return ""
}

const writeOut = (obj, code) => {
  stdout.write(`${JSON.stringify(obj, null, 2)}\n`)
  exit(code)
}

const shouldRetry = (msg) => {
  const text = clean(msg).toLowerCase()
  if (!text) {
    return false
  }
  if (text.includes("http 202")) {
    return true
  }
  if (text.includes("failed to fetch search results")) {
    return true
  }
  if (text.includes("timeout")) {
    return true
  }
  return false
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const initSession = async (cfg) => {
  const init = await sendRpc(cfg, initReq(cfg.protocol), "", "")
  if (!init.ok) {
    return { ok: false, error: init.error || "MCP initialize failed" }
  }
  const initMsg = init.msg
  const res0 = initMsg && typeof initMsg.result === "object" ? initMsg.result : null
  const proto0 = res0 && typeof res0.protocolVersion === "string" ? res0.protocolVersion : ""
  const proto = clean(proto0) || cfg.protocol
  if (!proto) {
    return { ok: false, error: "MCP initialize missing protocolVersion" }
  }
  const sid0 = init.headers && typeof init.headers.get === "function" ? init.headers.get("mcp-session-id") : ""
  const sid = clean(sid0)
  const noted = await sendRpc(cfg, initNote(), sid, proto)
  if (!noted.ok) {
    return { ok: false, error: noted.error || "MCP initialized notification failed" }
  }
  return { ok: true, sessionId: sid, protocol: proto }
}

const callTool = async (cfg, session, tool, args, tries) => {
  const count = tries > 0 ? tries : 1
  var lastErr = ""
  for (var i = 0; i < count; i++) {
    const call = await sendRpc(cfg, callReq(tool, args), session.sessionId, session.protocol)
    if (call.ok) {
      const res = resultFrom(call.msg)
      const err = resultError(res)
      if (!err) {
        return { ok: true, result: res }
      }
      lastErr = err
      if (i + 1 >= count) {
        break
      }
      if (!shouldRetry(err)) {
        break
      }
      await sleep(cfg.retryDelayMs)
      continue
    }
    const err = call.error || "MCP tool call failed"
    lastErr = err
    if (i + 1 >= count) {
      break
    }
    if (!shouldRetry(err)) {
      break
    }
    await sleep(cfg.retryDelayMs)
  }
  return { ok: false, error: lastErr || "MCP tool call failed" }
}

const runDdg = async (query, maxArg, cfg) => {
  if (!cfg.url) {
    return { ok: false, error: "Missing MCP URL", provider: "ddg" }
  }
  const tools = Array.isArray(cfg.tools) ? cfg.tools : []
  if (!tools.length) {
    return { ok: false, error: "Missing MCP tool", provider: "ddg" }
  }
  const init = await initSession(cfg)
  if (!init.ok) {
    return { ok: false, error: init.error || "MCP initialize failed", provider: "ddg" }
  }
  const args = Object.assign({}, cfg.args)
  if (!Object.prototype.hasOwnProperty.call(args, cfg.queryKey)) {
    args[cfg.queryKey] = query
  }
  var max = 0
  if (maxArg > 0) {
    max = maxArg
  }
  if (!max) {
    const maxRaw = pickEnv("MCP_DDG_MAX_RESULTS", "MCP_SEARCH_MAX_RESULTS") || envVal("MCP_MAX_RESULTS")
    if (maxRaw) {
      max = numFrom(maxRaw, 0, 1, 500)
    }
  }
  if (max > 0 && cfg.resultsKey) {
    if (!Object.prototype.hasOwnProperty.call(args, cfg.resultsKey)) {
      args[cfg.resultsKey] = max
    }
  }
  var lastErr = ""
  for (var i = 0; i < tools.length; i++) {
    const tool = tools[i] || ""
    if (!tool) {
      continue
    }
    const tries = tool === "web-search" ? cfg.retries + 1 : 1
    const res = await callTool(cfg, init, tool, args, tries)
    if (res.ok) {
      return { ok: true, result: res.result, tool, provider: "ddg" }
    }
    const err = res.error || "MCP tool call failed"
    lastErr = `${tool}: ${err}`
  }
  return { ok: false, error: lastErr || "MCP tool call failed", provider: "ddg" }
}

const runCtx7 = async (query, lib, libId, maxArg, cfg) => {
  if (!cfg.url) {
    return { ok: false, error: "Missing MCP URL", provider: "ctx7" }
  }
  if (!cfg.resolveTool || !cfg.queryTool) {
    return { ok: false, error: "Missing MCP tool", provider: "ctx7" }
  }
  const init = await initSession(cfg)
  if (!init.ok) {
    return { ok: false, error: init.error || "MCP initialize failed", provider: "ctx7" }
  }
  var libraryId = clean(libId)
  var resolved = false
  if (!libraryId) {
    const name0 = clean(lib)
    const name = name0 || query
    const args = Object.assign({}, cfg.args, cfg.resolveArgs)
    if (!Object.prototype.hasOwnProperty.call(args, cfg.libraryNameKey)) {
      args[cfg.libraryNameKey] = name
    }
    if (!Object.prototype.hasOwnProperty.call(args, cfg.queryKey)) {
      args[cfg.queryKey] = query
    }
    const res = await callTool(cfg, init, cfg.resolveTool, args, cfg.retries + 1)
    if (!res.ok) {
      const err = res.error || "MCP tool call failed"
      return { ok: false, error: `${cfg.resolveTool}: ${err}`, provider: "ctx7", tool: cfg.resolveTool }
    }
    libraryId = pickLibId(res.result)
    resolved = true
    if (!libraryId) {
      return { ok: false, error: "Context7 libraryId not found", provider: "ctx7", tool: cfg.resolveTool }
    }
  }
  const args = Object.assign({}, cfg.args, cfg.queryArgs)
  if (!Object.prototype.hasOwnProperty.call(args, cfg.libraryKey)) {
    args[cfg.libraryKey] = libraryId
  }
  if (!Object.prototype.hasOwnProperty.call(args, cfg.queryKey)) {
    args[cfg.queryKey] = query
  }
  if (maxArg > 0 && cfg.resultsKey) {
    if (!Object.prototype.hasOwnProperty.call(args, cfg.resultsKey)) {
      args[cfg.resultsKey] = maxArg
    }
  }
  const res = await callTool(cfg, init, cfg.queryTool, args, cfg.retries + 1)
  if (!res.ok) {
    const err = res.error || "MCP tool call failed"
    return { ok: false, error: `${cfg.queryTool}: ${err}`, provider: "ctx7", tool: cfg.queryTool, libraryId }
  }
  return { ok: true, result: res.result, tool: cfg.queryTool, provider: "ctx7", libraryId, resolved }
}

const main = async () => {
  const parsed = parseArgs(argv.slice(2))
  const query = parsed.query
  if (!query) {
    writeOut(
      {
        ok: false,
        error:
          "Usage: mcp-search [--provider ddg|ctx7|both|auto] [--lib <name>] [--library-id <id>] [--max N] \"query\"",
      },
      2,
    )
    return
  }
  const provider = pickProvider(query, parsed.lib, parsed.libId, parsed.provider)
  const ddgCfg = cfgFromEnv()
  const ctx7Cfg = cfgCtx7FromEnv()
  if (provider === "ddg") {
    const out = await runDdg(query, parsed.max, ddgCfg)
    writeOut(out, out.ok ? 0 : 1)
    return
  }
  if (provider === "ctx7") {
    const out = await runCtx7(query, parsed.lib, parsed.libId, parsed.max, ctx7Cfg)
    writeOut(out, out.ok ? 0 : 1)
    return
  }
  if (provider === "both") {
    const ddg = await runDdg(query, parsed.max, ddgCfg)
    const ctx7 = await runCtx7(query, parsed.lib, parsed.libId, parsed.max, ctx7Cfg)
    const ok = ddg.ok || ctx7.ok
    const out = { ok, provider: "both", ddg, ctx7 }
    if (!ok) {
      const err = ddg.error || ctx7.error || "MCP tool call failed"
      writeOut(Object.assign(out, { error: err }), 1)
      return
    }
    writeOut(out, 0)
    return
  }
  writeOut({ ok: false, error: `Unknown provider "${provider || "auto"}"` }, 1)
}

main()
