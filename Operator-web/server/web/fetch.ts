import { clean, clip } from "../utils/text"

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

const timeoutMs = () => {
  const raw0 = (process.env.WEB_FETCH_TIMEOUT_MS ?? "").trim()
  const raw1 = raw0 || (process.env.REQUEST_TIMEOUT_MS ?? "").trim()
  return numFrom(raw1, 30000, 1000, 120000)
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

const timeoutError = () => new Error("Web fetch timed out")

export const host = (u: string) => {
  const m = u.match(/^https?:\/\/([^/]+)/i)
  const h0 = m?.[1] ?? ""
  return h0.toLowerCase()
}

export const allow = (u: string, list: string[]) => {
  const h = host(u)

  if (!h) {
    return false
  }

  for (var i = 0; i < list.length; i++) {
    const d0 = list[i] ?? ""
    const d = d0.trim().toLowerCase()

    if (!d) {
      continue
    }

    if (h === d || h.endsWith(`.${d}`)) {
      return true
    }
  }

  return false
}

export const fetchText = async (u: string, lim: number, list?: string[]) => {
  const url = clean(u)

  if (!url) {
    return ""
  }

  const ok = url.startsWith("http://") || url.startsWith("https://")

  if (!ok) {
    return ""
  }

  if (list && list.length) {
    const ok = allow(url, list)

    if (!ok) {
      return ""
    }
  }

  const to = timedSignal(timeoutMs())
  const r = await fetch(url, {
    redirect: "follow",
    signal: to.sig,
    headers: {
      "user-agent": "Operator-Web/1.0",
      accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
    },
  }).catch(() => null)

  if (!r) {
    if (to.timed()) {
      throw timeoutError()
    }
    return ""
  }

  if (!r.ok) {
    return ""
  }

  const ct = (r.headers.get("content-type") ?? "").toLowerCase()

  if (!ct.includes("text/html") && !ct.includes("text/plain")) {
    return ""
  }

  const len0 = Number.parseInt(r.headers.get("content-length") ?? "", 10)

  if (Number.isFinite(len0) && len0 > lim) {
    return ""
  }

  const txt0 = await r.text().catch(() => "")
  return clip(txt0, lim)
}

export type Doc = { html: string; modified: string }

export const fetchDoc = async (u: string, lim: number, list?: string[]) => {
  const url = clean(u)

  if (!url) {
    return { html: "", modified: "" }
  }

  const ok = url.startsWith("http://") || url.startsWith("https://")

  if (!ok) {
    return { html: "", modified: "" }
  }

  if (list && list.length) {
    const ok = allow(url, list)

    if (!ok) {
      return { html: "", modified: "" }
    }
  }

  const to = timedSignal(timeoutMs())
  const r = await fetch(url, {
    redirect: "follow",
    signal: to.sig,
    headers: {
      "user-agent": "Operator-Web/1.0",
      accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
    },
  }).catch(() => null)

  if (!r) {
    if (to.timed()) {
      throw timeoutError()
    }
    return { html: "", modified: "" }
  }

  if (!r.ok) {
    return { html: "", modified: "" }
  }

  const ct = (r.headers.get("content-type") ?? "").toLowerCase()

  if (!ct.includes("text/html") && !ct.includes("text/plain")) {
    return { html: "", modified: "" }
  }

  const len0 = Number.parseInt(r.headers.get("content-length") ?? "", 10)

  if (Number.isFinite(len0) && len0 > lim) {
    return { html: "", modified: "" }
  }

  const mod0 = r.headers.get("last-modified") ?? ""
  const mod = clean(mod0)
  const txt0 = await r.text().catch(() => "")
  const html = clip(txt0, lim)
  return { html, modified: mod }
}

type PwPage = {
  goto: (url: string, opt?: { waitUntil?: "domcontentloaded" | "load" | "networkidle"; timeout?: number }) => Promise<unknown>
  content: () => Promise<string>
  waitForLoadState?: (state?: "domcontentloaded" | "load" | "networkidle", opt?: { timeout?: number }) => Promise<void>
  close?: () => Promise<void>
}

type PwBrowser = {
  newPage: (opt?: { userAgent?: string }) => Promise<PwPage>
  close: () => Promise<void>
}

type PwChromium = {
  launch: (opt?: { headless?: boolean }) => Promise<PwBrowser>
}

type PwMod = { chromium?: PwChromium }

const renderOn = () => {
  const raw = (process.env.WEB_RENDER ?? "").trim()

  if (!raw) {
    return false
  }

  if (raw === "1") {
    return true
  }

  const low = raw.toLowerCase()

  if (low === "true" || low === "yes" || low === "on" || low === "auto") {
    return true
  }

  return false
}

export const renderDoc = async (u: string, lim: number, list?: string[]) => {
  if (!renderOn()) {
    return { html: "", modified: "" }
  }

  const url = clean(u)

  if (!url) {
    return { html: "", modified: "" }
  }

  const ok = url.startsWith("http://") || url.startsWith("https://")

  if (!ok) {
    return { html: "", modified: "" }
  }

  if (list && list.length) {
    const ok = allow(url, list)

    if (!ok) {
      return { html: "", modified: "" }
    }
  }

  const mod = (await import("playwright").catch(() => null)) as PwMod | null
  const chr = mod?.chromium ?? null

  if (!chr || typeof chr.launch !== "function") {
    return { html: "", modified: "" }
  }

  const br = await chr.launch({ headless: true }).catch(() => null)

  if (!br) {
    return { html: "", modified: "" }
  }

  const pg = await br.newPage({ userAgent: "Operator-Web/1.0" }).catch(() => null)

  if (!pg) {
    br.close().catch(() => {})
    return { html: "", modified: "" }
  }

  const timeout = timeoutMs()
  const nav = await pg.goto(url, { waitUntil: "domcontentloaded", timeout }).catch(() => null)

  if (!nav) {
    pg.close && pg.close().catch(() => {})
    br.close().catch(() => {})
    return { html: "", modified: "" }
  }

  if (pg.waitForLoadState) {
    pg.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {})
  }

  const txt0 = await pg.content().catch(() => "")
  pg.close && pg.close().catch(() => {})
  br.close().catch(() => {})
  const html = clip(txt0, lim)
  return { html, modified: "" }
}

export const fetchJson = async (u: string, headers?: Record<string, string>) => {
  const url = clean(u)

  if (!url) {
    return null
  }

  const ok = url.startsWith("http://") || url.startsWith("https://")

  if (!ok) {
    return null
  }

  const to = timedSignal(timeoutMs())
  const base = {
    "user-agent": "Operator-Web/1.0",
    accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
  }
  const extra = headers && typeof headers === "object" ? headers : null
  const hs = extra ? Object.assign({}, base, extra) : base
  const r = await fetch(url, {
    redirect: "follow",
    signal: to.sig,
    headers: hs,
  }).catch(() => null)

  if (!r) {
    if (to.timed()) {
      throw timeoutError()
    }
    return null
  }

  if (!r.ok) {
    return null
  }

  const j = (await r.json().catch(() => null)) as unknown
  return j
}
