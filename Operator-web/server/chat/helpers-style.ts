import { clean } from "../utils/text"
import { hasUrl, noSourcesMessage, splitSentences } from "./helpers-core"

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

const numEnv = (raw: string, def: number, min: number, max: number) => {
  const t = raw.trim()

  if (t === "0") {
    return 0
  }

  const n0 = Number.parseInt(t, 10)

  if (!Number.isFinite(n0)) {
    return def
  }

  const n1 = Math.floor(n0)

  if (n1 < min) {
    return min
  }

  if (n1 > max) {
    return max
  }

  return n1
}

const envBool = (raw: string) => {
  const t = raw.trim().toLowerCase()

  if (t === "1") {
    return true
  }

  if (t === "true") {
    return true
  }

  if (t === "yes") {
    return true
  }

  if (t === "on") {
    return true
  }

  return false
}

const normTool = (raw: string) => {
  const t0 = clean(raw).toLowerCase()

  if (!t0) {
    return ""
  }

  if (t0 === "web_search" || t0 === "web_fetch" || t0 === "search") {
    return "web"
  }

  if (t0 === "documentation") {
    return "docs"
  }

  if (t0 === "terminal_open") {
    return "session_ensure"
  }

  return t0
}

const toolKind = (name: string) => {
  if (name === "web") {
    return "web"
  }

  if (name === "news") {
    return "news"
  }

  if (name === "docs") {
    return "docs"
  }

  if (name === "time") {
    return "time"
  }

  return ""
}

const allowTool = (name: string) => {
  if (!name) {
    return false
  }

  if (name === "web" || name === "news" || name === "docs" || name === "time") {
    return true
  }

  if (name === "session_ensure" || name === "editor_open") {
    return true
  }

  if (name.startsWith("fs_")) {
    return true
  }

  if (name.startsWith("project_")) {
    return true
  }

  if (name.startsWith("terminal_")) {
    return true
  }

  return false
}

const normalizeQuery = (raw: string) => {
  const t0 = clean(raw)

  if (!t0) {
    return ""
  }

  var t = t0
  t = t.replace(/^(please\s+)?(try\s+(and|to)\s+)?(search|find|look\s+up)\s+(the\s+web\s*)?/i, "")
  t = t.replace(/\b(search|find|look\s+up)\s+(the\s+web|online)\b/gi, "")
  t = t.replace(/\s+/g, " ").trim()
  return t
}

const pickQueries = (inputs: Record<string, unknown>, fallback: string) => {
  const list0 = Array.isArray(inputs.queries) ? inputs.queries : []
  const out: string[] = []

  for (var i = 0; i < list0.length; i++) {
    const it = list0[i]
    const s0 = typeof it === "string" ? it : ""
    const s1 = normalizeQuery(s0)

    if (!s1) {
      continue
    }

    out.push(s1)
  }

  if (out.length) {
    return out
  }

  const q0 = typeof inputs.query === "string" ? inputs.query : ""
  const q1 = normalizeQuery(q0)

  if (q1) {
    return [q1]
  }

  const q2 = normalizeQuery(fallback)
  return q2 ? [q2] : []
}

const streamDelay = () => {
  const raw = (process.env.STREAM_WORD_DELAY_MS ?? "").trim()
  const n0 = Number.parseInt(raw, 10)

  if (Number.isFinite(n0) && n0 >= 0) {
    return n0
  }

  return 8
}

const streamGroup = () => {
  const raw = (process.env.STREAM_WORD_GROUP ?? "").trim()
  const n0 = Number.parseInt(raw, 10)

  if (Number.isFinite(n0) && n0 >= 1) {
    return Math.min(6, Math.max(1, Math.floor(n0)))
  }

  return 1
}

const streamParts = (s: string) => {
  const t0 = typeof s === "string" ? s : ""
  const t = t0.trim()

  if (!t) {
    return [] as string[]
  }

  const list = t0.match(/\s*\S+\s*/g) ?? []

  if (list.length) {
    return list
  }

  return [t0]
}

