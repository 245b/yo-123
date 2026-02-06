import type { Msg } from "../types"
import { clean } from "../utils/text"
import { kind, now, web, type NowCtx } from "../web"

type ToolCall = { tool: string; args: Record<string, unknown> }

type ToolOut = { type: string; ok: boolean; error?: string; sources?: { url: string }[] }

export type AgentResult = {
  ok: boolean
  text?: string
  error?: string
  ctx?: AgentCtx
  usedTools?: boolean
}

type AgentCtx = {
  tools: ToolOut[]
  sources: { url: string; title?: string }[]
  minDate: number
  maxDate: number
  now: NowCtx
}

export type AgentDeps = {
  inst: string
  call: (messages: Msg[], temp?: number, max?: number, signal?: AbortSignal) => Promise<{ ok: boolean; text?: string; error?: string }>
  strict?: boolean
}

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

const limitFrom = (v: unknown, def: number, min: number, max: number) => {
  const raw = typeof v === "string" ? v.trim() : ""

  if (raw === "0") {
    return 0
  }

  if (typeof v === "number" && v === 0) {
    return 0
  }

  return numFrom(v, def, min, max)
}

const parseJson = (raw: string) => {
  const t = raw.trim()

  if (!t) {
    return null
  }

  try {
    return JSON.parse(t) as unknown
  } catch {
    return null
  }
}

const stripFence = (raw: string) => {
  const t = raw.trim()

  if (!t.startsWith("```")) {
    return t
  }

  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const out = m?.[1] ?? ""

  if (out) {
    return out.trim()
  }

  return t
}

const parseTool = (raw: string) => {
  const t = stripFence(raw)

  if (!t.startsWith("{") || !t.endsWith("}")) {
    return null
  }

  const out = parseJson(t)

  if (!out || typeof out !== "object") {
    return null
  }

  const o = out as { tool?: unknown; args?: unknown }
  const name0 = typeof o.tool === "string" ? o.tool : ""
  const name = name0.trim()

  if (!name) {
    return null
  }

  const args = (o.args && typeof o.args === "object" ? o.args : null) as Record<string, unknown> | null
  return { tool: name, args: args ?? {} } as ToolCall
}

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

const toolNote = (now0: NowCtx, min: number, max: number, lim: { time: number; steps: number }) => {
  const minTag = dateTag(min)
  const maxTag = dateTag(max)
  const parts = [
    "Tool use is available for time lookups only. If you need the current time/timezone, respond ONLY with JSON and no extra text.",
    'time args: {"query":"..."} for current time/timezone.',
    "Web lookups are handled by the system. Use any provided lookup context when available.",
    `Limits: time max_uses=${lim.time}, max_steps=${lim.steps}.`,
    `Authoritative now: ${now0.iso} (${now0.zone}). Recency policy: min ${minTag || "unknown"}; max ${maxTag || "unknown"}.`,
  ]
  return parts.join(" ")
}

const addSources = (bag: { url: string; title?: string }[], seen: Set<string>, list: { url?: string; title?: string }[]) => {
  for (var i = 0; i < list.length; i++) {
    const it = list[i]
    const url = clean(it?.url ?? "")

    if (!url) {
      continue
    }

    if (seen.has(url)) {
      continue
    }

    seen.add(url)
    bag.push({ url, title: clean(it?.title ?? "") })
  }
}

const toolErr = (name: string, msg: string) => ({ type: name, ok: false, error: msg })

