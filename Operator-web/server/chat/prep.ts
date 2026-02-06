import type { Msg } from "../types"
import { clean } from "../utils/text"
import { kind, now, web } from "../web"

export type PrepDeps = {
  inst: string
  call: (messages: Msg[], temp?: number, max?: number, signal?: AbortSignal) => Promise<{ ok: boolean; text?: string; error?: string }>
  strict?: boolean
}

export type PrepOpts = {
  force?: boolean
  type?: string
}

export const createPrep = (deps: PrepDeps) => {
  const gateOn = (process.env.LOOKUP_GATE ?? "").trim() === "1"
  const pickDate = (q: string) => {
    const list = q.match(/\b(19|20)\d{2}\b/g) ?? []
    var y = 0

    for (var i = 0; i < list.length; i++) {
      const v0 = list[i] ?? ""
      const v1 = Number.parseInt(v0, 10)

      if (!Number.isFinite(v1)) {
        continue
      }

      if (v1 > y) {
        y = v1
      }
    }

    const now = new Date()
    const by = now.getUTCFullYear()
    const base = new Date(Date.UTC(by - 1, 5, 1))
    const bm = base.getUTCMonth() + 1
    const bd = base.getUTCDate()
    const cut = base.getUTCFullYear() * 10000 + bm * 100 + bd
    var min = cut
    const fixed = 20250101

    if (fixed > min) {
      min = fixed
    }

    if (y > 0) {
      const y0 = y * 10000 + 101

      if (y0 > min) {
        min = y0
      }
    }

    return min
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

  const capDate = (n: number) => {
    const cap = 20261231

    if (!n) {
      return 0
    }

    if (cap && n > cap) {
      return cap
    }

    return n
  }

  const gate = async (q: string, sig?: AbortSignal) => {
    const txt = clean(q)

    if (!txt) {
      return false
    }

    const sys =
      "Decide if the answer needs web search. Reply only YES or NO. Say YES for current events, prices, new releases, time/timezone, specific IDs/codes (map codes, coupon codes), or uncertainty. Say NO for general knowledge."
    const ask = [
      { role: "system", content: sys },
      { role: "user", content: txt },
    ] as Msg[]
    const res = await deps.call(ask, 0, 6, sig)

    if (!res.ok) {
      return false
    }

    const out = clean(res.text ?? "").toUpperCase()
    const tag = out.replace(/[^A-Z]/g, "")

    if (tag === "YES") {
      return true
    }

    if (tag === "NO") {
      return false
    }

    return false
  }

  const prep = async (list: Msg[], query: string, mark?: () => void, sig?: AbortSignal, opt?: PrepOpts) => {
    const feed = list.slice()
    const type0 = typeof opt?.type === "string" ? opt.type : ""
    const type1 = type0.trim()
    const k = type1 || kind(query)
    var use = false
    var type = ""
    const strict = deps.strict === true
    const forced = opt?.force === true
    const min = pickDate(query)
    var ctx: unknown = null

    if (forced) {
      use = true
      type = k || "web"
    }

    if (!forced && k) {
      use = true
      type = k
    }

    if (!forced && !k && query && !strict && gateOn) {
      const g = await gate(query, sig)

      if (g) {
        use = true
        type = "web"
      }
    }

    if (!forced && strict && !use) {
      use = true
      type = k || "web"
    }

    if (!use) {
      var si = -1

      for (var i = 0; i < feed.length; i++) {
        const it = feed[i]
        const r0 = it?.role ?? ""

        if (r0 === "system") {
          si = i
          break
        }
      }

      if (si >= 0) {
        const it = feed[si]
        const c0 = it?.content ?? ""
        const c1 = typeof c0 === "string" ? c0 : ""
        const c = c1.trim()
        const next = c ? `${c}\n\n${deps.inst}` : deps.inst
        feed[si] = { role: "system", content: next }
      }

      if (si < 0) {
        feed.unshift({ role: "system", content: deps.inst })
      }

      return { feed, ctx: null, minDate: min }
    }

    const now0 = await now()
    const max = capDate(now0.num)

    if (mark) {
      mark()
    }

    ctx = await web(query, type, min, now0)

    const c0 = (ctx && typeof ctx === "object" ? ctx : null) as {
      minDate?: unknown
      maxDate?: unknown
      rejectMissingDate?: unknown
      type?: unknown
      corroboration?: unknown
      allowMissingOfficial?: unknown
    } | null
    const ctxType0 = typeof c0?.type === "string" ? c0.type : ""
    const ctxType = ctxType0.trim()
    const min0 = typeof c0?.minDate === "number" ? c0.minDate : min
    const max0 = typeof c0?.maxDate === "number" ? c0.maxDate : max
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

    if (ctx) {
      const blob = JSON.stringify(ctx)
      const minTag = dateTag(min0)
      const maxTag = dateTag(max0)
      var extra = ""

      if (ctxType === "model_catalog") {
        extra =
          "Model catalog policy: Prefer sources with publish dates in range. Official vendor sources without publish dates are allowed with retrieved_at. " +
          "Do not claim a \"latest\" model unless at least two independent hosts corroborate it. Summarize what is confirmed and state what cannot be verified."
      }

      if (ctxType === "docs") {
        extra =
          "Docs policy: Prefer official documentation and standards. If publish dates are missing, note that the date is not provided."
      }
      const note =
        `Lookup results (may include fetched page snippets or time data; cite sources with url + title when present). ` +
        `Authoritative now: ${now0.iso} (${now0.zone}). ` +
        `Recency policy: min ${minTag || "unknown"}; max ${maxTag || "unknown"}; reject_missing_date=${reject ? "true" : "false"}. ` +
        `${extra ? `${extra} ` : ""}` +
        `If this context is present, do not say you cannot search or browse the web. If lookup data is missing, say so: ${blob}`
      feed.unshift({ role: "system", content: note })
    }

    var si = -1

    for (var i = 0; i < feed.length; i++) {
      const it = feed[i]
      const r0 = it?.role ?? ""

      if (r0 === "system") {
        si = i
        break
      }
    }

    if (si >= 0) {
      const it = feed[si]
      const c0 = it?.content ?? ""
      const c1 = typeof c0 === "string" ? c0 : ""
      const c = c1.trim()
      const next = c ? `${c}\n\n${deps.inst}` : deps.inst
      feed[si] = { role: "system", content: next }
    }

    if (si < 0) {
      feed.unshift({ role: "system", content: deps.inst })
    }

    return { feed, ctx, minDate: min }
  }

  return { prep }
}
