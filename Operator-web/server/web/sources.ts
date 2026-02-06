import { clean } from "../utils/text"
import { fetchJson, allow } from "./fetch"
import { fixDate } from "./extract"

const vendors = [
  {
    id: "openai",
    keys: ["openai", "chatgpt", "gpt", "o1", "o3"],
    domains: ["openai.com"],
    pages: [
      { url: "https://platform.openai.com/docs/models", title: "OpenAI models documentation" },
      { url: "https://openai.com/news", title: "OpenAI news" },
    ],
  },
  {
    id: "anthropic",
    keys: ["anthropic", "claude"],
    domains: ["anthropic.com"],
    pages: [
      { url: "https://docs.anthropic.com/claude/docs/models-overview", title: "Anthropic model overview" },
      { url: "https://www.anthropic.com/news", title: "Anthropic news" },
    ],
  },
  {
    id: "google",
    keys: ["google", "deepmind", "gemini", "vertex"],
    domains: ["ai.google.dev", "cloud.google.com", "deepmind.google"],
    pages: [
      { url: "https://ai.google.dev/gemini-api/docs/models", title: "Gemini API models" },
      { url: "https://cloud.google.com/vertex-ai/generative-ai/docs/models", title: "Vertex AI model catalog" },
    ],
  },
  {
    id: "meta",
    keys: ["meta", "llama", "llama2", "llama3", "llama 2", "llama 3"],
    domains: ["ai.meta.com", "about.meta.com", "facebook.com"],
    pages: [
      { url: "https://ai.meta.com/llama/", title: "Meta Llama models" },
      { url: "https://ai.meta.com/blog/", title: "Meta AI blog" },
    ],
  },
  {
    id: "mistral",
    keys: ["mistral"],
    domains: ["mistral.ai"],
    pages: [
      { url: "https://docs.mistral.ai/getting-started/models/", title: "Mistral model list" },
      { url: "https://mistral.ai/news/", title: "Mistral news" },
    ],
  },
  {
    id: "deepseek",
    keys: ["deepseek", "deep seek"],
    domains: ["deepseek.com", "deepseek.ai"],
    pages: [
      { url: "https://www.deepseek.com/", title: "DeepSeek" },
      { url: "https://api.deepseek.com/", title: "DeepSeek API" },
      { url: "https://api-docs.deepseek.com/", title: "DeepSeek API docs" },
      { url: "https://api-docs.deepseek.com/quick_start/pricing/", title: "DeepSeek models & pricing" },
      { url: "https://api-docs.deepseek.com/api/list-models", title: "DeepSeek list models" },
    ],
  },
  {
    id: "qwen",
    keys: ["qwen", "tongyi", "alibaba", "aliyun"],
    domains: ["qwen.ai", "aliyun.com", "alibabacloud.com", "modelscope.cn"],
    pages: [
      { url: "https://qwen.ai/", title: "Qwen models" },
    ],
  },
  {
    id: "moonshot",
    keys: ["moonshot", "kimi"],
    domains: ["moonshot.ai", "moonshot.cn", "kimi.ai"],
    pages: [
      { url: "https://www.moonshot.cn/", title: "Moonshot AI" },
      { url: "https://kimi.ai/", title: "Kimi" },
    ],
  },
  {
    id: "xai",
    keys: ["xai", "x.ai", "grok"],
    domains: ["x.ai"],
    pages: [{ url: "https://x.ai/grok", title: "Grok models" }],
  },
  {
    id: "cohere",
    keys: ["cohere", "command r", "command-r"],
    domains: ["cohere.com"],
    pages: [
      { url: "https://docs.cohere.com/docs/models", title: "Cohere models" },
      { url: "https://cohere.com/command", title: "Cohere Command" },
    ],
  },
]

const vendorAllow: string[] = []

for (var i = 0; i < vendors.length; i++) {
  const v = vendors[i]
  const ds = Array.isArray(v?.domains) ? v.domains : []

  for (var j = 0; j < ds.length; j++) {
    const d0 = ds[j] ?? ""
    const d = d0.trim().toLowerCase()

    if (!d) {
      continue
    }

    if (vendorAllow.includes(d)) {
      continue
    }

    vendorAllow.push(d)
  }
}