const pickUrls = (ctx: unknown) => {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (u: string) => {
    const url = u.trim()

    if (!url) {
      return
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return
    }

    if (seen.has(url)) {
      return
    }

    seen.add(url)
    out.push(url)
  }

  const scan = (c: unknown) => {
    const row = (c && typeof c === "object" ? c : null) as {
      results?: unknown
      sources?: unknown
      url?: unknown
      tools?: unknown
    } | null

    if (!row) {
      return
    }

    const list = Array.isArray(row.results) ? row.results : []

    for (var i = 0; i < list.length; i++) {
      const it = list[i]
      const r0 = (it && typeof it === "object" ? it : null) as { url?: unknown } | null
      const u0 = typeof r0?.url === "string" ? r0.url : ""
      add(u0)
    }

    const srcs = Array.isArray(row.sources) ? row.sources : []

    for (var i = 0; i < srcs.length; i++) {
      const it = srcs[i]
      const r0 = (it && typeof it === "object" ? it : null) as { url?: unknown } | null
      const u0 = typeof r0?.url === "string" ? r0.url : ""
      add(u0)
    }

    const u1 = typeof row.url === "string" ? row.url : ""
    add(u1)

    const tools = Array.isArray(row.tools) ? row.tools : []

    for (var i = 0; i < tools.length; i++) {
      scan(tools[i])
    }
  }

  scan(ctx)
  return out
}

const applyLookupMeta = (ctx: unknown, now0: { iso: string; dateIso: string; zone: string }) => {
  const c0 = (ctx && typeof ctx === "object" ? ctx : null) as {
    minDate?: unknown
    maxDate?: unknown
    rejectMissingDate?: unknown
    type?: unknown
  } | null
  const type0 = typeof c0?.type === "string" ? c0.type : ""
  const ctxType = type0.trim()
  const min0 = typeof c0?.minDate === "number" ? c0.minDate : 0
  const max0 = typeof c0?.maxDate === "number" ? c0.maxDate : 0
  const reject = c0?.rejectMissingDate === true
  const policy = {
    min_publish_date: dateTag(min0),
    max_publish_date: dateTag(max0),
    reject_if_missing_date: reject,
  }
  const meta = {
    now_iso: now0.iso,
    now_date: now0.dateIso,
    timezone: now0.zone,
    recency_policy: policy,
  }

  if (ctx && typeof ctx === "object") {
    Object.assign(ctx as Record<string, unknown>, meta)
  }

  if (!ctx) {
    ctx = meta
  }

  const minTag = dateTag(min0)
  const maxTag = dateTag(max0)
  var extra = ""

  if (ctxType === "model_catalog") {
    extra =
      "Model catalog policy: Prefer sources with publish dates in range. Official vendor sources without publish dates are allowed with retrieved_at. " +
      "Do not claim a \"latest\" model unless at least two independent hosts corroborate it. Summarize what is confirmed and state what cannot be verified."
  }

  if (ctxType === "docs") {
    extra = "Docs policy: Prefer official documentation and standards. If publish dates are missing, note that the date is not provided."
  }

  const note =
    `Lookup results (may include fetched page snippets or time data; cite sources with url + title when present). ` +
    `Authoritative now: ${now0.iso} (${now0.zone}). ` +
    `Recency policy: min ${minTag || "unknown"}; max ${maxTag || "unknown"}; reject_missing_date=${reject ? "true" : "false"}. ` +
    `${extra ? `${extra} ` : ""}` +
    `If this context is present, do not say you cannot search or browse the web. If lookup data is missing, say so: ${JSON.stringify(ctx)}`

  return { ctx, note }
}

const hadLookup = (ctx: unknown) => {
  const c = (ctx && typeof ctx === "object" ? ctx : null) as { tools?: unknown; type?: unknown } | null

  if (!c) {
    return false
  }

  const tools = Array.isArray(c.tools) ? c.tools : []

  for (var i = 0; i < tools.length; i++) {
    const it = tools[i]
    const t0 = (it && typeof it === "object" ? it : null) as { type?: unknown } | null
    const type0 = typeof t0?.type === "string" ? t0.type : ""
    const type = type0.trim()

    if (
      type === "web_search" ||
      type === "web_fetch" ||
      type === "web" ||
      type === "news" ||
      type === "docs" ||
      type === "model_catalog" ||
      type === "time"
    ) {
      return true
    }
  }

  const type0 = typeof c.type === "string" ? c.type : ""
  const type = type0.trim()

  if (type === "web" || type === "news" || type === "model_catalog" || type === "docs" || type === "time") {
    return true
  }

  return false
}

