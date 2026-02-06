import { clean, clip } from "../utils/text"
import { allow, fetchDoc, host } from "./fetch"
import { extract } from "./extract"
import { braveNews, catalogSeeds, gdelt, webAllow, webBlock, webSearch } from "./sources"
import { mcpSearchChain, type McpSearchMeta } from "./mcp"

export type WebSearchResult = {
  url: string
  title: string
  date?: string
  outlet?: string
  source?: string
}

export type WebSearchOut = {
  type: "web_search"
  ok: boolean
  query: string
  kind: string
  results: WebSearchResult[]
  sources: { url: string; title?: string }[]
  mcp?: McpSearchMeta
  minDate?: number
  maxDate?: number
  error?: string
}

export type WebFetchOut = {
  type: "web_fetch"
  ok: boolean
  url: string
  title?: string
  date?: string
  outlet?: string
  sentences?: string[]
  retrieved?: string
  cached?: boolean
  error?: string
  sources?: { url: string }[]
}

type CacheRow = { html: string; modified: string; ts: number }

const cache = new Map<string, CacheRow>()

const listDomains = (v: unknown) => {
  const out: string[] = []

  if (typeof v === "string") {
    const parts = v.split(",")

    for (var i = 0; i < parts.length; i++) {
      const p0 = parts[i] ?? ""
      const p1 = clean(p0).toLowerCase()
      var d = p1

      if (!d) {
        continue
      }

      const h = host(d)

      if (h) {
        d = h
      }

      if (!d) {
        continue
      }

      if (!out.includes(d)) {
        out.push(d)
      }
    }

    return out
  }

  if (!Array.isArray(v)) {
    return out
  }

  for (var i = 0; i < v.length; i++) {
    const raw = v[i]
    const s0 = typeof raw === "string" ? raw : ""
    const s1 = clean(s0).toLowerCase()
    var d = s1

    if (!d) {
      continue
    }

    const h = host(d)

    if (h) {
      d = h
    }

    if (!d) {
      continue
    }

    if (!out.includes(d)) {
      out.push(d)
    }
  }

  return out
}

const mergeAllow = (base: string[], extra: string[]) => {
  if (!extra.length) {
    return base.slice()
  }

  if (!base.length) {
    return extra.slice()
  }

  const set = new Set(base)
  const out: string[] = []

  for (var i = 0; i < extra.length; i++) {
    const d = extra[i] ?? ""

    if (!d) {
      continue
    }

    if (!set.has(d)) {
      continue
    }

    out.push(d)
  }

  return out
}

const mergeBlock = (base: string[], extra: string[]) => {
  const out = base.slice()

  for (var i = 0; i < extra.length; i++) {
    const d = extra[i] ?? ""

    if (!d) {
      continue
    }

    if (!out.includes(d)) {
      out.push(d)
    }
  }

  return out
}

const filterRes = (list: WebSearchResult[], allowList: string[], blockList: string[]) => {
  const out: WebSearchResult[] = []

  for (var i = 0; i < list.length; i++) {
    const it = list[i]
    const url = clean(it?.url ?? "")

    if (!url) {
      continue
    }

    if (blockList.length && allow(url, blockList)) {
      continue
    }

    if (allowList.length && !allow(url, allowList)) {
      continue
    }

    out.push(it)
  }

  return out
}

const yearFrom = (v: string) => {
  const t = clean(v)

  if (!t) {
    return 0
  }

  const m0 = t.match(/\b(19|20)\d{2}\b/)
  const y0 = m0?.[0] ?? ""
  const y1 = Number.parseInt(y0, 10)

  if (!Number.isFinite(y1)) {
    return 0
  }

  return y1
}

const dateNum = (v: string) => {
  const t = clean(v)

  if (!t) {
    return 0
  }

  const n = Date.parse(t)

  if (Number.isFinite(n)) {
    const d = new Date(n)
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + 1
    const day = d.getUTCDate()
    return y * 10000 + m * 100 + day
  }

  const y0 = yearFrom(t)

  if (!y0) {
    return 0
  }

  return y0 * 10000 + 101
}

const dateOk = (d: number, min: number, max: number) => {
  if (!min && !max) {
    return true
  }

  if (!d) {
    return false
  }

  if (min && d < min) {
    return false
  }

  if (max && d > max) {
    return false
  }

  return true
}

