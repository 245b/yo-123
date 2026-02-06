import { clean, clip } from "../utils/text"
import { host } from "./fetch"

export const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const meta = (html: string, key: string) => {
  const k = esc(key)
  const r0 = new RegExp(`<meta[^>]+(?:property|name|itemprop)=[\"']${k}[\"'][^>]*content=[\"']([^\"']+)[\"']`, "i")
  const m0 = html.match(r0)
  const v0 = m0?.[1] ?? ""

  if (v0) {
    return v0.trim()
  }

  const r1 = new RegExp(`<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+(?:property|name|itemprop)=[\"']${k}[\"']`, "i")
  const m1 = html.match(r1)
  const v1 = m1?.[1] ?? ""

  if (v1) {
    return v1.trim()
  }

  return ""
}

const parseJson = (raw: string) => {
  const txt = raw.trim()

  if (!txt) {
    return null
  }

  try {
    return JSON.parse(txt) as unknown
  } catch {
    return null
  }
}

const addDate = (list: string[], v: unknown) => {
  if (typeof v === "string") {
    list.push(v)
    return
  }

  if (Array.isArray(v)) {
    for (var i = 0; i < v.length; i++) {
      addDate(list, v[i])
    }
  }

  if (!v || typeof v !== "object") {
    return
  }

  const o = v as { "@value"?: unknown }
  const v0 = typeof o["@value"] === "string" ? o["@value"] : ""

  if (v0) {
    list.push(v0)
  }
}

const pullDates = (node: unknown, pub: string[], mod: string[]) => {
  if (!node || typeof node !== "object") {
    return
  }

  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) {
      pullDates(node[i], pub, mod)
    }
    return
  }

  const obj = node as Record<string, unknown>
  addDate(pub, obj.datePublished)
  addDate(mod, obj.dateModified)

  const graph = obj["@graph"]

  if (graph) {
    pullDates(graph, pub, mod)
  }

  const keys = Object.keys(obj)

  for (var i = 0; i < keys.length; i++) {
    const k = keys[i] ?? ""

    if (!k) {
      continue
    }

    if (k === "datePublished" || k === "dateModified" || k === "@graph") {
      continue
    }

    pullDates(obj[k], pub, mod)
  }
}

const jsonDates = (html: string) => {
  const pub: string[] = []
  const mod: string[] = []
  const re = /<script[^>]+type=["']application\/ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi
  var m = re.exec(html)

  while (m) {
    const raw = (m[1] ?? "").trim()
    const j = parseJson(raw)

    if (j) {
      pullDates(j, pub, mod)
    }

    m = re.exec(html)
  }

  const p0 = pub.find((v) => !!clean(v)) ?? ""
  const m0 = mod.find((v) => !!clean(v)) ?? ""
  return { pub: clean(p0), mod: clean(m0) }
}

export const decode = (v: string) => {
  var out = v
  out = out.replace(/&amp;/gi, "&")
  out = out.replace(/&lt;/gi, "<")
  out = out.replace(/&gt;/gi, ">")
  out = out.replace(/&quot;/gi, "\"")
  out = out.replace(/&#39;/gi, "'")
  out = out.replace(/&nbsp;/gi, " ")
  out = out.replace(/&#(\d{2,5});/g, (_m, d) => {
    const n = Number.parseInt(d, 10)

    if (!Number.isFinite(n)) {
      return ""
    }

    return String.fromCharCode(n)
  })
  out = out.replace(/&#x([0-9a-f]{2,5});/gi, (_m, h) => {
    const n = Number.parseInt(h, 16)

    if (!Number.isFinite(n)) {
      return ""
    }

    return String.fromCharCode(n)
  })
  return out
}

export const strip = (html: string) => {
  const a = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
  const b = a.replace(/<style[\s\S]*?<\/style>/gi, " ")
  const c = b.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
  const d = c.replace(/<!--[\s\S]*?-->/g, " ")
  const e = d.replace(/<\/?[^>]+>/g, " ")
  return clean(decode(e))
}

export const fixDate = (v: string) => {
  const t = clean(v)

  if (!t) {
    return ""
  }

  if (/^\d{8}T\d{6}Z$/.test(t)) {
    const y = t.slice(0, 4)
    const m = t.slice(4, 6)
    const d = t.slice(6, 8)
    const h = t.slice(9, 11)
    const n = t.slice(11, 13)
    const s = t.slice(13, 15)
    return `${y}-${m}-${d}T${h}:${n}:${s}Z`
  }

  return t
}