const citeAll = (txt: string, urls: string[]) => {
  const t0 = typeof txt === "string" ? txt : ""
  const t = t0.trim()

  if (!t) {
    return ""
  }

  if (!urls.length) {
    return t
  }

  const list = urls.slice(0, 3).join(" ")
  const parts = splitSentences(t)

  if (!parts.length) {
    if (!hasUrl(t)) {
      return `${t} Sources: ${list}`
    }

    return t
  }

  const out: string[] = []

  for (var i = 0; i < parts.length; i++) {
    var seg = parts[i] ?? ""
    seg = seg.trim()

    if (!seg) {
      continue
    }

    if (!hasUrl(seg)) {
      seg = `${seg} Sources: ${list}`
    }

    out.push(seg)
  }

  return out.join(" ")
}
const appendSources = (txt: string, urls: string[]) => {
  const t0 = typeof txt === "string" ? txt : ""
  const t = t0.trim()

  if (!t) {
    return ""
  }

  if (!urls.length) {
    return t
  }

  if (hasUrl(t)) {
    return t
  }

  const list = urls.slice(0, 3).join(" ")
  return `${t} Sources: ${list}`
}
const stripEmoji = (s: string) => {
  const raw = typeof s === "string" ? s : ""

  if (!raw) {
    return ""
  }

  try {
    return raw.replace(/[\p{Extended_Pictographic}\u200d\uFE0F]/gu, "")
  } catch {
    return raw.replace(/[\u2600-\u27BF]/g, "")
  }
}

const stripMarkdown = (s: string) => {
  var out = typeof s === "string" ? s : ""

  if (!out) {
    return ""
  }

  out = out.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, "$1 $2")
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 $2")
  out = out.replace(/^\s{0,3}>\s?/gm, "")
  out = out.replace(/\*\*(.+?)\*\*/g, "$1")
  out = out.replace(/__(.+?)__/g, "$1")
  out = out.replace(/\*(.+?)\*/g, "$1")
  out = out.replace(/_(.+?)_/g, "$1")
  out = out.replace(/`(.+?)`/g, "$1")
  return out
}

const stripHeadings = (s: string) => {
  const lines = s.split("\n")
  const out: string[] = []

  for (var i = 0; i < lines.length; i++) {
    const line0 = lines[i] ?? ""
    const line = line0.replace(/^\s{0,3}#{1,6}\s+/, "")
    out.push(line)
  }

  return out.join("\n")
}

const reduceLists = (s: string) => {
  const lines = s.split("\n")
  var count = 0

  for (var i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim()

    if (/^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      count++
    }
  }

  const out: string[] = []

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i] ?? ""
    line = line.replace(/^\s{0,3}[-*+]\s+/, "")
    line = line.replace(/^\s{0,3}\d+\.\s+/, "")
    out.push(line)
  }

  var joined = out.join("\n")

  if (count > 4) {
    joined = joined.replace(/\n+/g, " ")
  }

  return joined
}

const deHype = (s: string) => {
  var out = typeof s === "string" ? s : ""

  if (!out) {
    return ""
  }

  out = out.replace(/!+/g, ".")
  out = out.replace(/\?{2,}/g, "?")
  return out
}