export const createAgent = (deps: AgentDeps) => {
  const timeMax = numFrom(process.env.WEB_TIME_MAX_USES, 1, 1, 3)
  const stepsMax = limitFrom(process.env.AGENT_MAX_STEPS, 0, 2, 2000)

  const run = async (msgs: Msg[], query: string, sig?: AbortSignal, mark?: (label?: string) => void): Promise<AgentResult> => {
    const feed = msgs.slice()
    const now0 = await now()
    const min = pickDate(query)
    const max = capDate(now0.num)
    const lim = { time: timeMax, steps: stepsMax }
    const note = toolNote(now0, min, max, lim)
    const inst = deps.inst
    const sys = inst ? `${inst} ${note}` : note
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
      const next = c ? `${c}\n\n${sys}` : sys
      feed[si] = { role: "system", content: next }
    }

    if (si < 0) {
      feed.unshift({ role: "system", content: sys })
    }

    const sources: { url: string; title?: string }[] = []
    const seen = new Set<string>()
    const tools: ToolOut[] = []
    var used = false
    var tCount = 0
    const ping = typeof mark === "function" ? mark : null
    const base = kind(query)
    const forceTime = base === "time"
    const timeFromTools = (list: ToolOut[]) => {
      for (var i = list.length - 1; i >= 0; i--) {
        const it0 = list[i]
        const it = (it0 && typeof it0 === "object" ? it0 : null) as {
          type?: unknown
          ok?: unknown
          time?: unknown
          date?: unknown
          place?: unknown
          zone?: unknown
          offset?: unknown
        } | null

        if (!it || it.type !== "time" || it.ok !== true) {
          continue
        }

        const time0 = typeof it.time === "string" ? it.time : ""
        const time = time0.trim()

        if (!time) {
          continue
        }

        const place0 = typeof it.place === "string" ? it.place : ""
        const place = place0.trim()
        const date0 = typeof it.date === "string" ? it.date : ""
        const date = date0.trim()
        const zone0 = typeof it.zone === "string" ? it.zone : ""
        const zone = zone0.trim()
        const offset0 = typeof it.offset === "string" ? it.offset : ""
        const offset = offset0.trim()
        var out = place ? `Current time in ${place}: ${time}` : `Current time: ${time}`

        if (date) {
          out += ` on ${date}`
        }

        if (zone || offset) {
          const tag = zone || "UTC"
          const off = offset ? ` ${offset}` : ""
          out += ` (${tag}${off})`
        }

        return out.trim()
      }

      return ""
    }

    if (forceTime) {
      if (tCount < timeMax) {
        tCount++
        if (ping) {
          ping()
        }
        const res = await web(query, "time")
        const ok = (res && typeof res === "object" ? res : null) as { ok?: unknown; sources?: unknown } | null
        var out: ToolOut = toolErr("time", "Time lookup failed")

        if (ok && ok.ok === true) {
          out = (res as ToolOut) ?? toolErr("time", "Time lookup failed")
          const src = Array.isArray(ok.sources) ? ok.sources : []
          addSources(sources, seen, src)
        }

        tools.push(out)
        used = true
        feed.push({ role: "system", content: `Tool result: ${JSON.stringify(out)}` })
      }
    }

    for (var step = 0; ; step++) {
      if (stepsMax > 0 && step >= stepsMax) {
        break
      }
      const res = await deps.call(feed, 0.2, undefined, sig)

      if (!res.ok) {
        const e0 = typeof res.error === "string" ? res.error : "Model error"
        return { ok: false, error: e0 }
      }

      const txt0 = typeof res.text === "string" ? res.text : ""
      const txt = txt0.trim()
      const call = parseTool(txt)

      if (!call) {
        const raw = txt.trim()

        if (base === "time" && raw.startsWith("{") && raw.endsWith("}")) {
          const fallback = timeFromTools(tools)

          if (fallback) {
            return { ok: true, text: fallback, ctx: { tools, sources, minDate: min, maxDate: max, now: now0 }, usedTools: used }
          }
        }

        return { ok: true, text: txt0, ctx: { tools, sources, minDate: min, maxDate: max, now: now0 }, usedTools: used }
      }

      feed.push({ role: "assistant", content: txt })
      const name = call.tool
      const args = call.args
      var out: ToolOut = toolErr(name, "Unsupported tool")

      if (name === "time") {
        const cap = numFrom(args?.max_uses, timeMax, 1, timeMax)

        if (tCount >= cap) {
          out = toolErr(name, "Max uses reached")
        }

        if (tCount < cap) {
          tCount++
          if (ping) {
            ping()
          }
          const q0 = typeof args?.query === "string" ? args.query : query
          const res = await web(q0, "time")
          const ok = (res && typeof res === "object" ? res : null) as { ok?: unknown; sources?: unknown } | null

          if (!ok || ok.ok !== true) {
            out = toolErr(name, "Time lookup failed")
          }

          if (ok && ok.ok === true) {
            out = (res as ToolOut) ?? toolErr(name, "Time lookup failed")
            const src = Array.isArray(ok.sources) ? ok.sources : []
            addSources(sources, seen, src)
          }
        }
      }

      tools.push(out)
      used = true
      feed.push({ role: "system", content: `Tool result: ${JSON.stringify(out)}` })
    }

    if (stepsMax > 0) {
      return {
        ok: true,
        text: "I hit the tool-use limit for this request and had to stop.",
        ctx: { tools, sources, minDate: min, maxDate: max, now: now0 },
        usedTools: used,
      }
    }

    return { ok: false, error: "Tool loop ended", ctx: { tools, sources, minDate: min, maxDate: max, now: now0 }, usedTools: used }
  }

  return { run }
}
