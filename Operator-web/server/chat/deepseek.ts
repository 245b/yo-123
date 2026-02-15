import type { Msg, MsgPart } from "../types"
import {
  COMPACT_SUMMARY_PREFIX,
  COMPACT_SUMMARIZATION_PROMPT,
  COMPACT_USER_MESSAGE_MAX_TOKENS,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT,
} from "../agent/compaction"
import { estimateTokensFromMessages, latestUserMessages } from "../agent/history"

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

type CompactOutcome = {
  compacted: boolean
  messages: DsMsg[]
  beforeTokens: number
  afterTokens: number
  summary: string
  preservedUsers: CompactMsg[]
  nonProductive: boolean
}

type DsmlParse = {
  calls: ToolCall[]
  cleaned: string
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

const pickAttr = (attrs: string, key: string) => {
  const source0 = typeof attrs === "string" ? attrs : ""
  const source = source0.trim()

  if (!source) {
    return ""
  }

  const k0 = typeof key === "string" ? key : ""
  const k = k0.trim()

  if (!k) {
    return ""
  }

  const re = new RegExp(`${k}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i")
  const hit = source.match(re)

  if (!hit) {
    return ""
  }

  const a0 = typeof hit[1] === "string" ? hit[1] : ""
  const b0 = typeof hit[2] === "string" ? hit[2] : ""
  const a = a0.trim()
  const b = b0.trim()
  return a || b
}

const dsmlValue = (raw: string): unknown => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim()

  if (!text) {
    return ""
  }

  const head = text[0] ?? ""

  if (head === "{" || head === "[") {
    const parsed = parseJson(text)

    if (parsed !== null) {
      return parsed
    }
  }

  const lower = text.toLowerCase()

  if (lower === "true") {
    return true
  }

  if (lower === "false") {
    return false
  }

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const num = Number(text)

    if (Number.isFinite(num)) {
      return num
    }
  }

  return text
}

export const extractDsmlToolCalls = (raw: string): DsmlParse => {
  const text0 = typeof raw === "string" ? raw : ""

  if (!text0 || !text0.includes("DSML")) {
    return { calls: [], cleaned: text0 }
  }

  const invokeRe = /<\s*[|｜]DSML[|｜]\s*invoke\b([^>]*)>([\s\S]*?)<\/\s*[|｜]DSML[|｜]\s*invoke\s*>/gi
  const out: ToolCall[] = []
  var idx = 0

  for (;;) {
    const hit = invokeRe.exec(text0)

    if (!hit) {
      break
    }

    const attrs0 = typeof hit[1] === "string" ? hit[1] : ""
    const attrs = attrs0.trim()
    const name = pickAttr(attrs, "name")

    if (!name) {
      continue
    }

    const body0 = typeof hit[2] === "string" ? hit[2] : ""
    const body = body0.trim()
    const paramRe = /<\s*[|｜]DSML[|｜]\s*parameter\b([^>]*)>([\s\S]*?)<\/\s*[|｜]DSML[|｜]\s*parameter\s*>/gi
    const args: Record<string, unknown> = {}
    var seenParam = false

    for (;;) {
      const param = paramRe.exec(body)

      if (!param) {
        break
      }

      const pAttrs0 = typeof param[1] === "string" ? param[1] : ""
      const pAttrs = pAttrs0.trim()
      const key = pickAttr(pAttrs, "name")

      if (!key) {
        continue
      }

      seenParam = true
      const pRaw0 = typeof param[2] === "string" ? param[2] : ""
      args[key] = dsmlValue(pRaw0)
    }

    if (!seenParam && body) {
      const json = parseJson(body)
      const row = json && typeof json === "object" ? (json as Record<string, unknown> | null) : null

      if (row) {
        const keys = Object.keys(row)

        for (var i = 0; i < keys.length; i++) {
          const k = keys[i] ?? ""

          if (!k) {
            continue
          }

          args[k] = row[k]
        }
      }
    }

    const id = `dsml-${Date.now().toString(36)}-${idx.toString(36)}`
    out.push({
      id,
      type: "function",
      function: {
        name,
        arguments: JSON.stringify(args),
      },
    })
    idx += 1
  }

  if (!out.length) {
    return { calls: [], cleaned: text0 }
  }

  const dropCalls = text0.replace(
    /<\s*[|｜]DSML[|｜]\s*function_calls\s*>[\s\S]*?<\/\s*[|｜]DSML[|｜]\s*function_calls\s*>/gi,
    " ",
  )
  const dropInvokes = dropCalls.replace(
    /<\s*[|｜]DSML[|｜]\s*invoke\b[\s\S]*?<\/\s*[|｜]DSML[|｜]\s*invoke\s*>/gi,
    " ",
  )
  const dropTags = dropInvokes.replace(/<\s*\/?\s*[|｜]DSML[|｜][^>]*>/gi, " ")
  const squashed = dropTags.replace(/\n{3,}/g, "\n\n")
  return {
    calls: out,
    cleaned: squashed.trim(),
  }
}

type CompactMsg = {
  role: "system" | "user" | "assistant" | "tool"
  content: string
}

const toCompactMessages = (messages: DsMsg[]) => {
  const out: CompactMsg[] = []
  const list = Array.isArray(messages) ? messages : []

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row) {
      continue
    }

    const role0 = row.role
    const role =
      role0 === "system" || role0 === "user" || role0 === "assistant" || role0 === "tool"
        ? role0
        : "assistant"
    const content0 = typeof row.content === "string" ? row.content : ""
    const content = content0.trim()

    if (!content) {
      continue
    }

    out.push({ role, content })
  }

  return out
}

const toDsMessages = (messages: CompactMsg[]) => {
  const out: DsMsg[] = []
  const list = Array.isArray(messages) ? messages : []

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row) {
      continue
    }

    const content = row.content.trim()

    if (!content) {
      continue
    }

    out.push({ role: row.role, content })
  }

  return out
}

const defaultCompactionSummary = (messages: CompactMsg[]) => {
  const list = Array.isArray(messages) ? messages : []
  const keep = list.slice(Math.max(0, list.length - 8))
  const lines: string[] = []
  lines.push("Compaction summary:")

  for (var i = 0; i < keep.length; i++) {
    const row = keep[i]

    if (!row) {
      continue
    }

    const text0 = row.content.replace(/\s+/g, " ").trim()
    const text = text0.slice(0, 280)

    if (!text) {
      continue
    }

    lines.push(`- ${row.role}: ${text}`)
  }

  lines.push("- Continue from this checkpoint without redoing completed work.")
  return lines.join("\n")
}

const passthroughCompaction = (messages: DsMsg[]): CompactOutcome => {
  const compactMessages = toCompactMessages(messages)
  const tokens = estimateTokensFromMessages(compactMessages)
  return {
    compacted: false,
    messages,
    beforeTokens: tokens,
    afterTokens: tokens,
    summary: "",
    preservedUsers: [],
    nonProductive: false,
  }
}

export const createDeepSeek = (base: string, key: string, model: string, opt?: DeepSeekOpts): DeepSeekClient => {
  const url = base.endsWith("/") ? `${base}v1/chat/completions` : `${base}/v1/chat/completions`
  const tools = Array.isArray(opt?.tools) ? opt?.tools ?? [] : []
  const runTool = typeof opt?.runTool === "function" ? opt?.runTool ?? null : null
  const trace = typeof opt?.trace === "function" ? opt?.trace ?? null : null
  const raw0 = (process.env.DEEPSEEK_MAX_STEPS ?? "").trim()
  const raw1 = raw0 || (process.env.DEEPSEEK_TOOL_STEPS ?? "").trim()
  const raw2 = raw1 || opt?.maxSteps
  const stepMax0 = limitFrom(raw2, 256, 2, 2000)
  const stepMax = stepMax0 > 0 ? stepMax0 : 256
  const ds0 = (process.env.DEEPSEEK_TIMEOUT_MS ?? "").trim()
  const ds1 = ds0 || (process.env.REQUEST_TIMEOUT_MS ?? "").trim()
  const timeout0 = numFrom(ds1, 120000, 10000, 300000)
  const timeoutMs = timeout0 >= 90000 ? timeout0 : 90000
  const turnTimeoutMs = limitFrom(process.env.DEEPSEEK_TURN_TIMEOUT_MS ?? "", 0, 30000, 3600000)
  const contextWindow = numFrom(process.env.DEEPSEEK_CONTEXT_WINDOW ?? "", DEFAULT_CONTEXT_WINDOW, 16000, 2000000)
  const effectivePercent = numFrom(
    process.env.DEEPSEEK_EFFECTIVE_CONTEXT_WINDOW_PERCENT ?? "",
    DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT,
    50,
    100,
  )
  const effectiveContextWindow = Math.floor((contextWindow * effectivePercent) / 100)
  const autoCompactLimit = numFrom(
    process.env.DEEPSEEK_AUTO_COMPACT_TOKEN_LIMIT ?? "",
    Math.floor(contextWindow * 0.9),
    1000,
    contextWindow,
  )

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
    const dsml = calls.length ? { calls: [] as ToolCall[], cleaned: txt0 } : extractDsmlToolCalls(txt0)
    const nextCalls = calls.length ? calls : dsml.calls
    const nextContent = nextCalls.length ? dsml.cleaned : txt0
    const msg: DsMsg = {
      role: "assistant",
      content: nextContent,
      tool_calls: nextCalls.length ? nextCalls : undefined,
    }

    return { ok: true, msg, raw: out }
  }

  const summarizeCompaction = async (messages: CompactMsg[], signal?: AbortSignal) => {
    const compactInput = JSON.stringify(
      {
        context_window: contextWindow,
        effective_context_window: effectiveContextWindow,
        auto_compact_limit: autoCompactLimit,
        messages,
      },
      null,
      2,
    )
    const req: DsMsg[] = [
      { role: "system", content: COMPACT_SUMMARIZATION_PROMPT },
      { role: "user", content: `Conversation transcript for compaction:\n${compactInput}` },
    ]
    const res = await send(req, 0.2, 1800, signal, { tool_choice: "none" }).catch(() => ({
      ok: false,
      error: "Compaction summary call failed",
      msg: undefined,
    }))

    if (!res.ok) {
      return defaultCompactionSummary(messages)
    }

    const txt0 = typeof res.msg?.content === "string" ? res.msg.content : ""
    const txt = txt0.trim()

    if (!txt) {
      return defaultCompactionSummary(messages)
    }

    return txt
  }

  const maybeCompact = async (messages: DsMsg[], signal?: AbortSignal) => {
    const compactMessages = toCompactMessages(messages)
    const beforeTokens = estimateTokensFromMessages(compactMessages)

    if (beforeTokens < autoCompactLimit) {
      return {
        compacted: false,
        messages,
        beforeTokens,
        afterTokens: beforeTokens,
        summary: "",
        preservedUsers: [] as CompactMsg[],
        nonProductive: false,
      }
    }

    const summary = await summarizeCompaction(compactMessages, signal)
    const systems = compactMessages.filter((row) => row.role === "system")
    const recentUsers = latestUserMessages(compactMessages, COMPACT_USER_MESSAGE_MAX_TOKENS)
    const compacted = systems
      .concat(recentUsers)
      .concat([{ role: "user", content: `${COMPACT_SUMMARY_PREFIX}\n${summary}` as string }])
    const ds = toDsMessages(compacted)
    const afterTokens = estimateTokensFromMessages(compacted)
    const nonProductive = afterTokens >= beforeTokens
    return {
      compacted: true,
      messages: ds,
      beforeTokens,
      afterTokens,
      summary,
      preservedUsers: recentUsers,
      nonProductive,
    }
  }

  const forceFinalAnswer = async (
    feed: DsMsg[],
    temp?: number,
    max?: number,
    signal?: AbortSignal,
    opt?: DeepSeekCallOpts,
  ) => {
    const finalPrompt =
      "Tool execution budget has been reached for this turn. Stop calling tools and provide the best final answer now from collected outputs."
    const finalFeed = feed.concat([
      {
        role: "system",
        content: finalPrompt,
      },
    ])
    const finalRes = await send(finalFeed, temp, max, signal, {
      tool_choice: "none",
      response_format: opt?.response_format,
    }).catch(() => ({
      ok: false,
      error: "DeepSeek finalization request failed",
      msg: undefined,
      raw: undefined,
    }))

    if (!finalRes.ok) {
      return { ok: false, error: finalRes.error || "DeepSeek finalization failed" }
    }

    const txt0 = typeof finalRes.msg?.content === "string" ? finalRes.msg.content : ""
    const txt = txt0.trim()

    if (!txt) {
      return { ok: false, error: "DeepSeek finalization returned empty response" }
    }

    return { ok: true, text: txt0 }
  }

  const call = async (messages: Msg[], temp?: number, max?: number, signal?: AbortSignal, opt?: DeepSeekCallOpts) => {
    var feed = messages.slice() as DsMsg[]
    const steps = tools.length && runTool ? stepMax : 1
    const startedAt = Date.now()
    var compactionEnabled = true

    for (var step = 0; ; step++) {
      if (turnTimeoutMs > 0 && Date.now() - startedAt >= turnTimeoutMs) {
        const forcedByTime = await forceFinalAnswer(feed, temp, max, signal, opt)

        if (forcedByTime.ok) {
          return { ok: true, text: forcedByTime.text }
        }

        return { ok: false, error: forcedByTime.error || "Turn timed out before completion" }
      }

      if (step >= steps) {
        const forcedByStep = await forceFinalAnswer(feed, temp, max, signal, opt)

        if (forcedByStep.ok) {
          return { ok: true, text: forcedByStep.text }
        }

        return { ok: false, error: forcedByStep.error || "Tool loop budget reached" }
      }

      const pre = compactionEnabled ? await maybeCompact(feed, signal) : passthroughCompaction(feed)
      feed = pre.messages

      if (pre.nonProductive) {
        compactionEnabled = false
      }

      if (pre.compacted && trace) {
        await trace({
          step,
          req: {
            type: "context_compacted",
            trigger: "pre_turn",
            before_tokens: pre.beforeTokens,
            after_tokens: pre.afterTokens,
            summary: pre.summary,
            latest_summary: pre.summary,
            preserved_user_messages: pre.preservedUsers,
            context_window: contextWindow,
            effective_context_window: effectiveContextWindow,
            auto_compact_limit: autoCompactLimit,
          },
          res: {},
        })
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

      const post = compactionEnabled ? await maybeCompact(feed, signal) : passthroughCompaction(feed)
      feed = post.messages

      if (post.nonProductive) {
        compactionEnabled = false
      }

      if (post.compacted && trace) {
        await trace({
          step,
          req: {
            type: "context_compacted",
            trigger: "post_sampling",
            before_tokens: post.beforeTokens,
            after_tokens: post.afterTokens,
            summary: post.summary,
            latest_summary: post.summary,
            preserved_user_messages: post.preservedUsers,
            context_window: contextWindow,
            effective_context_window: effectiveContextWindow,
            auto_compact_limit: autoCompactLimit,
          },
          res: {},
        })
      }
    }

    const forced = await forceFinalAnswer(feed, temp, max, signal, opt)

    if (forced.ok) {
      return { ok: true, text: forced.text }
    }

    return { ok: false, error: forced.error || "Tool loop ended" }
  }

  return { call, url, model, key }
}