const stripAi = (s: string) => {
  var out = typeof s === "string" ? s : ""

  if (!out) {
    return ""
  }

  const parts = splitSentences(out)

  if (!parts.length) {
    return out
  }

  const bad = [
    "as an ai",
    "as a language model",
    "as a large language model",
    "as an assistant",
    "as an ai language model",
    "i am an ai",
    "i'm an ai",
    "i am a language model",
    "i'm a language model",
    "i am a large language model",
    "i'm a large language model",
    "i am an assistant",
    "i'm an assistant",
    "i do not have access to the internet",
    "i don't have access to the internet",
    "i cannot access the internet",
    "i can't access the internet",
    "i do not have access to the web",
    "i don't have access to the web",
    "i cannot browse the internet",
    "i can't browse the internet",
    "i cannot browse the web",
    "i can't browse the web",
    "i do not have browsing access",
    "i don't have browsing access",
    "i do not have real time data",
    "i don't have real time data",
    "i do not have real-time data",
    "i don't have real-time data",
    "i cannot provide real time",
    "i can't provide real time",
    "i cannot provide real-time",
    "i can't provide real-time",
    "i do not have browsing capabilities",
    "i don't have browsing capabilities",
  ]

  const keep: string[] = []

  for (var i = 0; i < parts.length; i++) {
    const seg = parts[i] ?? ""
    const low = seg.toLowerCase()
    var drop = false

    for (var j = 0; j < bad.length; j++) {
      const b0 = bad[j] ?? ""
      const b = b0.trim()

      if (!b) {
        continue
      }

      if (low.includes(b)) {
        drop = true
        break
      }
    }

    if (drop) {
      continue
    }

    keep.push(seg)
  }

  return keep.join(" ")
}

const stripUrgency = (s: string) => {
  var out = typeof s === "string" ? s : ""

  if (!out) {
    return ""
  }

  out = out.replace(/\bthis is critical\b/gi, "")
  out = out.replace(/\bthis is urgent\b/gi, "")
  out = out.replace(/\b100%\s+guaranteed\b/gi, "")
  out = out.replace(/\byou must do this now\b/gi, "")
  out = out.replace(/\bmust do this now\b/gi, "")
  out = out.replace(/\bdo this now\b/gi, "")
  return out.trim()
}

const stripFiller = (s: string) => {
  var out = typeof s === "string" ? s : ""

  if (!out) {
    return ""
  }

  const parts = splitSentences(out)

  if (!parts.length) {
    return out
  }

  const bad = [
    "in summary",
    "overall",
    "to sum up",
    "in conclusion",
    "in short",
    "long story short",
  ]

  const keep: string[] = []

  for (var i = 0; i < parts.length; i++) {
    const seg = (parts[i] ?? "").trim()

    if (!seg) {
      continue
    }

    const low = seg.toLowerCase()
    var drop = false

    for (var j = 0; j < bad.length; j++) {
      const b0 = bad[j] ?? ""
      const b = b0.trim()

      if (!b) {
        continue
      }

      if (low === b || low.startsWith(`${b} `) || low.startsWith(`${b},`)) {
        drop = true
        break
      }
    }

    if (drop) {
      continue
    }

    keep.push(seg)
  }

  return keep.join(" ")
}

const enforceStyle = (s: string) => {
  var out = typeof s === "string" ? s : ""

  if (!out) {
    return ""
  }

  out = stripEmoji(out)
  out = stripMarkdown(out)
  out = stripHeadings(out)
  out = reduceLists(out)
  out = deHype(out)
  out = stripUrgency(out)
  out = stripFiller(out)
  out = stripAi(out)
  out = out.replace(/\n{3,}/g, "\n\n")
  out = out.replace(/[ \t]{2,}/g, " ")
  return out.trim()
}

