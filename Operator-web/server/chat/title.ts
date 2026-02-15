import type { Msg } from "../types"
import { body } from "../utils/http"
import { clean, clip, unq } from "../utils/text"
import { createDeepSeek } from "./deepseek"
import { readDeepSeekApiKey } from "./key"
import { parseMessages } from "./messages"

export type TitleDeps = {
  root: string
  json: (v: unknown, st?: number) => Response
  bad: (msg: string, st?: number) => Response
}

export const createTitleHandler = (deps: TitleDeps) => {
  const sys =
    "Generate a short, clear title (3-7 words) that describes the main topic of the conversation. Do not use quotes. Do not use punctuation. Do not include generic words like chat or conversation."

  const gen = new Set([
    "chat",
    "conversation",
    "thread",
    "session",
    "discussion",
    "dialogue",
  ])

  const strip = (v: string) => {
    const t0 = clean(unq(v))
    const t1 = t0.replace(/[^A-Za-z0-9 ]+/g, " ")
    return t1.replace(/\s+/g, " ").trim()
  }

  const ws = (v: string) => {
    const t = strip(v)
    return t ? t.split(" ").filter((w) => w.length > 0) : ([] as string[])
  }

  const drop = (ls: string[]) => {
    const out: string[] = []

    for (var i = 0; i < ls.length; i++) {
      const w0 = ls[i] ?? ""
      const w = w0.trim()

      if (!w) {
        continue
      }

      if (gen.has(w.toLowerCase())) {
        continue
      }

      out.push(w)
    }

    return out
  }

  const cap = (v: string) => {
    const t = v.trim()

    if (!t) {
      return ""
    }

    const a = t[0]?.toUpperCase?.() ?? ""
    const b = t.slice(1).toLowerCase()
    return `${a}${b}`
  }

  const title = (ls: string[]) => {
    const out: string[] = []

    for (var i = 0; i < ls.length; i++) {
      const w = cap(ls[i] ?? "")

      if (!w) {
        continue
      }

      out.push(w)
    }

    return out.join(" ").trim()
  }

  const ok = (ls: string[]) => ls.length >= 3 && ls.length <= 7

  const fallback = (seed: string) => {
    const base = ws(seed)
    const short = drop(base)

    if (ok(short)) {
      return title(short)
    }

    if (ok(base)) {
      return title(base)
    }

    if (short.length) {
      return title(short.slice(0, 7))
    }

    if (base.length) {
      return title(base.slice(0, 7))
    }

    return ""
  }

  const pick = (ms: Msg[]) => {
    var user = ""
    var assistant = ""

    for (var i = 0; i < ms.length; i++) {
      const m = ms[i]
      const role = m?.role ?? ""

      if (role === "user" && !user) {
        const c0 = typeof m?.content === "string" ? m.content : ""
        user = c0.trim()
      }

      if (role === "assistant" && !assistant) {
        const c0 = typeof m?.content === "string" ? m.content : ""
        assistant = c0.trim()
      }

      if (user && assistant) {
        break
      }
    }

    return { user, assistant }
  }

  return async (req: Request) => {
    var key = readDeepSeekApiKey()

    if (!key) {
      return deps.bad("Missing DEEPSEEK_API_KEY", 500)
    }

    const sig = req.signal
    const v = await body(req)
    const o = (v && typeof v === "object" ? v : null) as {
      messages?: unknown
      msg?: unknown
      model?: unknown
    } | null

    if (!o) {
      return deps.bad("Invalid JSON body")
    }

    const msg0 = typeof o.msg === "string" ? o.msg : ""
    const msg = msg0.trim()
    var ms = parseMessages(o.messages)

    if (msg) {
      ms = [{ role: "user", content: msg.slice(0, 2000) }]
    }

    const pick0 = pick(ms)
    const u0 = clip(clean(pick0.user), 1200)
    const a0 = clip(clean(pick0.assistant), 1200)

    if (!u0) {
      return deps.bad("Missing messages")
    }

    const parts: string[] = []
    parts.push(`User: ${u0}`)

    if (a0) {
      parts.push(`Assistant: ${a0}`)
    }

    const content = parts.join("\n")

    const model0 = typeof o.model === "string" ? o.model : ""
    const m0 = model0.trim()
    const env = (process.env.DEEPSEEK_MODEL ?? "").trim()
    const model = m0 || env || "deepseek-chat"
    const base0 = (process.env.DEEPSEEK_BASE_URL ?? "").trim()
    const base = base0 || "https://api.deepseek.com"
    const client = createDeepSeek(base, key, model)

    const feed: Msg[] = [
      { role: "system", content: sys },
      { role: "user", content },
    ]

    const res = await client.call(feed, 0.2, 32, sig)

    if (!res.ok) {
      const e0 = typeof res.error === "string" ? res.error : "DeepSeek error"
      return deps.bad(e0, 502)
    }

    const raw = typeof res.text === "string" ? res.text : ""
    const ws0 = ws(raw)
    const ws1 = drop(ws0)
    var out = ""

    if (ok(ws1)) {
      out = title(ws1)
    }

    if (!out && ok(ws0)) {
      out = title(ws0)
    }

    if (!out) {
      out = fallback(u0)
    }

    const t = out.trim()

    if (!t) {
      return deps.bad("Title unavailable", 422)
    }

    return deps.json({ ok: true, title: t, model })
  }
}