export const pickSentences = (text: string, q: string, min: number, max: number) => {
  const txt = clean(text)

  if (!txt) {
    return [] as string[]
  }

  const q0 = clean(q).toLowerCase()
  const ws = q0 ? q0.split(/\W+/g) : []
  const keys: string[] = []

  for (var i = 0; i < ws.length; i++) {
    const w0 = ws[i] ?? ""
    const w = w0.trim()

    if (w.length < 4) {
      continue
    }

    keys.push(w)
  }

  const base = txt.replace(/([.!?])\s+/g, "$1\n")
  const parts = base.split("\n")
  const list: { s: string; score: number; idx: number }[] = []

  for (var i = 0; i < parts.length; i++) {
    const s0 = parts[i] ?? ""
    const s = s0.trim()

    if (s.length < 40) {
      continue
    }

    var score = 0

    if (keys.length) {
      const low = s.toLowerCase()

      for (var j = 0; j < keys.length; j++) {
        const k = keys[j] ?? ""

        if (!k) {
          continue
        }

        if (low.includes(k)) {
          score++
        }
      }
    }

    list.push({ s, score, idx: i })
  }

  list.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }

    return a.idx - b.idx
  })

  const top: { s: string; idx: number }[] = []

  for (var i = 0; i < list.length; i++) {
    if (top.length >= max) {
      break
    }

    top.push({ s: list[i].s, idx: list[i].idx })
  }

  top.sort((a, b) => a.idx - b.idx)

  const res: string[] = []

  for (var i = 0; i < top.length; i++) {
    res.push(clip(top[i].s, 320))
  }

  if (res.length >= min) {
    return res
  }

  for (var i = 0; i < parts.length; i++) {
    if (res.length >= min) {
      break
    }

    const s0 = parts[i] ?? ""
    const s = s0.trim()

    if (s.length < 40) {
      continue
    }

    var dup = false

    for (var j = 0; j < res.length; j++) {
      if (res[j] === s) {
        dup = true
        break
      }
    }

    if (dup) {
      continue
    }

    res.push(clip(s, 320))
  }

  return res
}

export const extract = (
  html: string,
  q: string,
  info?: { url?: string; title?: string; date?: string; outlet?: string },
  opt?: { modified?: string; allowModified?: boolean; debug?: boolean },
) => {
  const h0 = typeof html === "string" ? html : ""
  const url = clean(info?.url ?? "")
  const mod0 = clean(opt?.modified ?? "")
  const allowMod = opt?.allowModified === true
  const dbg = opt?.debug === true
  var title = ""

  const t0 = meta(h0, "og:title")

  if (t0) {
    title = clean(t0)
  }

  const t1 = meta(h0, "twitter:title")

  if (!title && t1) {
    title = clean(t1)
  }

  if (!title) {
    const m0 = h0.match(/<title[^>]*>([^<]+)<\/title>/i)
    const t2 = m0?.[1] ?? ""
    title = clean(t2)
  }

  if (!title) {
    const t3 = clean(info?.title ?? "")
    title = t3
  }

  var date = ""
  var src = ""
  const js = jsonDates(h0)

  if (js.pub) {
    date = clean(js.pub)
    src = "jsonld:published"
  }

  if (!date && js.mod) {
    date = clean(js.mod)
    src = "jsonld:modified"
  }

  const d0 = meta(h0, "article:published_time")

  if (!date && d0) {
    date = clean(d0)
    src = "meta:article:published_time"
  }

  const d1 = meta(h0, "og:published_time")

  if (!date && d1) {
    date = clean(d1)
    src = "meta:og:published_time"
  }

  const d2 = meta(h0, "pubdate")

  if (!date && d2) {
    date = clean(d2)
    src = "meta:pubdate"
  }

  const d3 = meta(h0, "publishdate")

  if (!date && d3) {
    date = clean(d3)
    src = "meta:publishdate"
  }

  const d4 = meta(h0, "timestamp")

  if (!date && d4) {
    date = clean(d4)
    src = "meta:timestamp"
  }

  const d5 = meta(h0, "dc.date.issued")

  if (!date && d5) {
    date = clean(d5)
    src = "meta:dc.date.issued"
  }

  const d6 = meta(h0, "dc.date")

  if (!date && d6) {
    date = clean(d6)
    src = "meta:dc.date"
  }

  const d7 = meta(h0, "datePublished")

  if (!date && d7) {
    date = clean(d7)
    src = "meta:datePublished"
  }

  const d8 = meta(h0, "date")

  if (!date && d8) {
    date = clean(d8)
    src = "meta:date"
  }

  const d9 = meta(h0, "dateModified")

  if (!date && d9) {
    date = clean(d9)
    src = "meta:dateModified"
  }

  const d10 = meta(h0, "article:modified_time")

  if (!date && d10) {
    date = clean(d10)
    src = "meta:article:modified_time"
  }

  const d11 = meta(h0, "og:updated_time")

  if (!date && d11) {
    date = clean(d11)
    src = "meta:og:updated_time"
  }

  if (!date) {
    const m1 = h0.match(/<time[^>]+datetime=[\"']([^\"']+)[\"']/i)
    const d12 = m1?.[1] ?? ""
    date = clean(d12)
    if (date) {
      src = "time:datetime"
    }
  }

  if (!date) {
    const d13 = clean(info?.date ?? "")
    date = d13
    if (date) {
      src = "list:date"
    }
  }

  if (!date && allowMod && mod0) {
    date = mod0
    src = "header:last-modified"
  }

  date = fixDate(date)

  var outlet = ""
  const o0 = meta(h0, "og:site_name")

  if (o0) {
    outlet = clean(o0)
  }

  const o1 = meta(h0, "application-name")

  if (!outlet && o1) {
    outlet = clean(o1)
  }

  if (!outlet) {
    const o2 = clean(info?.outlet ?? "")
    outlet = o2
  }

  if (!outlet && url) {
    const h = host(url)
    outlet = h
  }

  const text = strip(h0)
  const sentences = pickSentences(text, q, 2, 5)

  if (dbg) {
    const tag = date ? date : "none"
    const srcTag = src ? src : "none"
    console.log(`[extract] ${url || "unknown"} date=${tag} src=${srcTag}`)
  }

  return { title, url, date, outlet, sentences }
}
