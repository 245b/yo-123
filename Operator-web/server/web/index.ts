import { clean } from "../utils/text"
import { extract } from "./extract"
import { allow, fetchDoc, fetchJson, host, renderDoc } from "./fetch"
import { braveNews, braveOn, catalogSeeds, gdelt, isOfficial, isVendorOfficial, vendorsForQuery, webAllow, webBlock, webSearch } from "./sources"

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
const zoneMain = "Asia/Qatar"
const intl = Intl as { supportedValuesOf?: (key: string) => string[] }
const tzList = typeof intl.supportedValuesOf === "function" ? intl.supportedValuesOf("timeZone") : []

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

const isTime = (t: string) => {
  if (!t) {
    return false
  }

  if (t.includes("time zone") || t.includes("timezone")) {
    return true
  }

  if (t.includes("current time") || t.includes("local time")) {
    return true
  }

  if (t.includes("what time") || t.includes("time is it")) {
    return true
  }

  if (t.includes("time in ") || t.includes("time at ") || t.includes("time for ")) {
    return true
  }

  if (t.startsWith("time in ") || t.startsWith("time at ") || t.startsWith("time for ")) {
    return true
  }

  if (t.includes("release date") || t.includes("publication date") || t.includes("publish date")) {
    return false
  }

  if (t.includes("due date") || t.includes("expiry date") || t.includes("expiration date") || t.includes("birth date")) {
    return false
  }

  if (t.includes("today") && t.includes("date")) {
    return true
  }

  if (t.includes("current date") || t.includes("date today")) {
    return true
  }

  if (t.includes("what's the date") || t.includes("whats the date") || t.includes("what is the date")) {
    return true
  }

  if (t.includes("what date is it") || t.includes("what day is it")) {
    return true
  }

  if (t === "date" || t === "the date") {
    return true
  }

  if (t.startsWith("date in ") || t.startsWith("date at ") || t.startsWith("date for ")) {
    return true
  }

  if (t.includes("date in ") || t.includes("date at ") || t.includes("date for ")) {
    return true
  }

  return false
}

const fresh = (q: string, k: string) => {
  if (k === "news") {
    return true
  }

  const t = clean(q).toLowerCase()

  if (!t) {
    return false
  }

  const keys = [
    "latest",
    "current",
    "today",
    "this week",
    "this month",
    "this year",
    "breaking",
    "recent",
    "announced",
    "announcement",
    "released",
    "release",
    "price",
    "pricing",
    "version",
    "updated",
    "update",
    "as of",
    "now",
    "right now",
  ]

  for (var i = 0; i < keys.length; i++) {
    const k0 = keys[i] ?? ""
    const w = k0.trim()

    if (!w) {
      continue
    }

    if (t.includes(w)) {
      return true
    }
  }

  return false
}