const filterByDate = (list: WebSearchResult[], min: number, max: number, kind: string) => {
  if (kind !== "news") {
    return list
  }

  if (!min && !max) {
    return list
  }

  const dated: WebSearchResult[] = []
  const undated: WebSearchResult[] = []

  for (var i = 0; i < list.length; i++) {
    const it = list[i]
    const d0 = typeof it?.date === "string" ? it.date : ""
    const d = dateNum(d0)

    if (!d) {
      undated.push(it)
      continue
    }

    if (!dateOk(d, min, max)) {
      continue
    }

    dated.push(it)
  }

  return dated.concat(undated)
}

const maxFrom = (v: unknown, def: number, lo: number, hi: number) => {
  const n0 = typeof v === "number" ? v : typeof v === "string" ? Number.parseInt(v, 10) : 0
  const n1 = Number.isFinite(n0) ? Math.floor(n0) : 0

  if (!n1) {
    return def
  }

  if (n1 < lo) {
    return lo
  }

  if (n1 > hi) {
    return hi
  }

  return n1
}

const pickKind = (raw: string) => {
  const k0 = clean(raw).toLowerCase()

  if (!k0) {
    return "web"
  }

  if (k0 === "news") {
    return "news"
  }

  if (k0 === "docs") {
    return "docs"
  }

  if (k0 === "model_catalog" || k0 === "catalog") {
    return "model_catalog"
  }

  if (k0 === "web") {
    return "web"
  }

  return "web"
}

const normProvider = (raw: string) => {
  const t = clean(raw).toLowerCase()

  if (!t) {
    return ""
  }

  if (t === "ddg" || t === "duckduckgo" || t === "duck") {
    return "ddg"
  }

  if (t === "searx" || t === "searxng") {
    return "searxng"
  }

  if (t === "ctx7" || t === "context7") {
    return "ctx7"
  }

  return ""
}