const deny = (ctx: unknown, q?: string) => {
  const query = typeof q === "string" ? q : ""
  const c = (ctx && typeof ctx === "object" ? ctx : null) as {
    type?: unknown
    ok?: unknown
    place?: unknown
    results?: unknown
    sources?: unknown
    tools?: unknown
    corroboration?: unknown
  } | null

  if (!c) {
    return noSourcesMessage(query, false)
  }

  const cor = (c.corroboration && typeof c.corroboration === "object" ? c.corroboration : null) as {
    ok?: unknown
    required?: unknown
    unique_hosts?: unknown
  } | null

  if (cor && cor.ok !== true) {
    return "I found some information, but not enough independent sources to verify it."
  }

  const srcs = Array.isArray(c.sources) ? c.sources : []
  const tools = Array.isArray(c.tools) ? c.tools : []

  if (srcs.length) {
    return ""
  }

  if (tools.length) {
    var hadSearch = false

    for (var i = 0; i < tools.length; i++) {
      const it = tools[i]
      const t0 = (it && typeof it === "object" ? it : null) as { type?: unknown; ok?: unknown; place?: unknown } | null
      const type0 = typeof t0?.type === "string" ? t0.type : ""
      const type = type0.trim()

      if (
        type === "web_search" ||
        type === "web_fetch" ||
        type === "web" ||
        type === "news" ||
        type === "docs" ||
        type === "model_catalog"
      ) {
        hadSearch = true
      }

      if (type !== "time") {
        continue
      }

      const ok = t0?.ok === true

      if (ok) {
        continue
      }

      const p0 = typeof t0?.place === "string" ? t0.place : ""
      const p = p0.trim()

      if (p) {
        return `Cannot verify the current time for ${p}.`
      }

      return "Cannot verify the current time."
    }

    if (hadSearch) {
      return noSourcesMessage(query, true)
    }
  }

  const type = typeof c.type === "string" ? c.type : ""

  if (type === "time") {
    const ok = c.ok === true

    if (!ok) {
      const p0 = typeof c.place === "string" ? c.place : ""
      const p = p0.trim()

      if (p) {
        return `Cannot verify the current time for ${p}.`
      }

      return "Cannot verify the current time."
    }
  }

  if (type === "web" || type === "news" || type === "model_catalog" || type === "docs") {
    const list = Array.isArray(c.results) ? c.results : []

    if (!list.length) {
      return noSourcesMessage(query, true)
    }
  }

  return ""
}

const fetchReason = (err: string) => {
  const raw = typeof err === "string" ? err : ""

  if (!raw) {
    return "The website did not return readable content."
  }

  if (raw.includes("URL not in conversation context")) {
    return "I can only open links that were explicitly shared in this chat."
  }

  if (raw.includes("Max uses reached")) {
    return "I hit the fetch limit for this request."
  }

  if (raw.includes("Missing url")) {
    return "The link was missing or empty."
  }

  if (raw.includes("Invalid url")) {
    return "That does not look like a valid link."
  }

  if (raw.includes("Blocked domain")) {
    return "That site is blocked here, so I cannot open it."
  }

  if (raw.includes("Domain not allowed")) {
    return "That site's domain is not allowed for fetch in this environment."
  }

  if (raw.includes("Fetch failed")) {
    return "The site did not return readable content. It might block automated access, require a login or subscription, or be temporarily unavailable."
  }

  return "The website did not return readable content."
}

const fetchFail = (ctx: unknown) => {
  const c = (ctx && typeof ctx === "object" ? ctx : null) as {
    tools?: unknown
  } | null

  if (!c) {
    return ""
  }

  const tools = Array.isArray(c.tools) ? c.tools : []

  if (!tools.length) {
    return ""
  }

  for (var i = 0; i < tools.length; i++) {
    const it = tools[i]
    const t0 = (it && typeof it === "object" ? it : null) as {
      type?: unknown
      ok?: unknown
      error?: unknown
      url?: unknown
    } | null

    if (!t0) {
      continue
    }

    const type0 = typeof t0.type === "string" ? t0.type : ""
    const type = type0.trim()

    if (type !== "web_fetch") {
      continue
    }

    if (t0.ok === true) {
      continue
    }

    const err0 = typeof t0.error === "string" ? t0.error : ""
    const err = err0.trim()
    const url0 = typeof t0.url === "string" ? t0.url : ""
    const url = url0.trim()
    const reason = fetchReason(err)

    const name = "the website you shared"
    return `I tried to fetch ${name}, but I couldn't. ${reason}`
  }

  return ""
}

export {
  dateTag,
  numEnv,
  envBool,
  normTool,
  toolKind,
  allowTool,
  normalizeQuery,
  pickQueries,
  streamDelay,
  streamGroup,
  streamParts,
  pickUrls,
  applyLookupMeta,
  hadLookup,
  citeAll,
  appendSources,
  enforceStyle,
  deny,
  fetchReason,
  fetchFail,
}

