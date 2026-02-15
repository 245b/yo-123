import { clean } from "../utils/text"
import { fetchJson } from "./fetch"

const zoneMain = "Asia/Qatar"
const intl = Intl as { supportedValuesOf?: (key: string) => string[] }
const tzList = typeof intl.supportedValuesOf === "function" ? intl.supportedValuesOf("timeZone") : []

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

export const dateNumFromUtc = (when: Date) => {
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

export const timeCtx = async (q: string) => {
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