export const webSearchTool = async (
  args: unknown,
  opt?: { kind?: string; minDate?: number; maxDate?: number; allowDomains?: string[]; blockDomains?: string[]; maxResults?: number },
): Promise<WebSearchOut> => {
  const o = (args && typeof args === "object" ? args : null) as {
    query?: unknown
    allowed_domains?: unknown
    blocked_domains?: unknown
    kind?: unknown
    provider?: unknown
  } | null
  const q0 = typeof o?.query === "string" ? o.query : ""
  const query = clean(q0)
  const k0 = typeof o?.kind === "string" ? o.kind : ""
  const k1 = k0 || (opt?.kind ?? "")
  const kind = pickKind(k1)
  const p0 = typeof o?.provider === "string" ? o.provider : ""
  const provider = normProvider(p0)
  const force = !!provider

  if (!query) {
    return { type: "web_search", ok: false, query: "", kind, results: [], sources: [], error: "Missing query" }
  }

  const extraAllow = listDomains(o?.allowed_domains)
  const extraBlock = listDomains(o?.blocked_domains)

  if (extraAllow.length && extraBlock.length) {
    return { type: "web_search", ok: false, query, kind, results: [], sources: [], error: "allowed_domains and blocked_domains are mutually exclusive" }
  }

  const baseAllow = Array.isArray(opt?.allowDomains) ? opt?.allowDomains : webAllow
  const baseBlock = Array.isArray(opt?.blockDomains) ? opt?.blockDomains : webBlock
  const allowList = mergeAllow(baseAllow, extraAllow)
  const blockList = mergeBlock(baseBlock, extraBlock)
  const min = typeof opt?.minDate === "number" ? opt?.minDate : 0
  const max = typeof opt?.maxDate === "number" ? opt?.maxDate : 0
  const cap = maxFrom(opt?.maxResults, 8, 3, 12)
  const fallback = async () => {
    var out: WebSearchResult[] = []

    if (kind === "news") {
      const list = await braveNews(query, min, max)
      const list2 = await gdelt(query, min, max)
      const seen = new Set<string>()
      const add = (row: { url?: string; title?: string; date?: string; outlet?: string }, src: string) => {
        const url = clean(row?.url ?? "")

        if (!url) {
          return
        }

        if (seen.has(url)) {
          return
        }

        seen.add(url)
        out.push({
          url,
          title: clean(row?.title ?? ""),
          date: clean(row?.date ?? ""),
          outlet: clean(row?.outlet ?? ""),
          source: src,
        })
      }

      for (var i = 0; i < list.length; i++) {
        add(list[i], "brave-news")
      }

      for (var i = 0; i < list2.length; i++) {
        add(list2[i], "gdelt")
      }
    }

    if (kind === "model_catalog") {
      const seed = catalogSeeds(query)
      const seeds = seed.seeds
      const extra = await webSearch(query, false, "model_catalog", min, max)

      for (var i = 0; i < seeds.length; i++) {
        const it = seeds[i]
        const url = clean(it?.url ?? "")
        const title = clean(it?.title ?? "")
        const outlet = clean(it?.vendor ?? "")

        if (!url || !title) {
          continue
        }

        out.push({ url, title, outlet, source: "official" })
      }

      for (var i = 0; i < extra.length; i++) {
        const it = extra[i]
        out.push({
          url: clean(it?.url ?? ""),
          title: clean(it?.title ?? ""),
          date: clean(it?.date ?? ""),
          outlet: clean(it?.outlet ?? ""),
          source: clean(it?.source ?? "") || "search",
        })
      }
    }

    if (kind === "docs") {
      const list = await webSearch(query, false, "docs", min, max)
      out = list.map((it) => ({
        url: clean(it?.url ?? ""),
        title: clean(it?.title ?? ""),
        date: clean(it?.date ?? ""),
        outlet: clean(it?.outlet ?? ""),
        source: clean(it?.source ?? "") || "search",
      }))
    }

    if (kind === "web") {
      const list = await webSearch(query, false, "web", min, max)
      out = list.map((it) => ({
        url: clean(it?.url ?? ""),
        title: clean(it?.title ?? ""),
        date: clean(it?.date ?? ""),
        outlet: clean(it?.outlet ?? ""),
        source: clean(it?.source ?? "") || "search",
      }))
    }

    return out
  }
  const mergeResults = (base: WebSearchResult[], extra: WebSearchResult[], limit: number) => {
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
      if (out.length >= limit) {
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

    return out
  }

  var res: WebSearchResult[] = []
  var usedMcp = false
  const mcp = await mcpSearchChain(query, cap, kind, provider)
  var mcpMeta = mcp.meta

  if (mcp.ok && mcp.results.length) {
    res = mcp.results
    usedMcp = true
  }

  if (!usedMcp && !force) {
    res = await fallback()
  }

  const filtered = filterRes(res, allowList, blockList)
  const dated = filterByDate(filtered, min, max, kind)
  var trimmed = dated.slice(0, cap)

  if (usedMcp && trimmed.length < cap) {
    res = await fallback()
    const filtered2 = filterRes(res, allowList, blockList)
    const dated2 = filterByDate(filtered2, min, max, kind)
    trimmed = mergeResults(trimmed, dated2, cap)
  }

  if (!usedMcp && !force) {
    const base = (mcpMeta && typeof mcpMeta === "object" ? mcpMeta : null) as McpSearchMeta | null
    const attempted = Array.isArray(base?.attemptedProviders) ? base?.attemptedProviders ?? [] : []
    const providers = Array.isArray(base?.providers) ? base?.providers ?? [] : []
    mcpMeta = { attemptedProviders: attempted, usedProvider: "fallback", providers }
  }
  if (!usedMcp && force) {
    const base = (mcpMeta && typeof mcpMeta === "object" ? mcpMeta : null) as McpSearchMeta | null
    const attempted = Array.isArray(base?.attemptedProviders) ? base?.attemptedProviders ?? [] : []
    const providers = Array.isArray(base?.providers) ? base?.providers ?? [] : []
    mcpMeta = { attemptedProviders: attempted, usedProvider: provider, providers }
  }
  const sources: { url: string; title?: string }[] = []

  for (var i = 0; i < trimmed.length; i++) {
    const it = trimmed[i]
    const url = clean(it?.url ?? "")

    if (!url) {
      continue
    }

    sources.push({ url, title: clean(it?.title ?? "") })
  }

  var ok = true
  var err = ""

  if (force && !usedMcp) {
    ok = false
    err = clean(typeof mcp.error === "string" ? mcp.error : "") || "MCP search failed"
  }

  return {
    type: "web_search",
    ok,
    query,
    kind,
    results: trimmed,
    sources,
    mcp: mcpMeta,
    minDate: min || undefined,
    maxDate: max || undefined,
    error: err || undefined,
  }
}

const cacheGet = (url: string, ttl: number) => {
  const row = cache.get(url) ?? null

  if (!row) {
    return null
  }

  if (ttl <= 0) {
    return row
  }

  const age = Date.now() - row.ts

  if (age <= ttl * 1000) {
    return row
  }

  cache.delete(url)
  return null
}

const cacheSet = (url: string, html: string, modified: string) => {
  cache.set(url, { html, modified, ts: Date.now() })
}

const limFrom = (v: unknown, def: number) => {
  const n0 = typeof v === "number" ? v : typeof v === "string" ? Number.parseInt(v, 10) : 0
  const n1 = Number.isFinite(n0) ? Math.floor(n0) : 0

  if (!n1) {
    return def
  }

  if (n1 < 256) {
    return 256
  }

  if (n1 > 4000) {
    return 4000
  }

  return n1
}

const ttlFrom = (v: unknown, def: number) => {
  const n0 = typeof v === "number" ? v : typeof v === "string" ? Number.parseInt(v, 10) : 0
  const n1 = Number.isFinite(n0) ? Math.floor(n0) : 0

  if (n1 < 0) {
    return 0
  }

  if (!n1) {
    return def
  }

  if (n1 > 86400) {
    return 86400
  }

  return n1
}

export const webFetchTool = async (
  args: unknown,
  opt?: {
    query?: string
    allowDomains?: string[]
    blockDomains?: string[]
    maxContentTokens?: number
    cacheTtlSeconds?: number
    nowIso?: string
  },
): Promise<WebFetchOut> => {
  const o = (args && typeof args === "object" ? args : null) as {
    url?: unknown
    title?: unknown
    outlet?: unknown
    allowed_domains?: unknown
    blocked_domains?: unknown
    max_content_tokens?: unknown
  } | null
  const url0 = typeof o?.url === "string" ? o.url : ""
  const url = clean(url0)

  if (!url) {
    return { type: "web_fetch", ok: false, url: "", error: "Missing url" }
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return { type: "web_fetch", ok: false, url, error: "Invalid url" }
  }

  const extraAllow = listDomains(o?.allowed_domains)
  const extraBlock = listDomains(o?.blocked_domains)

  if (extraAllow.length && extraBlock.length) {
    return { type: "web_fetch", ok: false, url, error: "allowed_domains and blocked_domains are mutually exclusive" }
  }

  const baseAllow = Array.isArray(opt?.allowDomains) ? opt?.allowDomains : webAllow
  const baseBlock = Array.isArray(opt?.blockDomains) ? opt?.blockDomains : webBlock
  const allowList = mergeAllow(baseAllow, extraAllow)
  const blockList = mergeBlock(baseBlock, extraBlock)

  if (blockList.length && allow(url, blockList)) {
    return { type: "web_fetch", ok: false, url, error: "Blocked domain" }
  }

  if (allowList.length && !allow(url, allowList)) {
    return { type: "web_fetch", ok: false, url, error: "Domain not allowed" }
  }

  const maxTokens = limFrom(o?.max_content_tokens, limFrom(opt?.maxContentTokens, 1600))
  const lim = maxTokens * 4
  const ttl = ttlFrom(opt?.cacheTtlSeconds, 300)
  const cached = cacheGet(url, ttl)
  var html = ""
  var modified = ""
  var usedCache = false

  if (cached) {
    html = clip(cached.html, lim)
    modified = cached.modified
    usedCache = true
  }

  if (!html) {
    const doc = await fetchDoc(url, lim, allowList)
    html = doc.html
    modified = doc.modified

    if (html) {
      cacheSet(url, html, modified)
    }
  }

  if (!html) {
    return { type: "web_fetch", ok: false, url, error: "Fetch failed" }
  }

  const q0 = typeof opt?.query === "string" ? opt.query : ""
  const q = clean(q0)
  const title = clean(typeof o?.title === "string" ? o.title : "")
  const outlet = clean(typeof o?.outlet === "string" ? o.outlet : "")
  const item = extract(html, q, { url, title, outlet }, { modified, allowModified: false })
  const sent = Array.isArray(item?.sentences) ? item.sentences : []
  const iso = typeof opt?.nowIso === "string" ? opt.nowIso : ""

  return {
    type: "web_fetch",
    ok: true,
    url,
    title: clean(item?.title ?? ""),
    date: clean(item?.date ?? ""),
    outlet: clean(item?.outlet ?? ""),
    sentences: sent,
    retrieved: iso,
    cached: usedCache,
    sources: [{ url }],
  }
}
