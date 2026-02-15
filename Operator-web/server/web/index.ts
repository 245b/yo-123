import { clean } from "../utils/text"
import { extract } from "./extract"
import { allow, fetchDoc, host, renderDoc } from "./fetch"
import { braveNews, braveOn, catalogSeeds, gdelt, isOfficial, isVendorOfficial, webAllow, webBlock, webSearch } from "./sources"
import { fresh, kind } from "./query"
import { dateNumFromUtc, now, pickPlace, timeCtx, type NowCtx } from "./time"

type WebItem = {
  title: string
  url: string
  date?: string
  outlet?: string
  sentences: string[]
  retrieved?: string
  dateMissing?: boolean
  official?: boolean
  source?: string
}

type TraceCounts = {
  discovered_total: number
  allowlisted_total: number
  fetched_ok: number
  extracted_text_ok: number
  has_publish_date: number
  passes_recency_window: number
  final_used: number
}

type Trace = {
  intent_kind: string
  providers_called: string[]
  candidate_counts: TraceCounts
  top_reject_reasons: Record<string, number>
}

const lim = 60000
const max = 4
const dbg = (process.env.DEBUG_WEB ?? "").trim() === "1"

const traceMake = (k: string): Trace => ({
  intent_kind: k || "other",
  providers_called: [],
  candidate_counts: {
    discovered_total: 0,
    allowlisted_total: 0,
    fetched_ok: 0,
    extracted_text_ok: 0,
    has_publish_date: 0,
    passes_recency_window: 0,
    final_used: 0,
  },
  top_reject_reasons: {},
})

const traceHit = (tr: Trace | null, key: string) => {
  if (!tr) {
    return
  }

  if (!key) {
    return
  }

  const cur = tr.top_reject_reasons[key] ?? 0
  tr.top_reject_reasons[key] = cur + 1
}

const traceInc = (tr: Trace | null, key: keyof TraceCounts) => {
  if (!tr) {
    return
  }

  const cur = tr.candidate_counts[key] ?? 0
  tr.candidate_counts[key] = cur + 1
}

const traceSet = (tr: Trace | null, key: keyof TraceCounts, val: number) => {
  if (!tr) {
    return
  }

  const v0 = Number.isFinite(val) ? Math.max(0, Math.floor(val)) : 0
  tr.candidate_counts[key] = v0
}

const traceProv = (tr: Trace | null, name: string) => {
  if (!tr) {
    return
  }

  const n0 = typeof name === "string" ? name : ""
  const n = n0.trim()

  if (!n) {
    return
  }

  tr.providers_called.push(n)
}

const traceLog = (tr: Trace | null) => {
  if (!dbg) {
    return
  }

  if (!tr) {
    return
  }

  console.log(`[web] trace ${JSON.stringify(tr)}`)
}

const skip = (u: string) => {
  const url = clean(u)

  if (!url) {
    return true
  }

  if (webBlock.length && allow(url, webBlock)) {
    return true
  }

  if (webAllow.length && !allow(url, webAllow)) {
    return true
  }

  return false
}

const allowCount = (list: WebItem[]) => {
  var n = 0

  for (var i = 0; i < list.length; i++) {
    const it = list[i]
    const url = clean(it?.url ?? "")

    if (!url) {
      continue
    }

    if (skip(url)) {
      continue
    }

    n++
  }

  return n
}

const pick = (list: WebItem[], max: number, tr: Trace | null) => {
  const out: number[] = []
  const seen = new Set<string>()
  const hosts = new Set<string>()

  for (var i = 0; i < list.length; i++) {
    if (out.length >= max) {
      break
    }

    const it = list[i]
    const url = clean(it?.url ?? "")

    if (!url) {
      continue
    }

    if (seen.has(url)) {
      traceHit(tr, "duplicate_url")
      continue
    }

    if (skip(url)) {
      traceHit(tr, "blocked_domain")
      continue
    }

    const h = host(url)

    if (h && hosts.has(h)) {
      traceHit(tr, "duplicate_host")
      continue
    }

    out.push(i)
    seen.add(url)

    if (h) {
      hosts.add(h)
    }
  }

  if (out.length >= max) {
    return out
  }

  for (var i = 0; i < list.length; i++) {
    if (out.length >= max) {
      break
    }

    const it = list[i]
    const url = clean(it?.url ?? "")

    if (!url) {
      continue
    }

    if (seen.has(url)) {
      traceHit(tr, "duplicate_url")
      continue
    }

    if (skip(url)) {
      traceHit(tr, "blocked_domain")
      continue
    }

    out.push(i)
    seen.add(url)
  }

  return out
}

