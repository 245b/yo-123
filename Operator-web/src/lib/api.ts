const key = "ms_api_base"
const base0 = import.meta.env.VITE_API_BASE ?? ""
const base1 = base0.trim()

const hostFrom = (raw: string) => {
  const t0 = typeof raw === "string" ? raw : ""
  const t = t0.trim().toLowerCase()

  if (!t) {
    return ""
  }

  var out = t

  if (out.startsWith("http://")) {
    out = out.slice(7)
  }

  if (out.startsWith("https://")) {
    out = out.slice(8)
  }

  const h0 = out.split("/")[0] ?? ""
  const h1 = h0.split(":")[0] ?? ""
  return h1.trim()
}

const isLoopback = (raw: string) => {
  const h = hostFrom(raw)
  return h === "localhost" || h === "127.0.0.1"
}

const norm = (v: string) => {
  const t0 = typeof v === "string" ? v : ""
  const t = t0.trim()

  if (!t) {
    return ""
  }

  if (!t.endsWith("/")) {
    return t
  }

  return t.slice(0, -1)
}

const scrub = (raw: string) => {
  const t = norm(raw)

  if (!t) {
    return ""
  }

  if (t.startsWith("/") && !t.startsWith("//")) {
    return ""
  }

  if (t.endsWith("/api")) {
    return t.slice(0, -4)
  }

  return t
}

const pickBase = () => {
  const loc = typeof window === "undefined" ? null : window.location
  const ls = typeof window === "undefined" ? null : window.localStorage
  const qs = loc ? new URLSearchParams(loc.search) : null
  const q0 = (qs?.get("api") ?? qs?.get("apiBase") ?? "").trim()
  const q1 = scrub(q0)
  const b1 = scrub(base1)
  const host0 = (loc?.hostname ?? "").trim().toLowerCase()
  const host = host0 || ""
  const allowLoop = host === "localhost" || host === "127.0.0.1"
  const b2 = !b1 ? "" : !isLoopback(b1) || allowLoop ? b1 : ""

  if (q1 && ls) {
    ls.setItem(key, q1)
  }

  const mem0 = (ls?.getItem(key) ?? "").trim()
  const mem = scrub(mem0)
  const port = (loc?.port ?? "").trim()
  const proto = loc?.protocol === "https:" ? "https" : "http"
  const need = !!host && port !== "3000" && !b1
  const dev0 = need ? `${proto}//${host}:3000` : ""
  const mem2 = !mem ? "" : !isLoopback(mem) || allowLoop ? mem : ""
  const base2 = q1 || b2 || mem2 || dev0
  return scrub(base2)
}

var probing = false

export const apiBaseCandidates = () => {
  const loc = typeof window === "undefined" ? null : window.location
  const ls = typeof window === "undefined" ? null : window.localStorage
  const qs = loc ? new URLSearchParams(loc.search) : null
  const q0 = (qs?.get("api") ?? qs?.get("apiBase") ?? "").trim()
  const q1 = scrub(q0)
  const b1 = scrub(base1)
  const mem0 = (ls?.getItem(key) ?? "").trim()
  const mem = scrub(mem0)
  const host0 = (loc?.hostname ?? "").trim()
  const host = host0.toLowerCase()
  const port = (loc?.port ?? "").trim()
  const proto = loc?.protocol === "https:" ? "https" : "http"
  const allowLoop = host === "localhost" || host === "127.0.0.1"
  const b2 = !b1 ? "" : !isLoopback(b1) || allowLoop ? b1 : ""
  const mem2 = !mem ? "" : !isLoopback(mem) || allowLoop ? mem : ""
  const dev0 = host && port !== "3000" ? `${proto}//${host}:3000` : ""

  const list: string[] = []
  const add = (v: string) => {
    const t = scrub(v)

    if (!t) {
      return
    }

    if (list.includes(t)) {
      return
    }

    list.push(t)
  }

  add(q1)
  add(b2)
  add(mem2)
  add(dev0)
  add("http://operator-web:3000")
  add("http://127.0.0.1:3000")
  add("http://localhost:3000")
  add("http://host.docker.internal:3000")

  return list
}

