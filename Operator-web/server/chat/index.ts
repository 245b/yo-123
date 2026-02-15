import type { Msg } from "../types"
import { body } from "../utils/http"
import { clean, clip } from "../utils/text"
import { loadEnv } from "../env"
import { createLogger } from "../logs"
import { readDeepSeekApiKey } from "./key"
import { parseMessages } from "./messages"
import { lastUserText, pickLang, translate, translateMessages } from "./lang"
import { createDeepSeek } from "./deepseek"
import { kind, pickPlace } from "../web"
import { composeInstructionLayers, readAgentsInstructions } from "../agent/instructions"
import { createToolRuntime, runHelloSiteFallback as runHelloSiteFallbackTool } from "./tool-runtime"
import { execTools } from "./exec-tools"

import {
  appendInst,
  isFileBuildIntent,
  isLookupIntent,
  noSourcesMessage,
  termEntries,
} from "./helpers-core"
import type {
  DiagnosticResult,
  DiagnosticStage,
  FailureContext,
  PlanOut,
  ToolResult,
} from "./helpers-core"
import {
  buildFailureContext,
  generateModelDiagnostic,
  isInvalidAssistantText,
  sanitizeFailureReason,
  toolFailureRows,
} from "./helpers-diagnostics"
import {
  lookupType,
  makeLookupPlan,
  parsePlan,
} from "./helpers-plan"
import {
  appendSources,
  citeAll,
  deny,
  enforceStyle,
  envBool,
  fetchFail,
  hadLookup,
  normalizeQuery,
  numEnv,
  pickUrls,
} from "./helpers-style"

var envLoaded = false
var agentsCache = ""
var agentsCacheRoot = ""

export type ChatDeps = {
  root: string
  corsHeaders: HeadersInit
  json: (v: unknown, st?: number) => Response
  bad: (msg: string, st?: number) => Response
}

