import type { Msg, MsgPart } from "../types"

export type ToolDef = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
    strict?: boolean
  }
}

type ToolCall = {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

type DsMsg = {
  role: "system" | "user" | "assistant" | "tool"
  content?: string | MsgPart[]
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export type ToolRun = (name: string, args: Record<string, unknown>, meta: { id: string }) => Promise<unknown>

export type DeepSeekTrace = (evt: { step: number; req: unknown; res: unknown }) => void | Promise<void>

export type DeepSeekOpts = {
  tools?: ToolDef[]
  runTool?: ToolRun | null
  maxSteps?: number
  trace?: DeepSeekTrace | null
}

export type DeepSeekCallOpts = {
  tool_choice?: string
  response_format?: Record<string, unknown>
}

export type DeepSeekClient = {
  call: (
    messages: Msg[],
    temp?: number,
    max?: number,
    signal?: AbortSignal,
    opt?: DeepSeekCallOpts,
  ) => Promise<{ ok: boolean; text?: string; error?: string }>
  url: string
  model: string
  key: string
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

const mergeSignal = (a?: AbortSignal, b?: AbortSignal) => {
  if (!a && !b) {
    return undefined
  }

  if (a && b && typeof AbortSignal.any === "function") {
    return AbortSignal.any([a, b])
  }

  if (a && b) {
    const ctl = new AbortController()
    const stop = () => {
      if (ctl.signal.aborted) {
        return
      }

      ctl.abort()
    }

    a.addEventListener("abort", stop, { once: true })
    b.addEventListener("abort", stop, { once: true })

    if (a.aborted || b.aborted) {
      ctl.abort()
    }

    return ctl.signal
  }

  if (a) {
    return a
  }

  return b
}

const pickCalls = (v: unknown) => {
  const list = Array.isArray(v) ? v : []
  const out: ToolCall[] = []

  for (var i = 0; i < list.length; i++) {
    const it = list[i]
    const row = (it && typeof it === "object" ? it : null) as {
      id?: unknown
      type?: unknown
      function?: unknown
    } | null

    if (!row) {
      continue
    }

    const id0 = typeof row.id === "string" ? row.id : ""
    const id = id0.trim()
    const fn = (row.function && typeof row.function === "object" ? row.function : null) as {
      name?: unknown
      arguments?: unknown
    } | null
    const name0 = typeof fn?.name === "string" ? fn.name : ""
    const name = name0.trim()
    const args0 = typeof fn?.arguments === "string" ? fn.arguments : ""

    if (!id || !name) {
      continue
    }

    out.push({ id, type: "function", function: { name, arguments: args0 } })
  }

  return out
}

export const createDeepSeek = (base: string, key: string, model: string, opt?: DeepSeekOpts): DeepSeekClient => {
  const url = base.endsWith("/") ? `${base}v1/chat/completions` : `${base}/v1/chat/completions`
  const tools = Array.isArray(opt?.tools) ? opt?.tools ?? [] : []
  const runTool = typeof opt?.runTool === "function" ? opt?.runTool ?? null : null
  const trace = typeof opt?.trace === "function" ? opt?.trace ?? null : null
  const raw0 = (process.env.DEEPSEEK_MAX_STEPS ?? "").trim()
  const raw1 = raw0 || (process.env.DEEPSEEK_TOOL_STEPS ?? "").trim()
  const raw2 = raw1 || opt?.maxSteps
  const stepMax = limitFrom(raw2, 0, 2, 2000)
  const ds0 = (process.env.DEEPSEEK_TIMEOUT_MS ?? "").trim()
  const ds1 = ds0 || (process.env.REQUEST_TIMEOUT_MS ?? "").trim()
  const timeoutMs = numFrom(ds1, 120000, 5000, 180000)

const send = async (
    messages: DsMsg[],
    temp?: number,
    max?: number,
    signal?: AbortSignal,
    opt?: DeepSeekCallOpts,
  ): Promise<{ ok: boolean; msg?: DsMsg; raw?: unknown; error?: string }> => {
    const t0 = typeof temp === "number" ? temp : 0.3
    const body = {
      model,
      temperature: t0,
      messages,
      stream: false,
    } as {
      model: string
      temperature: number
      messages: DsMsg[]
      stream: boolean
      max_tokens?: number
      tools?: ToolDef[]
      tool_choice?: string
      response_format?: Record<string, unknown>
    }

    if (typeof max === "number" && max > 0) {
      body.max_tokens = max
    }

    if (tools.length) {
      body.tools = tools
      const choice0 = typeof opt?.tool_choice === "string" ? opt.tool_choice : ""
      const choice = choice0.trim()
      body.tool_choice = choice || "none"
    }

    const fmt = (opt?.response_format && typeof opt.response_format === "object" ? opt.response_format : null) as
      | Record<string, unknown>
      | null

    if (fmt) {
      body.response_format = fmt
    }

    const sig0 = AbortSignal.timeout(timeoutMs)
    const sig = mergeSignal(signal, sig0)
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: sig,
    }).catch(() => null)

    if (!r) {
      if (sig0.aborted) {
        return { ok: false, error: "DeepSeek timed out" }
      }
      if (signal?.aborted) {
        return { ok: false, error: "Request aborted" }
      }
      return { ok: false, error: "DeepSeek request failed" }
    }

    const ct = (r.headers.get("content-type") ?? "").toLowerCase()

    if (!ct.includes("application/json")) {
      const txt0 = await r.text().catch(() => "")
      const txt = (txt0 ?? "").slice(0, 2000).trim()
      return { ok: false, error: txt || `DeepSeek error (${r.status})` }
    }

    const c = r.clone()
    const out = (await r.json().catch(() => null)) as unknown

    if (!out) {
      const txt0 = await c.text().catch(() => "")
      const txt = (txt0 ?? "").slice(0, 2000).trim()
      return { ok: false, error: txt || "Bad response from DeepSeek" }
    }

    const oo = (out && typeof out === "object" ? out : null) as { choices?: unknown; error?: unknown } | null

    if (!r.ok) {
      const er = (oo?.error && typeof oo.error === "object" ? oo.error : null) as { message?: unknown } | null
      const em = typeof er?.message === "string" ? er.message : ""
      return { ok: false, error: em || `DeepSeek error (${r.status})` }
    }

    const cs = Array.isArray(oo?.choices) ? oo?.choices : []
    const c0 = cs[0]
    const c1 = (c0 && typeof c0 === "object" ? c0 : null) as { message?: unknown; text?: unknown } | null
    const mm = (c1?.message && typeof c1.message === "object" ? c1.message : null) as {
      content?: unknown
      tool_calls?: unknown
    } | null
    const txt0 = typeof mm?.content === "string" ? mm.content : typeof c1?.text === "string" ? c1.text : ""
    const calls = pickCalls(mm?.tool_calls)
    const msg: DsMsg = {
      role: "assistant",
      content: txt0,
      tool_calls: calls.length ? calls : undefined,
    }

    return { ok: true, msg, raw: out }
  }

  const call = async (messages: Msg[], temp?: number, max?: number, signal?: AbortSignal, opt?: DeepSeekCallOpts) => {
    var feed = messages.slice() as DsMsg[]
    const steps = tools.length && runTool ? stepMax : 1

    for (var step = 0; ; step++) {
      if (stepMax > 0 && step >= steps) {
        break
      }
      const res = await send(feed, temp, max, signal, opt)

      if (!res.ok) {
        const e0 = typeof res.error === "string" ? res.error : "DeepSeek error"
        return { ok: false, error: e0 }
      }

      if (trace) {
        await trace({ step, req: { messages: feed, tools }, res: res.raw })
      }

      const msg = res.msg ?? null

      if (!msg) {
        return { ok: false, error: "Bad response from DeepSeek" }
      }

      const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : []

      if (!calls.length) {
        const t0 = typeof msg.content === "string" ? msg.content : ""
        const t = t0.trim()

        if (!t) {
          return { ok: false, error: "Bad response from DeepSeek" }
        }

        return { ok: true, text: t0 }
      }

      if (!runTool) {
        return { ok: false, error: "Tool runner unavailable" }
      }

      feed.push(msg)

      for (var i = 0; i < calls.length; i++) {
        const call0 = calls[i]
        const name0 = typeof call0?.function?.name === "string" ? call0.function.name : ""
        const name = name0.trim()
        const raw0 = typeof call0?.function?.arguments === "string" ? call0.function.arguments : ""
        const raw = raw0.trim()
        const parsed = parseJson(raw)
        const args = (parsed && typeof parsed === "object" ? parsed : null) as Record<string, unknown> | null
        var out: unknown = { error: "Invalid tool arguments" }

        if (args && name) {
          out = await runTool(name, args, { id: call0.id })
        }

        if (!args || !name) {
          out = { error: "Invalid tool arguments" }
        }

        const content = typeof out === "string" ? out : JSON.stringify(out)
        feed.push({ role: "tool", tool_call_id: call0.id, content })
      }
    }

    if (stepMax > 0) {
      return { ok: true, text: "I hit the tool-use limit for this request and had to stop." }
    }

    return { ok: false, error: "Tool loop ended" }
  }

  return { call, url, model, key }
}
