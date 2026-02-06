#!/usr/bin/env node
const { argv, env, stdout, exit } = process

const clean = (val) => (typeof val === "string" ? val.trim() : "")

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
      clientInfo: { name: "mcp-read", version: "1.0.0" },
    },
  }
}

const initNote = () => ({ jsonrpc: "2.0", method: "notifications/initialized" })

const callReq = (tool, args) => {
  const id = `call_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name: tool, arguments: args } }
}

const cfgFromEnv = () => {
  const url = pickEnv("MCP_SEARXNG_URL", "MCP_SEARCH_URL") || "http://mcp-searxng:8030/mcp"
  const tool = pickEnv("MCP_READ_TOOL", "MCP_SEARXNG_READ_TOOL") || "web_url_read"
  const headRaw = pickEnv("MCP_SEARXNG_HEADERS", "MCP_SEARCH_HEADERS")
  const token = pickEnv("MCP_SEARXNG_TOKEN", "MCP_SEARCH_TOKEN")
  const tokenHeader = pickEnv("MCP_SEARXNG_TOKEN_HEADER", "MCP_SEARCH_TOKEN_HEADER")
  const tokenPrefix = pickEnv("MCP_SEARXNG_TOKEN_PREFIX", "MCP_SEARCH_TOKEN_PREFIX")
  const proto0 = pickEnv("MCP_SEARXNG_PROTOCOL_VERSION", "MCP_PROTOCOL_VERSION")
  const proto = proto0 || "2024-11-05"
  const timeout0 = pickEnv("MCP_SEARXNG_TIMEOUT_MS", "MCP_SEARCH_TIMEOUT_MS")
  const timeout1 = timeout0 || envVal("REQUEST_TIMEOUT_MS")
  const timeoutMs = numFrom(timeout1, 30000, 1000, 120000)
  const argsRaw = pickEnv("MCP_READ_ARGS", "MCP_SEARXNG_ARGS")
  const qKey0 = pickEnv("MCP_READ_QUERY_KEY", "")
  const qKey1 = clean(qKey0)
  const queryKey = isPlaceholder(qKey1) ? "url" : qKey1 || "url"
  const headers = readHeaders(headRaw, token, tokenHeader, tokenPrefix)
  const args = readArgs(argsRaw)
  return { url, tool, headers, protocol: proto, timeoutMs, args, queryKey, resultsKey: "" }
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

const writeOut = (obj, code) => {
  stdout.write(`${JSON.stringify(obj, null, 2)}\n`)
  exit(code)
}

const main = async () => {
  const url = argv.slice(2).join(" ").trim()
  if (!url) {
    writeOut({ ok: false, error: "Usage: mcp-read \"https://example.com\"" }, 2)
    return
  }
  const cfg = cfgFromEnv()
  if (!cfg.url) {
    writeOut({ ok: false, error: "Missing MCP URL" }, 1)
    return
  }
  if (!cfg.tool) {
    writeOut({ ok: false, error: "Missing MCP tool" }, 1)
    return
  }
  const init = await sendRpc(cfg, initReq(cfg.protocol), "", "")
  if (!init.ok) {
    writeOut({ ok: false, error: init.error || "MCP initialize failed" }, 1)
    return
  }
  const initMsg = init.msg
  const res0 = initMsg && typeof initMsg.result === "object" ? initMsg.result : null
  const proto0 = res0 && typeof res0.protocolVersion === "string" ? res0.protocolVersion : ""
  const proto = clean(proto0) || cfg.protocol
  if (!proto) {
    writeOut({ ok: false, error: "MCP initialize missing protocolVersion" }, 1)
    return
  }
  const sid0 = init.headers && typeof init.headers.get === "function" ? init.headers.get("mcp-session-id") : ""
  const sid = clean(sid0)
  const noted = await sendRpc(cfg, initNote(), sid, proto)
  if (!noted.ok) {
    writeOut({ ok: false, error: noted.error || "MCP initialized notification failed" }, 1)
    return
  }
  const args = Object.assign({}, cfg.args)
  if (!Object.prototype.hasOwnProperty.call(args, cfg.queryKey)) {
    args[cfg.queryKey] = url
  }
  const call = await sendRpc(cfg, callReq(cfg.tool, args), sid, proto)
  if (!call.ok) {
    writeOut({ ok: false, error: call.error || "MCP tool call failed" }, 1)
    return
  }
  writeOut({ ok: true, result: resultFrom(call.msg) }, 0)
}

main()