const enrich = async (
  list: WebItem[],
  q: string,
  max: number,
  opt?: { allowModified?: boolean; render?: boolean; renderMissing?: boolean; trace?: Trace | null },
) => {
  if (!list.length) {
    return list
  }

  const tr = opt?.trace ?? null
  const picks = pick(list, max, tr)

  if (!picks.length) {
    return list
  }

  const allowMod = opt?.allowModified === true
  const render = opt?.render === true
  const renderMissing = opt?.renderMissing === true
  const allowList = webAllow.length ? webAllow : undefined

  const jobs = picks.map(async (idx) => {
    const it = list[idx]
    const url = clean(it?.url ?? "")

    if (!url) {
      traceHit(tr, "missing_url")
      return null
    }

    const doc = await fetchDoc(url, lim, allowList)
    var html = doc.html
    var mod = doc.modified
    var usedRender = false

    if (!html) {
      traceHit(tr, "fetch_failed")
    }

    if (!html && render) {
      const rd = await renderDoc(url, lim, allowList)
      const rh = rd.html

      if (!rh) {
        traceHit(tr, "render_failed")
      }

      if (rh) {
        html = rh
        mod = rd.modified
        usedRender = true
      }
    }

    if (!html) {
      return null
    }

    traceInc(tr, "fetched_ok")
    var item = extract(html, q, it, { modified: mod, allowModified: allowMod, debug: dbg })
    var hasDate = clean(item?.date ?? "") !== ""
    var hasText = item?.sentences?.length > 0

    if (!hasText) {
      traceHit(tr, "extract_empty")
    }

    if (renderMissing && render && !usedRender && (!hasDate || !hasText)) {
      const rd = await renderDoc(url, lim, allowList)
      const rh = rd.html

      if (!rh) {
        traceHit(tr, "render_failed")
      }

      if (rh) {
        const next = extract(rh, q, it, { modified: rd.modified, allowModified: allowMod, debug: dbg })
        const nxDate = clean(next?.date ?? "") !== ""
        const nxText = next?.sentences?.length > 0

        if (nxDate || nxText) {
          item = next
          hasDate = nxDate
          hasText = nxText
        }
      }
    }

    if (hasText) {
      traceInc(tr, "extracted_text_ok")
    }

    if (hasDate) {
      traceInc(tr, "has_publish_date")
    }

    return { idx, item }
  })

  const done = await Promise.all(jobs)

  for (var i = 0; i < done.length; i++) {
    const row = done[i]
    const idx = row?.idx
    const item = row?.item

    if (typeof idx !== "number") {
      continue
    }

    if (!item) {
      continue
    }

    list[idx] = item
  }

  return list
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

const logRes = (kind: string, url: string, date: string, ok: boolean, why: string) => {
  if (!dbg) {
    return
  }

  const h = host(url)
  const tag = date ? date : "none"
  const pick = why ? why : "ok"
  console.log(`[web] ${kind} ${ok ? "accept" : "reject"} ${pick} host=${h || "unknown"} url=${url} date=${tag}`)
}

const filterRes = (
  list: WebItem[],
  min: number,
  max: number,
  strict: boolean,
  kind: string,
  opt?: { allowMissing?: (it: WebItem) => boolean; now?: NowCtx; trace?: Trace | null },
) => {
  const out: WebItem[] = []
  const tr = opt?.trace ?? null
  const allowMissing = opt?.allowMissing
  const now = opt?.now ?? null

  for (var i = 0; i < list.length; i++) {
    const it = list[i]
    const url = clean(it?.url ?? "")
    const date = clean(it?.date ?? "")

    if (!url) {
      continue
    }

    if (skip(url)) {
      traceHit(tr, "blocked_domain")
      logRes(kind, url, date, false, "blocked")
      continue
    }

    const d = dateNum(date)
    const allow = typeof allowMissing === "function" ? allowMissing(it) : false

    if (!d) {
      if (strict) {
        if (!allow) {
          traceHit(tr, "no_date")
          logRes(kind, url, date, false, "missing-date")
          continue
        }
      }
    }

    if (d && !dateOk(d, min, max)) {
      traceHit(tr, "date_out_of_window")
      logRes(kind, url, date, false, "out-of-range")
      continue
    }

    if (!d && allow) {
      it.dateMissing = true
      it.retrieved = now?.iso ?? ""
    }

    logRes(kind, url, date, true, "")
    out.push(it)
  }

  return out
}


export { kind, now, pickPlace }
export type { NowCtx }

export const web = async (q: string, type?: string, minDate?: number, now0?: NowCtx) => {
  const k = type ?? kind(q)
  const query = clean(q)
  var min = typeof minDate === "number" ? minDate : 0
  const floor = 20250101

  if (!min || min < floor) {
    min = floor
  }
  const cap = 20261231
  const n0 = typeof now0?.num === "number" ? now0.num : 0
  const n1 = n0 ? n0 : dateNumFromUtc(new Date())
  var maxd = n1

  if (cap && maxd > cap) {
    maxd = cap
  }

  if (!k) {
    return null
  }

  const tr = dbg ? traceMake(k) : null
  const br = braveOn()

  const hot = fresh(query, k)
  const reject = k !== "time" && k !== "docs"

  if (k === "time") {
    const ctx = await timeCtx(query)
    if (tr) {
      traceProv(tr, "worldtimeapi")
      traceSet(tr, "final_used", ctx.ok ? 1 : 0)
    }
    traceLog(tr)
    return { type: "time", query, ...ctx, minDate: min, maxDate: maxd, rejectMissingDate: false }
  }

  if (k === "news") {
    if (br) {
      traceProv(tr, "brave-news")
    }

    traceProv(tr, "gdelt")

    const list = br ? await braveNews(q, min, maxd) : []
    const list2 = await gdelt(q, min, maxd)
    const res: WebItem[] = []
    const seen = new Set<string>()

    const add = (it: { url?: string; title?: string; date?: string; outlet?: string }, src: string) => {
      const url = clean(it?.url ?? "")

      if (!url) {
        return
      }

      if (seen.has(url)) {
        return
      }

      seen.add(url)
      res.push({
        title: clean(it.title ?? ""),
        url,
        date: clean(it.date ?? ""),
        outlet: clean(it.outlet ?? ""),
        sentences: [] as string[],
        source: src,
      })
    }

    for (var i = 0; i < list.length; i++) {
      add(list[i], "brave-news")
    }

    for (var i = 0; i < list2.length; i++) {
      add(list2[i], "gdelt")
    }

    traceSet(tr, "discovered_total", res.length)
    traceSet(tr, "allowlisted_total", allowCount(res))
    await enrich(res, query, max, { allowModified: false, render: true, renderMissing: true, trace: tr })
    const out = filterRes(res, min, maxd, true, "news", { trace: tr })
    traceSet(tr, "passes_recency_window", out.length)
    traceSet(tr, "final_used", out.length)
    traceLog(tr)
    return {
      type: "news",
      query,
      results: out,
      source: br ? "brave+gdelt" : "gdelt",
      minDate: min,
      maxDate: maxd,
      rejectMissingDate: true,
    }
  }

  if (k === "model_catalog") {
    const seed = catalogSeeds(query)
    const vendors = seed.vendors
    const seeds = seed.seeds
    const extra = await webSearch(q, false, "model_catalog", min, maxd)
    traceProv(tr, "official")
    if (br) {
      traceProv(tr, "brave")
    }
    traceProv(tr, "ddg")
    const res: WebItem[] = []

    for (var i = 0; i < seeds.length; i++) {
      const it = seeds[i]
      const url = clean(it?.url ?? "")
      const title = clean(it?.title ?? "")
      const outlet = clean(it?.vendor ?? "")

      if (!url || !title) {
        continue
      }

      res.push({ title, url, outlet, sentences: [] as string[], source: "official" })
    }

    for (var i = 0; i < extra.length; i++) {
      const it = extra[i]
      res.push({
        title: clean(it.title ?? ""),
        url: clean(it.url ?? ""),
        date: clean(it.date ?? ""),
        outlet: clean(it.outlet ?? ""),
        sentences: [] as string[],
        source: clean(it.source ?? "") || "search",
      })
    }

    traceSet(tr, "discovered_total", res.length)
    traceSet(tr, "allowlisted_total", allowCount(res))
    await enrich(res, query, max, { allowModified: true, render: true, renderMissing: true, trace: tr })
    const allowMissing = (it: WebItem) => {
      const url = clean(it?.url ?? "")

      if (!url) {
        return false
      }

      if (vendors.length) {
        return isVendorOfficial(url, vendors)
      }

      return isOfficial(url)
    }
    const out = filterRes(res, min, maxd, true, "model_catalog", { allowMissing, now: now0, trace: tr })
    const hosts = new Set<string>()

    for (var i = 0; i < out.length; i++) {
      const it = out[i]
      const url = clean(it?.url ?? "")

      if (url) {
        it.official = isOfficial(url)
      }

      const h = host(url)

      if (h) {
        hosts.add(h)
      }
    }

    const uniq = hosts.size
    traceSet(tr, "passes_recency_window", out.length)
    traceSet(tr, "final_used", out.length)
    traceLog(tr)
    return {
      type: "model_catalog",
      query,
      results: out,
      source: "catalog",
      vendors,
      corroboration: { required: 2, unique_hosts: uniq, ok: uniq >= 2 },
      minDate: min,
      maxDate: maxd,
      rejectMissingDate: false,
      allowMissingOfficial: true,
    }
  }

  if (k === "docs") {
    traceProv(tr, "mdn")
    traceProv(tr, "stack")
    traceProv(tr, "wikipedia")
    const list = await webSearch(q, false, "docs")
    const res: WebItem[] = list.map((it) => ({
      title: clean(it.title ?? ""),
      url: clean(it.url ?? ""),
      date: clean(it.date ?? ""),
      outlet: clean(it.outlet ?? ""),
      sentences: [] as string[],
      source: clean(it.source ?? "") || "search",
    }))
    traceSet(tr, "discovered_total", res.length)
    traceSet(tr, "allowlisted_total", allowCount(res))
    await enrich(res, query, max, { allowModified: true, render: true, renderMissing: true, trace: tr })
    const out = filterRes(res, min, maxd, false, "docs", { trace: tr })
    traceSet(tr, "passes_recency_window", out.length)
    traceSet(tr, "final_used", out.length)
    traceLog(tr)
    return {
      type: "docs",
      query,
      results: out,
      source: "search",
      minDate: min,
      maxDate: maxd,
      rejectMissingDate: false,
    }
  }

  const allowMod = k !== "news" && !hot
  if (br) {
    traceProv(tr, "brave")
  }
  traceProv(tr, "wikipedia")
  traceProv(tr, "ddg")
  traceProv(tr, "mdn")
  traceProv(tr, "stack")
  const list = await webSearch(q, hot, "web", min, maxd)
  const res: WebItem[] = list.map((it) => ({
    title: clean(it.title ?? ""),
    url: clean(it.url ?? ""),
    date: clean(it.date ?? ""),
    outlet: clean(it.outlet ?? ""),
    sentences: [] as string[],
    source: clean(it.source ?? "") || "search",
  }))
  traceSet(tr, "discovered_total", res.length)
  traceSet(tr, "allowlisted_total", allowCount(res))
  await enrich(res, query, max, { allowModified: allowMod, render: true, renderMissing: true, trace: tr })
  const out = filterRes(res, min, maxd, reject, "web", { trace: tr })
  traceSet(tr, "passes_recency_window", out.length)
  traceSet(tr, "final_used", out.length)
  traceLog(tr)
  return {
    type: "web",
    query,
    results: out,
    source: "search",
    minDate: min,
    maxDate: maxd,
    rejectMissingDate: reject,
  }
}