export const rememberApiBase = (raw: string) => {
  const loc = typeof window === "undefined" ? null : window.location
  const ls = typeof window === "undefined" ? null : window.localStorage

  if (!loc || !ls) {
    return
  }

  const v = scrub(raw)

  if (!v) {
    return
  }

  ls.setItem(key, v)
}

export const probeApiBase = async () => {
  if (probing) {
    return
  }

  probing = true
  const loc = typeof window === "undefined" ? null : window.location
  const ls = typeof window === "undefined" ? null : window.localStorage

  if (!loc || !ls) {
    probing = false
    return
  }

  const qs = new URLSearchParams(loc.search)
  const q0 = (qs.get("api") ?? qs.get("apiBase") ?? "").trim()
  const q1 = scrub(q0)

  if (q1) {
    ls.setItem(key, q1)
  }

  const host = (loc.hostname ?? "").trim()
  const port = (loc.port ?? "").trim()
  const proto = loc.protocol === "https:" ? "https" : "http"
  const mem0 = (ls.getItem(key) ?? "").trim()
  const mem = scrub(mem0)
  const host1 = host.toLowerCase()
  const allowLoop = host1 === "localhost" || host1 === "127.0.0.1"
  const b1 = scrub(base1)
  const b2 = !b1 ? "" : !isLoopback(b1) || allowLoop ? b1 : ""
  const mem2 = !mem ? "" : !isLoopback(mem) || allowLoop ? mem : ""
  const dev0 = host && port !== "3000" ? `${proto}//${host}:3000` : ""

  const list: string[] = []
  const add = (v: string) => {
    const t = scrub(v)

    if (!t) {
      return
    }

    if (list.includes(t)) {
      return
    }

    list.push(t)
  }

  add(q1)
  add(b2)
  add(mem2)
  add(dev0)
  add("http://operator-web:3000")
  add("http://127.0.0.1:3000")
  add("http://localhost:3000")
  add("http://host.docker.internal:3000")

  if (!list.length) {
    probing = false
    return
  }

  for (var i = 0; i < list.length; i++) {
    const b0 = list[i] ?? ""
    const b = norm(b0)

    if (!b) {
      continue
    }

    const u = `${b}/api/health`
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 1500)
    const r = await fetch(u, { method: "GET", cache: "no-store", signal: ctl.signal }).catch(() => null)
    clearTimeout(t)

    if (!r || !r.ok) {
      continue
    }

    ls.setItem(key, b)
    probing = false
    return
  }

  if (mem) {
    ls.removeItem(key)
  }

  probing = false
}

const slash = (raw: string): string => {
  const p0 = raw.trim()
  const p = p0 || "/"
  return p.startsWith("/") ? p : `/${p}`
}

export const apiUrl = (raw: string): string => {
  const p = slash(raw)
  const base = pickBase()

  if (!base) {
    return p
  }

  return `${base}${p}`
}

export const apiUrlWithBase = (raw: string, base0: string): string => {
  const p = slash(raw)
  const base = scrub(base0)

  if (!base) {
    return p
  }

  return `${base}${p}`
}

export const wsUrl = (raw: string): string => {
  const u = apiUrl(raw)

  if (u.startsWith("ws://") || u.startsWith("wss://")) {
    return u
  }

  if (u.startsWith("http://")) {
    return `ws://${u.slice(7)}`
  }

  if (u.startsWith("https://")) {
    return `wss://${u.slice(8)}`
  }

  if (u.startsWith("/")) {
    const proto = window.location.protocol === "https:" ? "wss" : "ws"
    return `${proto}://${window.location.host}${u}`
  }

  return u
}