const baseAllow = [
  "wikipedia.org",
  "developer.mozilla.org",
  "stackoverflow.com",
  "developer.android.com",
  "developer.apple.com",
  "developer.chrome.com",
  "learn.microsoft.com",
  "nodejs.org",
  "npmjs.com",
  "bun.sh",
  "deno.land",
  "python.org",
  "pypi.org",
  "go.dev",
  "rust-lang.org",
  "swift.org",
  "cloudflare.com",
  "github.com",
  "docs.github.com",
  "kubernetes.io",
  "reuters.com",
  "apnews.com",
  "worldtimeapi.org",
  "open-meteo.com",
  "context7.com",
]

export const webAllow = baseAllow.concat(vendorAllow)

export const webBlock = ["bbc.com", "bbc.co.uk"]

const braveKey = () => {
  const k0 = (process.env.BRAVE_API_KEY ?? "").trim()

  if (k0 && k0 !== "REPLACE_ME") {
    return k0
  }

  const k1 = (process.env.BRAVE_SEARCH_API_KEY ?? "").trim()

  if (k1 && k1 !== "REPLACE_ME") {
    return k1
  }

  return ""
}

export const braveOn = () => {
  const key = braveKey()
  return !!key
}

const braveBase = () => {
  const b0 = (process.env.BRAVE_API_BASE ?? "").trim()
  return b0 || "https://api.search.brave.com/res/v1"
}

const braveUrl = (path: string) => {
  const base = braveBase()

  if (base.endsWith("/")) {
    return `${base}${path}`
  }

  return `${base}/${path}`
}

const dateTag = (n: number) => {
  if (!n) {
    return ""
  }

  const y = Math.floor(n / 10000)
  const m = Math.floor((n % 10000) / 100)
  const d = n % 100
  const mm = m < 10 ? `0${m}` : `${m}`
  const dd = d < 10 ? `0${d}` : `${d}`
  return `${y}-${mm}-${dd}`
}

const rangeTag = (min?: number, max?: number) => {
  const s = dateTag(typeof min === "number" ? min : 0)
  const e = dateTag(typeof max === "number" ? max : 0)

  if (!s || !e) {
    return ""
  }

  return `${s}to${e}`
}