export const createChatHandler = (deps: ChatDeps) => {
  const logger = createLogger(deps.root)

  return async (req: Request) => {
    if (!envLoaded) {
      await loadEnv(deps.root)
      envLoaded = true
    }

    if (!agentsCache || agentsCacheRoot !== deps.root) {
      const loaded = await readAgentsInstructions(deps.root).catch(() => "")
      agentsCache = clean(loaded)
      agentsCacheRoot = deps.root
    }

    const searchMode0 = clean(process.env.SEARCH_MODE ?? "")
    const searchMode = (searchMode0 || "terminal").toLowerCase()
    const terminalOnly = searchMode === "terminal"
    const termRuntime = true

    const pf0 = clean(process.env.TOOL_PREFLIGHT ?? "")
    const pf1 = pf0.toLowerCase()
    var preflightOn = true

    if (pf1) {
      if (pf1 === "0") {
        preflightOn = false
      }

      if (pf1 === "false") {
        preflightOn = false
      }

      if (pf1 === "off") {
        preflightOn = false
      }
    }

    const allowEnv = envBool(clean(process.env.ALLOW_TERMINAL_EXEC ?? ""))
    const webBudget = numEnv(process.env.TOOL_BUDGET_WEB ?? "", 2, 0, 20)
    const termBudget = numEnv(process.env.TOOL_BUDGET_TERMINAL ?? "", 3, 0, 50)

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
      mode?: unknown
      chatId?: unknown
      sessionId?: unknown
      allow_terminal_exec?: unknown
    } | null

    if (!o) {
      return deps.bad("Invalid JSON body")
    }

    const msg0 = typeof o.msg === "string" ? o.msg : ""
    const msg = msg0.slice(0, 8000).trim()
    const msgs = msg ? [{ role: "user", content: msg } as Msg] : parseMessages(o.messages)
    if (!msgs.length) {
      return deps.bad("Missing messages")
    }

    const allowReq = o.allow_terminal_exec === true
    const allowExec = allowEnv && (allowReq || terminalOnly)

    const cid0 = typeof o.chatId === "string" ? o.chatId : ""
    const cid = cid0.trim()
    const sid0 = typeof o.sessionId === "string" ? o.sessionId : ""
    const sid1 = sid0.trim()
    const envSid0 = (process.env.TERM_SESSION_ID ?? "").trim()
    const sid = envSid0 || sid1 || cid || "operator"
    const strict = false
    const last = lastUserText(msgs)
    const lang = pickLang(last)
    const basePolicy =
      "Style: friendly, clear, and direct. Warm: 3/10. Enthusiastic: 2/10. Emoji: never. Formatting: plain text by default; use minimal structure only when needed. " +
      "Use plain, natural language and short sentences. Sound like a helpful human, not a script. " +
      "No bold or decorative formatting. No shouty caps. No manufactured urgency or false certainty. " +
      "Avoid filler, hype, or vague generalities. If you are unsure, say so plainly. " +
      "Do not quote or repeat the user's message verbatim unless they explicitly ask you to. Do not say the word \"Hey\" unless the user used it first. " +
      "Be honest about limits and uncertainty; if you cannot verify or fetch something, explain why in simple terms and suggest a next step. " +
      "Ask a brief clarifying question when the request is ambiguous. Keep answers concise unless the user asks for detail. " +
      "Do not claim to be an AI or mention being a model."
    const sourceStrict =
      "For factual or time-sensitive questions, rely on any provided lookup context before answering. " +
      "If lookup data is missing or unclear, say so plainly and ask for a specific link or detail. " +
      "Use reliable sources and cite them when they are provided. Do not invent citations. " +
      "Cross-check across independent sources when possible and do not claim certainty without corroboration."
    const sourceAuto =
      "Use citations only when lookup results are provided. Do not fabricate citations. " +
      "For time-sensitive claims, prefer the provided lookup context and say when you cannot verify."
    const policy = strict ? `${basePolicy} ${sourceStrict}` : `${basePolicy} ${sourceAuto}`
    const truthLine = strict
      ? "Be strictly truthful. Do not guess. If lookup data is missing or unclear, say you cannot determine it."
      : "Be strictly truthful. Do not guess. If a question depends on up-to-date info and lookup data is missing, say you cannot determine it."
    const lookupLine = terminalOnly
      ? allowExec
        ? "Terminal-only mode: use fs_* tools for file operations and project_* tools for installs/runs. Use terminal_exec for local inspection (ls, rg, cat). For any search or web lookup, you MUST run terminal_exec with mcp-search before answering. For research/exploration, prefer mcp-search --provider both --max 10 \"query\" to gather DDG + YouTube context. For YouTube-focused context, use mcp-search --provider yt --max 10 \"topic or YouTube URL\". For docs/library lookup, use mcp-search --provider ctx7 \"query\". Do not use built-in web lookup tools. Never output shell command blocks in the final answer; execute tools and report results."
        : "Terminal-only mode: terminal tools are disabled for this request. You cannot run terminal commands or searches. If the user asks for terminal work, explain how to enable it."
      : "Web lookup is handled by the system when needed. If lookup context is provided, use it and cite sources. If it is missing, answer from general knowledge and say what you cannot verify."
    const newsLine =
      terminalOnly && allowExec
        ? "For news or current events (latest, today, this week), first run terminal_exec with a date command (for example: date -u +%Y-%m-%d). Then include that date in the mcp-search query."
        : ""
    const termAccess = allowExec
      ? "Terminal tools are enabled for this request."
      : "Terminal tools are disabled for this request. Do not request terminal_* tools. If the user asks for terminal work, say it can be enabled by setting ALLOW_TERMINAL_EXEC=1 (and allow_terminal_exec=true for API clients)."
    const toolGuide = terminalOnly
      ? allowExec
        ? [
            "Tools you may call:",
            "session_ensure: ensure a terminal session exists (use first when in doubt).",
            "terminal_exec: run a shell command (use for ls, rg, cat, mcp-search; use --provider both or --provider yt for research contexts).",
            "terminal_capture: capture recent terminal output.",
            "terminal_send: send keys to an interactive terminal.",
            "fs_*: file operations (read/write/list/move/copy/delete/patch).",
            "project_*: project install/run/test/setup/detect.",
            "editor_open: open a file in the editor.",
            "Why: use tools only to verify, fetch, or inspect; avoid tools for pure reasoning.",
          ].join(" ")
        : [
            "Tools you may call: none (terminal tools are disabled for this request).",
            "Why: tool execution is gated; answer without tools and explain how to enable if needed.",
          ].join(" ")
      : [
          "Tools you may call:",
          "web|news|docs|time: use only when you need fresh information.",
          "session_ensure, terminal_* (if enabled), fs_*, project_*, editor_open: use for local inspection or file operations.",
          "Why: use tools only when necessary; do not tool-call for pure reasoning.",
        ].join(" ")
    const toolLine =
      "Do not use tools unless you have already reasoned and determined they are necessary; never search for pure reasoning tasks. After each tool result, read the output and decide the next step from that output before calling another tool. If the output already answers the request, stop tool use and answer directly. Operate as a persistent problem solver: when a tool fails, diagnose the failure, adjust the approach, and retry until blocked by permissions, missing secrets, or explicit user stop. If terminal tools return Unknown process_id or Unknown process, run session_ensure, create a new interactive shell with terminal_exec and tty=true, then continue the task. For explicit web/current-events lookup tasks, use date and mcp-search only; do not run filesystem listing commands. For research requests, prefer mcp-search --provider both and allow up to --max 10 when broader YouTube context is helpful. After successful file-write/create operations, run fs_list with path='.' to confirm created files and mention that confirmation in your final reasoning."
    const developerInst = clean(process.env.OPERATOR_DEVELOPER_INSTRUCTIONS ?? "")
    const permissionsInst = clean(process.env.OPERATOR_PERMISSIONS_INSTRUCTIONS ?? "")
    const collaborationInst = clean(process.env.OPERATOR_COLLABORATION_MODE ?? "Default")
    const envContext = JSON.stringify({
      cwd: deps.root,
      chatId: cid,
      sessionId: sid,
      mode: terminalOnly ? "terminal" : "chat",
      allow_terminal_exec: allowExec,
    })
    const layer = (baseInstructions: string) =>
      composeInstructionLayers({
        cwd: deps.root,
        baseInstructions,
        developerInstructions: developerInst,
        collaborationInstructions: collaborationInst,
        userInstructions: agentsCache,
        permissionsText: permissionsInst,
        environmentContext: envContext,
      })

    const instBase = [
      "Reply only in English. Do not include other languages.",
      policy,
      truthLine,
      lookupLine,
      newsLine,
      termAccess,
      toolGuide,
      toolLine,
      strict
        ? "Use only the provided lookup results. If they are insufficient, say so."
        : "If lookup results are provided, use them. If not, answer from general knowledge and state uncertainty when needed.",
    ].join(" ")
    const planInstBase = [
      "Reply only in English. Do not include other languages.",
      policy,
      truthLine,
      termAccess,
      toolGuide,
      "For news/current events, include today's date (YYYY-MM-DD) in each search query.",
      "For research or exploratory retrieval, prefer mcp-search with inputs.query using --provider both --max 10 to combine DDG and YouTube transcript context.",
      "If the user asks to search the web or mentions current events, you MUST include tool_requests with concise search queries. Do not copy the user's message verbatim.",
      "If the user asks to create/edit files or run project commands, you MUST include fs_* or project_* or terminal_exec tool_requests. Do not leave tool_requests empty.",
      "Never put shell commands or terminal transcripts in answer_draft. Use tool_requests for execution and keep answer_draft user-facing.",
      "Planning step. Tools are disabled in this call.",
      "Return ONLY valid JSON. Do not use markdown.",
      "Schema:",
      '{"task_type":"reasoning|retrieval|execution|mixed","steps":[{"id":1,"action":"...","needs":"none|web|terminal"}],"tool_requests":[{"step_id":1,"tool":"web|news|docs|time|fs_*|project_*|terminal_*|editor_open|session_ensure","why":"...","inputs":{}}],"answer_draft":"..."}',
      "If no tools are needed, keep tool_requests empty and put the final answer in answer_draft.",
      "Use the minimum tools needed and be explicit about why. For retrieval, prefer 2-3 short queries in inputs.queries.",
    ].join(" ")
    const finalInstBase =
      "Tools are disabled for this response. Use any provided tool results and answer now. If files were created or edited, confirm them by citing the session folder fs_list output."
    const inst = layer(instBase)
    const planInst = layer(planInstBase)
    const replanInst = layer(
      `${planInstBase} Tools are not permitted for reasoning tasks. Remove tool_requests and answer in answer_draft.`,
    )
    const finalInst = layer(finalInstBase)

    var send = msgs

    if (lang !== "English") {
      send = await translateMessages(msgs, lang)
    }

    var query = clip(clean(last), 240)

    if (lang !== "English") {
      const q0 = await translate(query, "English")

      if (q0) {
        query = clip(clean(q0), 240)
      }
    }

    const timeKind = kind(query)
    const lookupKind = lookupType(query)
    const lookupIntent = isLookupIntent(query)
    const fileBuildIntent = isFileBuildIntent(query)
    const timePlace = timeKind === "time" ? pickPlace(query) : ""
    const timeLocal = timeKind === "time" && !timePlace

    const acc0 = req.headers.get("accept") ?? ""
    const acc = acc0.toLowerCase()
    const stream0 = acc.includes("text/event-stream") || (req.headers.get("x-stream") ?? "") === "1"
    const stream = stream0 && lang === "English"

    const model0 = typeof o.model === "string" ? o.model : ""
    const m0 = model0.trim()
    const env = (process.env.DEEPSEEK_MODEL ?? "").trim()
    var model = m0 || env || "deepseek-chat"

    const base0 = (process.env.DEEPSEEK_BASE_URL ?? "").trim()
    const base = base0 || "https://api.deepseek.com"
    var emitTerm = (_: { phase: "start" | "update" | "done" | "error"; tool: string; id: string; args?: unknown; result?: unknown }) => {}
    const runtimeTools = createToolRuntime({
      termRuntime,
      terminalOnly,
      allowExec,
      lookupIntent,
      lookupKind,
      fileBuildIntent,
      query,
      sid,
      cid,
      model,
      logger,
      getEmitTerm: () => emitTerm,
    })
    const termTools = runtimeTools.termTools
    const runTool = runtimeTools.runTool
    const runHelloSiteFallback = async () =>
      runHelloSiteFallbackTool({
        terminalOnly,
        allowExec,
        runTool,
        query,
      })

    const trace = async (evt: { step: number; req: unknown; res: unknown }) => {
      const data = {
        ts: new Date().toISOString(),
        chatId: cid,
        sessionId: sid,
        model,
        step: evt.step,
        request: evt.req,
        response: evt.res,
      }
      await logger.write("logs", "deepseek_call", data).catch(() => {})
    }
    const client = createDeepSeek(base, key, model, { trace, tools: termTools, runTool })
    const clientPlain = createDeepSeek(base, key, model, { trace })
    const modelFailure = async (
      stage: DiagnosticStage,
      reason: string,
      streamFail: boolean,
      hasToolPlan?: boolean,
      toolResults?: ToolResult[],
    ) => {
      const fail = buildFailureContext({
        stage,
        reason,
        query,
        stream: streamFail,
        model,
        chatId: cid,
        sessionId: sid,
        hasToolPlan,
        toolResults,
      })
      const out = await generateModelDiagnostic(fail, clientPlain.call, sig)
      const failed = toolFailureRows(fail.toolResults)

      await logger
        .write("logs", "model_failure_diagnostic", {
          ts: new Date().toISOString(),
          chatId: cid,
          sessionId: sid,
          model,
          reason: fail.reason,
          stage: out.diagnostic.stage,
          source: out.diagnostic.source,
          stream: streamFail,
          hasToolPlan: fail.hasToolPlan,
          failed,
        })
        .catch(() => {})

      return { fail, out }
    }
    const modelFailureCtx = (fail: FailureContext, out: DiagnosticResult, transport: "stream" | "json") => ({
      type: "model_failure",
      stage: out.diagnostic.stage,
      source: out.diagnostic.source,
      reason: fail.reason,
      transport,
    })
    const timeFromClock = () => {
      const zone0 = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""
      const zone = zone0.trim() || "UTC"
      const when = new Date()
      const time = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(when)
      const date = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(when)
      const iso = `${date} ${time} ${zone}`
      return { ok: true, text: `Current server time: ${iso}` }
    }

    const runPlan = async (list: Msg[], signal?: AbortSignal, denyTools?: boolean, forceFileOps?: boolean) => {
      if (!preflightOn) {
        return { ok: false, raw: "" }
      }

      var inst0 = denyTools ? replanInst : planInst

      if (!denyTools && forceFileOps) {
        inst0 =
          `${planInst} ` +
          "The user asked for file/project creation or edits. You MUST return at least one fs_* or project_* or terminal_exec tool_request. " +
          "Do not leave tool_requests empty."
      }
      const feed = appendInst(list, inst0)
      const res = await clientPlain
        .call(feed, 0.2, undefined, signal, { tool_choice: "none", response_format: { type: "json_object" } })
        .catch((err) => {
          const row = err && typeof err === "object" ? (err as { message?: unknown } | null) : null
          const m0 = typeof row?.message === "string" ? row.message : ""
          const m1 = m0.trim()
          const m = m1 || "Plan failed"
          return { ok: false, error: m, text: "" }
        })

      if (!res.ok) {
        return { ok: false, raw: "" }
      }

      const txt0 = typeof res.text === "string" ? res.text : ""
      const txt = txt0.trim()

      if (!txt) {
        return { ok: false, raw: "" }
      }

      const plan = parsePlan(txt)

      if (!plan) {
        return { ok: false, raw: txt0 }
      }

      return { ok: true, plan, raw: txt0 }
    }

    await logger
      .write("transcripts", "chat_request", {
      ts: new Date().toISOString(),
      chatId: cid,
      sessionId: sid,
      model,
      messages: msgs,
      mode: typeof o.mode === "string" ? o.mode : "",
      })
      .catch(() => {})

    if (stream) {
      return deps.bad("SSE streaming is removed. Use /api/chat/ws for streaming events.", 406)
    }

    if (timeLocal) {
      const base = timeFromClock()
      var txt = typeof base.text === "string" ? base.text : ""
      txt = txt.trim()

      if (!txt) {
        return deps.bad("Time lookup failed", 502)
      }

      if (lang !== "English" && !strict) {
        const t0 = await translate(txt, lang)

        if (t0) {
          txt = t0
        }
      }

      await logger
        .write("transcripts", "chat_response", {
          ts: new Date().toISOString(),
          chatId: cid,
          sessionId: sid,
          model,
          text: txt,
          ctx: { type: "time", source: "server" },
        })
        .catch(() => {})

      return deps.json({ ok: true, text: txt, model })
    }

    const fileOut = await runHelloSiteFallback()

    if (fileOut) {
      var txt = fileOut.text

      if (lang !== "English" && !strict) {
        const t0 = await translate(txt, lang)

        if (t0) {
          txt = t0
        }
      }

      await logger
        .write("transcripts", "chat_response", {
          ts: new Date().toISOString(),
          chatId: cid,
          sessionId: sid,
          model,
          text: txt,
          ctx: fileOut.ctx,
        })
        .catch(() => {})

      const terms = termEntries(fileOut.results)
      return deps.json({ ok: true, text: txt, model, terms })
    }

    var plan: PlanOut | null = null

    if (preflightOn) {
      const p0 = await runPlan(send, sig)

      if (p0.ok && p0.plan) {
        plan = p0.plan
      }

      if (!p0.ok && p0.raw) {
        await logger
          .write("logs", "plan_parse_error", {
            ts: new Date().toISOString(),
            chatId: cid,
            sessionId: sid,
            model,
            raw: p0.raw,
          })
          .catch(() => {})
      }
    }

    if (plan && plan.task_type === "reasoning" && plan.tool_requests.length) {
      const p1 = await runPlan(send, sig, true)

      if (p1.ok && p1.plan) {
        plan = p1.plan
      }

      if (plan && plan.task_type === "reasoning" && plan.tool_requests.length) {
        plan.tool_requests = []
      }
    }

    if (terminalOnly && allowExec && fileBuildIntent && (!plan || !plan.tool_requests.length)) {
      const p2 = await runPlan(send, sig, false, true)

      if (p2.ok && p2.plan) {
        plan = p2.plan
      }
    }

    if (terminalOnly && allowExec && lookupIntent && lookupKind && (!plan || !plan.tool_requests.length)) {
      plan = makeLookupPlan(query, lookupKind)
    }

    if (plan && !plan.tool_requests.length && isInvalidAssistantText(plan.answer_draft)) {
      plan.answer_draft = ""
    }

    if (plan && !plan.tool_requests.length) {
      const draft0 = typeof plan.answer_draft === "string" ? plan.answer_draft : ""
      var txt = draft0.trim()

      if (isInvalidAssistantText(txt)) {
        txt = ""
      }

      if (txt) {
        if (lang !== "English" && !strict) {
          const t0 = await translate(txt, lang)

          if (t0) {
            txt = t0
          }
        }

        const ctx = null
        const urls = pickUrls(ctx)

        if (strict) {
          const m1 = fetchFail(ctx)

          if (m1) {
            return deps.json({ ok: true, text: m1, model })
          }

          const msg = deny(ctx, last)

          if (msg) {
            return deps.json({ ok: true, text: msg, model })
          }

          if (!urls.length) {
            const msg = noSourcesMessage(last, hadLookup(ctx))
            return deps.json({ ok: true, text: msg, model })
          }

          txt = enforceStyle(txt)
          txt = citeAll(txt, urls)
        } else if (urls.length) {
          txt = appendSources(txt, urls)
        }

        if (!txt) {
          const info = await modelFailure("reasoning", "Model returned no assistant response text.", false, false, [])

          await logger
            .write("transcripts", "chat_response", {
              ts: new Date().toISOString(),
              chatId: cid,
              sessionId: sid,
              model,
              text: info.out.text,
              ctx: modelFailureCtx(info.fail, info.out, "json"),
            })
            .catch(() => {})

          return deps.json({ ok: true, text: info.out.text, model, diagnostic: info.out.diagnostic })
        }

        await logger
          .write("transcripts", "chat_response", {
            ts: new Date().toISOString(),
            chatId: cid,
            sessionId: sid,
            model,
            text: txt,
            ctx,
          })
          .catch(() => {})

        return deps.json({ ok: true, text: txt, model })
      }
    }

    const hasToolReq = !!(plan && plan.tool_requests.length)
    const toolPlan = hasToolReq ? plan : null
    const toolOut = await execTools({
      plan: toolPlan,
      runTool,
      terminalOnly,
      allowExec,
      webBudget,
      termBudget,
      query,
    })
    const failStage: DiagnosticStage = hasToolReq || toolOut.results.length ? "execution" : "reasoning"
    const terms = termEntries(toolOut.results)
    var feed = appendInst(send, inst)
    feed = appendInst(feed, finalInst)

    if (toolOut.note) {
      feed = appendInst(feed, toolOut.note)
    }

    if (hasToolReq && toolPlan) {
      feed = appendInst(feed, `Plan JSON: ${JSON.stringify(toolPlan)}`)
    }

    if (hasToolReq && toolPlan && toolPlan.answer_draft) {
      feed = appendInst(feed, `Plan answer_draft (internal only; do not mention): ${toolPlan.answer_draft}`)
    }

    if (toolOut.results.length) {
      feed = appendInst(feed, `Tool results: ${JSON.stringify(toolOut.results)}`)
    }

    const retryFeed = appendInst(
      feed,
      "Your previous response was invalid. Return one normal user-facing answer now. Do not output shell commands, terminal transcripts, tool names, JSON, or diagnostics.",
    )
    const retryText = async () => {
      const row = await clientPlain.call(retryFeed, 0.2, undefined, sig, { tool_choice: "none" }).catch(() => ({
        ok: false,
        text: "",
      }))
      const t0 = typeof row.text === "string" ? row.text : ""
      const t = t0.trim()

      if (!row.ok || !t) {
        return ""
      }

      if (isInvalidAssistantText(t)) {
        return ""
      }

      return t0
    }

    const res = await clientPlain.call(feed, 0.2, undefined, sig, { tool_choice: "none" }).catch((err) => {
      const row = err && typeof err === "object" ? (err as { message?: unknown } | null) : null
      const m0 = typeof row?.message === "string" ? row.message : ""
      const m1 = m0.trim()
      const m = m1 || "Request failed"
      return { ok: false, error: m, text: "" }
    })
    var txt = ""

    if (!res.ok) {
      const eRaw = typeof res.error === "string" ? res.error : "DeepSeek error"
      txt = await retryText()

      if (!txt) {
        const e0 = sanitizeFailureReason(eRaw)
        const info = await modelFailure(failStage, e0, false, hasToolReq, toolOut.results)

        await logger
          .write("transcripts", "chat_response", {
            ts: new Date().toISOString(),
            chatId: cid,
            sessionId: sid,
            model,
            text: info.out.text,
            ctx: modelFailureCtx(info.fail, info.out, "json"),
          })
          .catch(() => {})

        return deps.json({ ok: true, text: info.out.text, model, terms, diagnostic: info.out.diagnostic })
      }
    }

    if (!txt) {
      txt = typeof res.text === "string" ? res.text : ""
    }

    if (isInvalidAssistantText(txt)) {
      txt = await retryText()
    }

    if (isInvalidAssistantText(txt)) {
      const info = await modelFailure(
        failStage,
        "Model returned an invalid non-user-facing response.",
        false,
        hasToolReq,
        toolOut.results,
      )

      await logger
        .write("transcripts", "chat_response", {
          ts: new Date().toISOString(),
          chatId: cid,
          sessionId: sid,
          model,
          text: info.out.text,
          ctx: modelFailureCtx(info.fail, info.out, "json"),
        })
        .catch(() => {})

      return deps.json({ ok: true, text: info.out.text, model, terms, diagnostic: info.out.diagnostic })
    }

    const ctx = toolOut.ctx
    const urls = pickUrls(ctx)

    if (lang !== "English" && !strict) {
      const t0 = await translate(txt, lang)

      if (t0) {
        txt = t0
      }
    }

    if (strict) {
      const m1 = fetchFail(ctx)

      if (m1) {
        return deps.json({ ok: true, text: m1, model, terms })
      }

      const msg = deny(ctx, last)

      if (msg) {
        return deps.json({ ok: true, text: msg, model, terms })
      }

      if (!urls.length) {
        const msg = noSourcesMessage(last, hadLookup(ctx))
        return deps.json({ ok: true, text: msg, model, terms })
      }

      txt = enforceStyle(txt)
      txt = citeAll(txt, urls)
    } else if (urls.length) {
      txt = appendSources(txt, urls)
    }

    if (!txt) {
      const info = await modelFailure(failStage, "Model returned no assistant response text.", false, hasToolReq, toolOut.results)

      await logger
        .write("transcripts", "chat_response", {
          ts: new Date().toISOString(),
          chatId: cid,
          sessionId: sid,
          model,
          text: info.out.text,
          ctx: modelFailureCtx(info.fail, info.out, "json"),
        })
        .catch(() => {})

      return deps.json({ ok: true, text: info.out.text, model, terms, diagnostic: info.out.diagnostic })
    }

    await logger
      .write("transcripts", "chat_response", {
        ts: new Date().toISOString(),
        chatId: cid,
        sessionId: sid,
        model,
        text: txt,
        ctx,
      })
      .catch(() => {})
    return deps.json({ ok: true, text: txt, model, terms })
  }
}