export const pickPlace = (q: string) => {
  const raw = clean(q)

  if (!raw) {
    return ""
  }

  const low = raw.toLowerCase()
  var place = ""

  const m0 = low.match(/\b(?:time|date)\b.*\b(?:in|at|for)\b\s+(.+)$/i)

  if (m0 && m0[1]) {
    place = m0[1].trim()
  }

  if (!place) {
    const m1 = low.match(/\b(?:in|at|for)\b\s+(.+)$/i)

    if (m1 && m1[1] && (low.includes("time") || low.includes("date"))) {
      place = m1[1].trim()
    }
  }

  if (!place) {
    var t = low.replace(/[?.,!]/g, " ")
    t = t.replace(
      /\b(what's|whats|what|is|the|current|local|time|date|timezone|zone|now|today|todays|today's|please|tell|me|in|at|for)\b/g,
      " ",
    )
    place = clean(t)
  }

  if (place) {
    place = place.replace(/[?.,!]/g, " ")
    place = place.replace(/\b(right now|now|today|todays|today's|please)\b/g, " ")
    place = clean(place)
  }

  if (place) {
    const low = place.toLowerCase()
    const drop = ["it", "here", "there", "now", "today", "tonight", "tomorrow"]

    if (drop.includes(low)) {
      return ""
    }
  }

  return place
}

const defaultZone = () => {
  if (!tzList.length) {
    return "Etc/UTC"
  }

  if (tzList.includes(zoneMain)) {
    return zoneMain
  }

  if (tzList.includes("Etc/UTC")) {
    return "Etc/UTC"
  }

  if (tzList.includes("UTC")) {
    return "UTC"
  }

  if (tzList.includes("Etc/GMT")) {
    return "Etc/GMT"
  }

  return tzList[0] ?? ""
}

const safeZone = (z: string) => {
  const raw = clean(z)

  if (!raw) {
    return defaultZone()
  }

  if (!tzList.length) {
    return raw
  }

  if (tzList.length && tzList.includes(raw)) {
    return raw
  }

  const pick = findZone(raw)

  if (pick) {
    return pick
  }

  const def = defaultZone()

  if (def) {
    return def
  }

  return raw
}

const aliasZone = (p: string) => {
  const low = clean(p).toLowerCase()

  if (low === "qatar" || low === "doha") {
    return "Asia/Qatar"
  }

  return ""
}

const findZone = (p: string) => {
  const low = clean(p).toLowerCase()

  if (!low) {
    return ""
  }

  const alias = aliasZone(low)

  if (alias) {
    return alias
  }

  if (!tzList.length) {
    return ""
  }

  for (var i = 0; i < tzList.length; i++) {
    const tz = tzList[i] ?? ""

    if (tz.toLowerCase() === low) {
      return tz
    }
  }

  const needle = low.replace(/\s+/g, "_")
  const parts = low.split(/\s+/g).filter((it) => it.length >= 3)
  var best = ""

  for (var i = 0; i < tzList.length; i++) {
    const tz = tzList[i] ?? ""
    const z = tz.toLowerCase()

    if (needle && (z.endsWith(`/${needle}`) || z.includes(`/${needle}`))) {
      if (!best || tz.length < best.length) {
        best = tz
      }
      continue
    }

    const zs = z.replace(/_/g, " ")

    if (zs.includes(low)) {
      if (!best || tz.length < best.length) {
        best = tz
      }
      continue
    }

    if (parts.length > 1) {
      var ok = true

      for (var j = 0; j < parts.length; j++) {
        const part = parts[j] ?? ""

        if (!part) {
          continue
        }

        if (!zs.includes(part)) {
          ok = false
          break
        }
      }

      if (ok && (!best || tz.length < best.length)) {
        best = tz
      }
    }
  }

  return best
}

const geoZone = async (p: string) => {
  const qp = encodeURIComponent(p)
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${qp}&count=1&language=en&format=json`
  const j = await fetchJson(url)
  const o = (j && typeof j === "object" ? j : null) as { results?: unknown } | null
  const list = Array.isArray(o?.results) ? o?.results : []
  const it = list[0]
  const r0 = (it && typeof it === "object" ? it : null) as { timezone?: unknown; name?: unknown } | null
  const tz0 = typeof r0?.timezone === "string" ? r0.timezone : ""
  const tz = clean(tz0)
  const name0 = typeof r0?.name === "string" ? r0.name : ""
  const name = clean(name0)
  return { zone: tz, name, url }
}

const pad = (n: number) => {
  if (n < 10) {
    return `0${n}`
  }

  return `${n}`
}

const parts = (when: Date, zone: string) => {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  const list = fmt.formatToParts(when)
  var y = -1
  var m = -1
  var d = -1
  var h = -1
  var n = -1
  var s = -1

  for (var i = 0; i < list.length; i++) {
    const it = list[i]
    const t0 = it?.type ?? ""
    const v0 = it?.value ?? ""
    const t = typeof t0 === "string" ? t0 : ""
    const v = typeof v0 === "string" ? v0 : ""

    if (!t || !v) {
      continue
    }

    const num = Number.parseInt(v, 10)

    if (!Number.isFinite(num)) {
      continue
    }

    if (t === "year") {
      y = num
    }

    if (t === "month") {
      m = num
    }

    if (t === "day") {
      d = num
    }

    if (t === "hour") {
      h = num
    }

    if (t === "minute") {
      n = num
    }

    if (t === "second") {
      s = num
    }
  }

  const ok = y >= 0 && m >= 0 && d >= 0 && h >= 0 && n >= 0 && s >= 0

  if (!ok) {
    y = when.getUTCFullYear()
    m = when.getUTCMonth() + 1
    d = when.getUTCDate()
    h = when.getUTCHours()
    n = when.getUTCMinutes()
    s = when.getUTCSeconds()
  }

  return { y, m, d, h, n, s }
}

const offset = (when: Date, p: { y: number; m: number; d: number; h: number; n: number; s: number }) => {
  const utc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.n, p.s)
  const diff = Math.round((utc - when.getTime()) / 60000)
  const sign = diff >= 0 ? "+" : "-"
  const abs = Math.abs(diff)
  const hh = Math.floor(abs / 60)
  const mm = abs % 60
  return `${sign}${pad(hh)}:${pad(mm)}`
}

const pack = (when: Date, zone: string) => {
  const p = parts(when, zone)
  const off = offset(when, p)
  const dateIso = `${p.y}-${pad(p.m)}-${pad(p.d)}`
  const timeIso = `${pad(p.h)}:${pad(p.n)}:${pad(p.s)}`
  const iso = `${dateIso}T${timeIso}${off}`
  const num = p.y * 10000 + p.m * 100 + p.d
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(when)
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(when)
  return { time, date, iso, dateIso, offset: off, num }
}

const numFrom = (when: Date) => {
  const y = when.getUTCFullYear()
  const m = when.getUTCMonth() + 1
  const d = when.getUTCDate()
  return y * 10000 + m * 100 + d
}

type TimeApiOk = {
  ok: true
  time: string
  date: string
  iso: string
  dateIso: string
  offset: string
  num: number
  url: string
}

type TimeApiErr = { ok: false; error: string; url?: string }

type TimeApiRes = TimeApiOk | TimeApiErr

const timeApi = async (zone: string): Promise<TimeApiRes> => {
  const url = `https://worldtimeapi.org/api/timezone/${encodeURIComponent(zone)}`
  const j = await fetchJson(url)
  const o = (j && typeof j === "object" ? j : null) as { datetime?: unknown } | null
  const dt0 = typeof o?.datetime === "string" ? o.datetime : ""
  const dt = clean(dt0)

  if (!dt) {
    return { ok: false, error: "Time API unavailable", url }
  }

  const when = new Date(dt)

  if (!Number.isFinite(when.getTime())) {
    return { ok: false, error: "Bad time API response", url }
  }

  const info = pack(when, zone)

  return { ok: true, ...info, url }
}

const timeCtx = async (q: string) => {
  const place0 = pickPlace(q)
  const place = clean(place0)

  if (!place) {
    const zone0 = safeZone(zoneMain)

    if (!zone0) {
      return { ok: false, error: "Location timezone not found." }
    }

    const api0 = await timeApi(zone0).catch((): TimeApiRes => ({ ok: false, error: "Time API unavailable", url: "" }))

    if (!api0.ok) {
      const when = new Date()
      const info = pack(when, zone0)
      return {
        ok: true,
        place: zone0,
        zone: zone0,
        time: info.time,
        date: info.date,
        iso: info.iso,
        dateIso: info.dateIso,
        offset: info.offset,
        num: info.num,
        source: "server",
        sources: [],
      }
    }

    const sources0: { url: string }[] = []

    if (api0.url) {
      sources0.push({ url: api0.url })
    }

    return {
      ok: true,
      place: zone0,
      zone: zone0,
      time: api0.time,
      date: api0.date,
      iso: api0.iso,
      dateIso: api0.dateIso,
      offset: api0.offset,
      num: api0.num,
      source: "default",
      sources: sources0,
    }
  }

  var zone = findZone(place)
  var source = "local"
  var label = place
  var geoUrl = ""

  if (!zone) {
    const geo = await geoZone(place)
    zone = clean(geo.zone)

    if (zone) {
      source = "geocode"
    }

    if (geo.name) {
      label = geo.name
    }

    if (geo.url) {
      geoUrl = geo.url
    }
  }

  if (!zone) {
    return { ok: false, error: "Location timezone not found." }
  }

  if (tzList.length && !tzList.includes(zone)) {
    return { ok: false, error: "Unsupported timezone." }
  }

  const api = await timeApi(zone).catch((): TimeApiRes => ({ ok: false, error: "Time API unavailable", url: "" }))

  if (!api.ok) {
    const when = new Date()
    const info = pack(when, zone)
    return {
      ok: true,
      place: label || place,
      zone,
      time: info.time,
      date: info.date,
      iso: info.iso,
      dateIso: info.dateIso,
      offset: info.offset,
      num: info.num,
      source: "server",
      sources: geoUrl ? [{ url: geoUrl }] : [],
    }
  }

  const sources: { url: string }[] = []

  if (api.url) {
    sources.push({ url: api.url })
  }

  if (geoUrl) {
    sources.push({ url: geoUrl })
  }

  return {
    ok: true,
    place: label || place,
    zone,
    time: api.time,
    date: api.date,
    iso: api.iso,
    dateIso: api.dateIso,
    offset: api.offset,
    num: api.num,
    source,
    sources,
  }
}

export type NowCtx = {
  ok: boolean
  zone: string
  time: string
  date: string
  iso: string
  dateIso: string
  offset: string
  num: number
  source: string
  url?: string
}

export const now = async (zone?: string): Promise<NowCtx> => {
  const z0 = typeof zone === "string" ? zone : zoneMain
  const z1 = safeZone(z0)
  const api = await timeApi(z1).catch((): TimeApiRes => ({ ok: false, error: "Time API unavailable", url: "" }))

  if (api.ok) {
    return {
      ok: true,
      zone: z1,
      time: api.time,
      date: api.date,
      iso: api.iso,
      dateIso: api.dateIso,
      offset: api.offset,
      num: api.num,
      source: "worldtimeapi",
      url: api.url,
    }
  }

  const when = new Date()
  const info = pack(when, z1)
  return { ok: true, zone: z1, source: "server", ...info }
}

const hasKey = (t: string, keys: string[]) => {
  if (!t || !keys.length) {
    return false
  }

  for (var i = 0; i < keys.length; i++) {
    const k0 = keys[i] ?? ""
    const k = k0.trim().toLowerCase()

    if (!k) {
      continue
    }

    if (t.includes(k)) {
      return true
    }
  }

  return false
}

const isCatalog = (q: string) => {
  const t = clean(q).toLowerCase()

  if (!t) {
    return false
  }

  const vs = vendorsForQuery(t)

  if (!vs.length) {
    return false
  }

  const keys = [
    "model",
    "models",
    "model lineup",
    "model list",
    "model catalog",
    "model release",
    "model versions",
    "model family",
    "model names",
    "available models",
    "latest model",
    "current model",
    "newest model",
    "release",
    "release notes",
    "version",
    "versions",
    "version list",
    "version history",
    "lineup",
    "catalog",
    "list",
    "roster",
    "variants",
    "series",
    "model card",
    "model cards",
    "changelog",
    "pricing",
    "price",
  ]

  return hasKey(t, keys)
}

const isDocs = (q: string) => {
  const t = clean(q).toLowerCase()

  if (!t) {
    return false
  }

  const keys = [
    "docs",
    "documentation",
    "reference",
    "api",
    "sdk",
    "spec",
    "specification",
    "developer",
    "guide",
    "manual",
  ]

  return hasKey(t, keys)
}

export const kind = (q: string) => {
  const t = clean(q).toLowerCase()

  if (!t) {
    return ""
  }

  if (isTime(t)) {
    return "time"
  }

  if (isCatalog(t)) {
    return "model_catalog"
  }

  if (t.includes("news") || t.includes("headlines") || t.includes("top stories")) {
    return "news"
  }

  if (t.includes("what's the news") || t.includes("whats the news")) {
    return "news"
  }

  if (t.includes("breaking") || t.includes("current events")) {
    return "news"
  }

  if (isDocs(t)) {
    return "docs"
  }

  const keys = [
    "search",
    "look up",
    "find",
    "source",
    "citation",
    "cite",
    "website",
    "web",
    "docs",
    "documentation",
    "reference",
    "price",
    "pricing",
    "release",
    "version",
    "current",
    "today",
    "latest",
    "updated",
    "as of",
    "map code",
    "island code",
    "creator code",
    "promo code",
    "coupon code",
  ]

  for (var i = 0; i < keys.length; i++) {
    const k0 = keys[i] ?? ""
    const k = k0.trim()

    if (!k) {
      continue
    }

    if (t.includes(k)) {
      return "web"
    }
  }

  return ""
}

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
  const n1 = n0 ? n0 : numFrom(new Date())
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