const relDate = (v: string) => {
  const t = clean(v).toLowerCase()

  if (!t) {
    return ""
  }

  const now = new Date()

  if (t === "today") {
    return now.toISOString()
  }

  if (t === "yesterday") {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString()
  }

  const m = t.match(/^(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/)

  if (!m) {
    return ""
  }

  const n0 = Number.parseInt(m[1] ?? "", 10)
  const unit0 = m[2] ?? ""

  if (!Number.isFinite(n0) || !unit0) {
    return ""
  }

  const d = new Date(now)

  if (unit0.startsWith("minute")) {
    d.setUTCMinutes(d.getUTCMinutes() - n0)
    return d.toISOString()
  }

  if (unit0.startsWith("hour")) {
    d.setUTCHours(d.getUTCHours() - n0)
    return d.toISOString()
  }

  if (unit0.startsWith("day")) {
    d.setUTCDate(d.getUTCDate() - n0)
    return d.toISOString()
  }

  if (unit0.startsWith("week")) {
    d.setUTCDate(d.getUTCDate() - n0 * 7)
    return d.toISOString()
  }

  if (unit0.startsWith("month")) {
    d.setUTCMonth(d.getUTCMonth() - n0)
    return d.toISOString()
  }

  if (unit0.startsWith("year")) {
    d.setUTCFullYear(d.getUTCFullYear() - n0)
    return d.toISOString()
  }

  return ""
}

const parseDate = (v: string) => {
  const raw = clean(v)

  if (!raw) {
    return ""
  }

  const iso = fixDate(raw)
  const n = Date.parse(iso)

  if (Number.isFinite(n)) {
    return new Date(n).toISOString()
  }

  return relDate(raw)
}

export const vendorsForQuery = (q: string) => {
  const t = clean(q).toLowerCase()
  const out: string[] = []

  if (!t) {
    return out
  }

  for (var i = 0; i < vendors.length; i++) {
    const v = vendors[i]
    const id0 = typeof v?.id === "string" ? v.id : ""
    const id = id0.trim()
    const ks = Array.isArray(v?.keys) ? v.keys : []

    if (!id || !ks.length) {
      continue
    }

    for (var j = 0; j < ks.length; j++) {
      const k0 = ks[j] ?? ""
      const k = k0.trim().toLowerCase()

      if (!k) {
        continue
      }

      if (!t.includes(k)) {
        continue
      }

      if (!out.includes(id)) {
        out.push(id)
      }

      break
    }
  }

  return out
}

const vendorPages = (ids: string[]) => {
  const out: { url: string; title: string; vendor: string }[] = []

  if (!ids.length) {
    return out
  }

  for (var i = 0; i < vendors.length; i++) {
    const v = vendors[i]
    const id0 = typeof v?.id === "string" ? v.id : ""
    const id = id0.trim()

    if (!id || !ids.includes(id)) {
      continue
    }

    const ps = Array.isArray(v?.pages) ? v.pages : []

    for (var j = 0; j < ps.length; j++) {
      const it = ps[j]
      const u0 = typeof it?.url === "string" ? it.url : ""
      const t0 = typeof it?.title === "string" ? it.title : ""
      const url = clean(u0)
      const title = clean(t0)

      if (!url || !title) {
        continue
      }

      out.push({ url, title, vendor: id })
    }
  }

  return out
}

export const catalogSeeds = (q: string) => {
  const ids = vendorsForQuery(q)
  const seeds = vendorPages(ids)
  return { vendors: ids, seeds }
}

export const isOfficial = (u: string) => {
  return allow(u, vendorAllow)
}

export const isVendorOfficial = (u: string, ids: string[]) => {
  if (!ids.length) {
    return false
  }

  for (var i = 0; i < vendors.length; i++) {
    const v = vendors[i]
    const id0 = typeof v?.id === "string" ? v.id : ""
    const id = id0.trim()

    if (!id || !ids.includes(id)) {
      continue
    }

    const ds = Array.isArray(v?.domains) ? v.domains : []

    if (allow(u, ds)) {
      return true
    }
  }

  return false
}

export const braveWeb = async (q: string, min?: number, max?: number) => {
  const key = braveKey()
  const qq = clean(q)

  if (!key || !qq) {
    return [] as { url: string; title: string; date?: string; outlet?: string }[]
  }

  const url = new URL(braveUrl("web/search"))
  url.searchParams.set("q", qq)
  url.searchParams.set("count", "12")
  url.searchParams.set("search_lang", "en")
  url.searchParams.set("country", "us")
  const fresh = rangeTag(min, max)

  if (fresh) {
    url.searchParams.set("freshness", fresh)
  }

  const j = await fetchJson(url.toString(), { "X-Subscription-Token": key })
  const o = (j && typeof j === "object" ? j : null) as { web?: unknown } | null
  const w0 = (o?.web && typeof o.web === "object" ? o.web : null) as { results?: unknown } | null
  const list = Array.isArray(w0?.results) ? w0.results : []
  const out: { url: string; title: string; date?: string; outlet?: string }[] = []
  const seen = new Set<string>()

  for (var i = 0; i < list.length; i++) {
    const it = list[i]
    const t0 = (it && typeof it === "object" ? it : null) as {
      url?: unknown
      title?: unknown
      published?: unknown
      published_time?: unknown
      date?: unknown
      updated?: unknown
      age?: unknown
      source?: unknown
      site?: unknown
      profile?: unknown
    } | null
    const url0 = typeof t0?.url === "string" ? t0.url : ""
    const page = clean(url0)

    if (!page) {
      continue
    }

    if (seen.has(page)) {
      continue
    }

    seen.add(page)

    const title0 = typeof t0?.title === "string" ? t0.title : ""
    const title = clean(title0)
    const d0 = typeof t0?.published === "string" ? t0.published : ""
    const d1 = typeof t0?.published_time === "string" ? t0.published_time : ""
    const d2 = typeof t0?.date === "string" ? t0.date : ""
    const d3 = typeof t0?.updated === "string" ? t0.updated : ""
    const d4 = typeof t0?.age === "string" ? t0.age : ""
    const date = parseDate(d0 || d1 || d2 || d3 || d4)
    const p0 = (t0?.profile && typeof t0.profile === "object" ? t0.profile : null) as { name?: unknown } | null
    const name0 = typeof p0?.name === "string" ? p0.name : ""
    const src0 = typeof t0?.source === "string" ? t0.source : ""
    const site0 = typeof t0?.site === "string" ? t0.site : ""
    const outlet = clean(name0 || src0 || site0)

    out.push({ url: page, title, date, outlet })

    if (out.length >= 12) {
      break
    }
  }

  return out
}

export const braveNews = async (q: string, min?: number, max?: number) => {
  const key = braveKey()
  const qq = clean(q)

  if (!key || !qq) {
    return [] as { url: string; title: string; date?: string; outlet?: string }[]
  }

  const url = new URL(braveUrl("news/search"))
  url.searchParams.set("q", qq)
  url.searchParams.set("count", "12")
  url.searchParams.set("search_lang", "en")
  url.searchParams.set("country", "us")
  const fresh = rangeTag(min, max)

  if (fresh) {
    url.searchParams.set("freshness", fresh)
  }

  const j = await fetchJson(url.toString(), { "X-Subscription-Token": key })
  const o = (j && typeof j === "object" ? j : null) as { news?: unknown } | null
  const n0 = (o?.news && typeof o.news === "object" ? o.news : null) as { results?: unknown } | null
  const list = Array.isArray(n0?.results) ? n0.results : []
  const out: { url: string; title: string; date?: string; outlet?: string }[] = []
  const seen = new Set<string>()

  for (var i = 0; i < list.length; i++) {
    const it = list[i]
    const t0 = (it && typeof it === "object" ? it : null) as {
      url?: unknown
      title?: unknown
      published?: unknown
      published_time?: unknown
      date?: unknown
      updated?: unknown
      age?: unknown
      source?: unknown
      publisher?: unknown
    } | null
    const url0 = typeof t0?.url === "string" ? t0.url : ""
    const page = clean(url0)

    if (!page) {
      continue
    }

    if (seen.has(page)) {
      continue
    }

    seen.add(page)

    const title0 = typeof t0?.title === "string" ? t0.title : ""
    const title = clean(title0)
    const d0 = typeof t0?.published === "string" ? t0.published : ""
    const d1 = typeof t0?.published_time === "string" ? t0.published_time : ""
    const d2 = typeof t0?.date === "string" ? t0.date : ""
    const d3 = typeof t0?.updated === "string" ? t0.updated : ""
    const d4 = typeof t0?.age === "string" ? t0.age : ""
    const date = parseDate(d0 || d1 || d2 || d3 || d4)
    const s0 = (t0?.source && typeof t0.source === "object" ? t0.source : null) as { name?: unknown } | null
    const s1 = typeof s0?.name === "string" ? s0.name : ""
    const s2 = typeof t0?.source === "string" ? t0.source : ""
    const p0 = (t0?.publisher && typeof t0.publisher === "object" ? t0.publisher : null) as { name?: unknown } | null
    const p1 = typeof p0?.name === "string" ? p0.name : ""
    const p2 = typeof t0?.publisher === "string" ? t0.publisher : ""
    const outlet = clean(s1 || s2 || p1 || p2)

    out.push({ url: page, title, date, outlet })

    if (out.length >= 12) {
      break
    }
  }

  return out
}

export const wiki = async (q: string) => {
  const qp = encodeURIComponent(q)
  const url = `https://en.wikipedia.org/w/api.php?origin=*&action=query&list=search&format=json&srlimit=5&srsearch=${qp}`
  const j = await fetchJson(url)
  const o = (j && typeof j === "object" ? j : null) as { query?: unknown } | null
  const q0 = (o?.query && typeof o.query === "object" ? o.query : null) as { search?: unknown } | null
  const list = Array.isArray(q0?.search) ? q0?.search : []
  const out: { url: string; title: string }[] = []

  for (var i = 0; i < list.length; i++) {
    const it = list[i]
    const t0 = (it && typeof it === "object" ? it : null) as { title?: unknown } | null
    const title0 = typeof t0?.title === "string" ? t0.title : ""
    const title = clean(title0)

    if (!title) {
      continue
    }

    const slug = title.replace(/\s+/g, "_")
    const page = `https://en.wikipedia.org/wiki/${encodeURIComponent(slug)}`
    out.push({ url: page, title })

    if (out.length >= 5) {
      break
    }
  }

  return out
}

export const ddg = async (q: string) => {
  const qp = encodeURIComponent(q)
  const url = `https://api.duckduckgo.com/?q=${qp}&format=json&no_redirect=1&no_html=1`
  const js = await fetchJson(url)
  const o = (js && typeof js === "object" ? js : null) as {
    Results?: unknown
    RelatedTopics?: unknown
    AbstractURL?: unknown
    AbstractText?: unknown
    Heading?: unknown
  } | null
  const out: { url: string; title: string }[] = []
  const seen = new Set<string>()

  const add = (u: string, t: string) => {
    const url = clean(u)
    const title = clean(t)

    if (!url || !title) {
      return
    }

    if (seen.has(url)) {
      return
    }

    seen.add(url)
    out.push({ url, title })
  }

  const abs0 = typeof o?.AbstractURL === "string" ? o.AbstractURL : ""
  const abs1 = typeof o?.AbstractText === "string" ? o.AbstractText : ""
  if (abs0 && abs1) {
    add(abs0, abs1)
  }

  const r0 = Array.isArray(o?.Results) ? o?.Results : []
  for (var i = 0; i < r0.length; i++) {
    if (out.length >= 5) {
      break
    }

    const it = r0[i]
    const t0 = (it && typeof it === "object" ? it : null) as { FirstURL?: unknown; Text?: unknown } | null
    const u0 = typeof t0?.FirstURL === "string" ? t0.FirstURL : ""
    const x0 = typeof t0?.Text === "string" ? t0.Text : ""
    add(u0, x0)
  }

  const list0 = Array.isArray(o?.RelatedTopics) ? o?.RelatedTopics : []
  const list = list0.slice()

  for (var i = 0; i < list.length; i++) {
    if (out.length >= 5) {
      break
    }

    const it = list[i]
    const t0 = (it && typeof it === "object" ? it : null) as {
      Topics?: unknown
      FirstURL?: unknown
      Text?: unknown
    } | null
    const more = Array.isArray(t0?.Topics) ? t0?.Topics : []

    if (more.length) {
      for (var j = 0; j < more.length; j++) {
        list.push(more[j])
      }
    }

    const u0 = typeof t0?.FirstURL === "string" ? t0.FirstURL : ""
    const x0 = typeof t0?.Text === "string" ? t0.Text : ""
    add(u0, x0)
  }

  return out
}

export const mdn = async (q: string) => {
  const qp = encodeURIComponent(q)
  const url = `https://developer.mozilla.org/api/v1/search?q=${qp}&page=1&per_page=5`
  const j = await fetchJson(url)
  const o = (j && typeof j === "object" ? j : null) as { documents?: unknown } | null
  const list = Array.isArray(o?.documents) ? o?.documents : []
  const out: { url: string; title: string }[] = []

  for (var i = 0; i < list.length; i++) {
    const it = list[i]
    const t0 = (it && typeof it === "object" ? it : null) as { url?: unknown; title?: unknown; mdn_url?: unknown } | null
    const title0 = typeof t0?.title === "string" ? t0.title : ""
    const title = clean(title0)
    const raw0 = typeof t0?.url === "string" ? t0.url : typeof t0?.mdn_url === "string" ? t0.mdn_url : ""
    const raw = clean(raw0)
    var page = raw

    if (page && !page.startsWith("http")) {
      page = `https://developer.mozilla.org${page}`
    }

    if (!page || !title) {
      continue
    }

    out.push({ url: page, title })

    if (out.length >= 5) {
      break
    }
  }

  return out
}

export const stack = async (q: string) => {
  const qp = encodeURIComponent(q)
  const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&site=stackoverflow&pagesize=5&q=${qp}`
  const j = await fetchJson(url)
  const o = (j && typeof j === "object" ? j : null) as { items?: unknown } | null
  const list = Array.isArray(o?.items) ? o?.items : []
  const out: { url: string; title: string; date?: string }[] = []

  for (var i = 0; i < list.length; i++) {
    const it = list[i]
    const t0 = (it && typeof it === "object" ? it : null) as { link?: unknown; title?: unknown; creation_date?: unknown } | null
    const url0 = typeof t0?.link === "string" ? t0.link : ""
    const title0 = typeof t0?.title === "string" ? t0.title : ""
    const title = clean(title0)
    const page = clean(url0)
    const ts0 = typeof t0?.creation_date === "number" ? t0.creation_date : 0
    const date = ts0 ? new Date(ts0 * 1000).toISOString() : ""

    if (!page || !title) {
      continue
    }

    out.push({ url: page, title, date })

    if (out.length >= 5) {
      break
    }
  }

  return out
}

export const webSearch = async (q: string, fresh?: boolean, kind?: string, min?: number, max?: number) => {
  const qq = clean(q)

  if (!qq) {
    return [] as { url: string; title: string; date?: string; outlet?: string; source?: string }[]
  }
  const br = braveOn()

  const merge = async (tasks: { name: string; run: Promise<{ url: string; title: string; date?: string; outlet?: string }[]> }[]) => {
    const runs = tasks.map((t) => t.run)
    const lists = await Promise.all(runs)
    const out: { url: string; title: string; date?: string; outlet?: string; source?: string }[] = []
    const seen = new Set<string>()

    for (var i = 0; i < lists.length; i++) {
      const list = lists[i] ?? []
      const name = tasks[i]?.name ?? ""

      for (var j = 0; j < list.length; j++) {
        const it = list[j]
        const url = clean(it?.url ?? "")

        if (!url) {
          continue
        }

        if (seen.has(url)) {
          continue
        }

        seen.add(url)

        const title = clean(it?.title ?? "")
        const date = clean(it?.date ?? "")
        const outlet = clean(it?.outlet ?? "")
        out.push({ url, title, date, outlet, source: name })

        if (out.length >= 12) {
          break
        }
      }

      if (out.length >= 12) {
        break
      }
    }

    return out
  }

  if (kind === "docs") {
    const tasks = fresh
      ? [
          { name: "mdn", run: mdn(qq) },
          { name: "stack", run: stack(qq) },
        ]
      : [
          { name: "mdn", run: mdn(qq) },
          { name: "stack", run: stack(qq) },
          { name: "wikipedia", run: wiki(qq) },
        ]

    return merge(tasks)
  }

  if (kind === "model_catalog") {
    const tasks: { name: string; run: Promise<{ url: string; title: string; date?: string; outlet?: string }[]> }[] = []

    if (br) {
      tasks.push({ name: "brave", run: braveWeb(qq, min, max) })
    }

    tasks.push({ name: "ddg", run: ddg(qq) })
    return merge(tasks)
  }

  const tasks = [
    { name: "ddg", run: ddg(qq) },
    { name: "wikipedia", run: wiki(qq) },
    { name: "mdn", run: mdn(qq) },
    { name: "stack", run: stack(qq) },
  ]

  if (br) {
    tasks.unshift({ name: "brave", run: braveWeb(qq, min, max) })
  }

  return merge(tasks)
}

const stamp = (n: number, end?: boolean) => {
  if (!n) {
    return ""
  }

  const y = Math.floor(n / 10000)
  const m = Math.floor((n % 10000) / 100)
  const d = n % 100
  const mm = m < 10 ? `0${m}` : `${m}`
  const dd = d < 10 ? `0${d}` : `${d}`
  const t = end ? "235959" : "000000"
  return `${y}${mm}${dd}${t}`
}

export const gdelt = async (q: string, min?: number, max?: number) => {
  const qp = encodeURIComponent(q)
  const s0 = typeof min === "number" ? min : 0
  const e0 = typeof max === "number" ? max : 0
  const s1 = stamp(s0, false)
  const e1 = stamp(e0, true)
  const ok = s1 && e1 && s0 <= e0
  const range = ok ? `&startdatetime=${s1}&enddatetime=${e1}` : ""
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${qp}&mode=ArtList&maxrecords=12&format=json&sort=DateDesc${range}`
  const j = await fetchJson(url)
  const o = (j && typeof j === "object" ? j : null) as { articles?: unknown } | null
  const list = Array.isArray(o?.articles) ? o?.articles : []
  const out: { url: string; title: string; date?: string; outlet?: string }[] = []
  const seen = new Set<string>()

  for (var i = 0; i < list.length; i++) {
    const it = list[i]
    const t0 = (it && typeof it === "object" ? it : null) as {
      url?: unknown
      title?: unknown
      seendate?: unknown
      domain?: unknown
      sourcecountry?: unknown
    } | null
    const url0 = typeof t0?.url === "string" ? t0.url : ""
    const title0 = typeof t0?.title === "string" ? t0.title : ""
    const date0 = typeof t0?.seendate === "string" ? t0.seendate : ""
    const dom0 = typeof t0?.domain === "string" ? t0.domain : ""
    const src0 = typeof t0?.sourcecountry === "string" ? t0.sourcecountry : ""
    const page = clean(url0)

    if (!page) {
      continue
    }

    if (seen.has(page)) {
      continue
    }

    seen.add(page)

    out.push({
      url: page,
      title: clean(title0),
      date: fixDate(date0),
      outlet: clean(dom0 || src0),
    })

    if (out.length >= 12) {
      break
    }
  }

  return out
}
