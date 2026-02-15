import type { Msg } from "../types"
import { clean } from "../utils/text"
import type { DiagnosticResult, DiagnosticStage, FailureContext, FailureTool, ToolResult } from "./helpers-core"


const stageLabel = (stage: DiagnosticStage) => {
  if (stage === "reasoning") {
    return "reasoning"
  }

  if (stage === "tool_selection") {
    return "tool selection"
  }

  if (stage === "execution") {
    return "tool execution"
  }

  return "runtime environment"
}

const toolInputLabel = (raw: unknown) => {
  const row = (raw && typeof raw === "object" ? raw : null) as {
    command?: unknown
    keys?: unknown
    path?: unknown
    root?: unknown
    url?: unknown
  } | null

  if (!row) {
    return ""
  }

  const cmd0 = typeof row.command === "string" ? row.command : ""
  const cmd = clean(cmd0)

  if (cmd) {
    return `command=${cmd}`
  }

  const keys0 = typeof row.keys === "string" ? row.keys : ""
  const keys = clean(keys0)

  if (keys) {
    return `keys=${keys}`
  }

  const path0 = typeof row.path === "string" ? row.path : ""
  const path = clean(path0)

  if (path) {
    return `path=${path}`
  }

  const root0 = typeof row.root === "string" ? row.root : ""
  const root = clean(root0)

  if (root) {
    return `root=${root}`
  }

  const url0 = typeof row.url === "string" ? row.url : ""
  const url = clean(url0)

  if (url) {
    return `url=${url}`
  }

  return ""
}

const toolFailureRows = (list: ToolResult[]) => {
  const out: FailureTool[] = []

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row || row.ok === true) {
      continue
    }

    const tool0 = typeof row.tool === "string" ? row.tool : ""
    const tool = clean(tool0) || "unknown_tool"
    const input = toolInputLabel(row.input)
    const err0 = typeof row.error === "string" ? row.error : ""
    const outRow = (row.result && typeof row.result === "object" ? row.result : null) as { error?: unknown } | null
    const err1 = typeof outRow?.error === "string" ? outRow.error : ""
    const error = clean(err0) || clean(err1) || "Tool execution failed"
    out.push({ tool, input, error })
  }

  return out
}

const isWriteTool = (raw: string) => {
  const t = clean(raw)

  if (!t) {
    return false
  }

  const list = [
    "fs_write",
    "fs_move",
    "fs_copy",
    "fs_delete",
    "fs_mkdir",
    "fs_purge",
    "fs_apply_patch",
    "fs_replace_ranges",
    "project_setup",
    "project_install",
    "project_run",
  ]

  for (var i = 0; i < list.length; i++) {
    const it = list[i] ?? ""

    if (t === it) {
      return true
    }
  }

  return false
}

const needSessionList = (list: ToolResult[]) => {
  var writeAt = -1
  var listAt = -1

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row || row.ok !== true) {
      continue
    }

    const tool0 = typeof row.tool === "string" ? row.tool : ""
    const tool = clean(tool0)

    if (!tool) {
      continue
    }

    if (isWriteTool(tool)) {
      writeAt = i
      continue
    }

    if (tool === "fs_list") {
      listAt = i
    }
  }

  if (writeAt < 0) {
    return false
  }

  if (listAt > writeAt) {
    return false
  }

  return true
}

const buildFailureContext = (input: {
  stage: DiagnosticStage
  reason: string
  query: string
  stream: boolean
  model: string
  chatId: string
  sessionId: string
  hasToolPlan?: boolean
  toolResults?: ToolResult[]
}): FailureContext => {
  const reason = clean(input.reason) || "Unknown failure"
  const query = clean(input.query)
  const hasToolPlan = input.hasToolPlan === true
  const toolResults = Array.isArray(input.toolResults) ? input.toolResults : []

  return {
    stage: input.stage,
    reason,
    query,
    stream: input.stream === true,
    model: clean(input.model),
    chatId: clean(input.chatId),
    sessionId: clean(input.sessionId),
    hasToolPlan,
    toolResults,
  }
}

const inferMissing = (ctx: FailureContext) => {
  const reason = ctx.reason.toLowerCase()
  const failed = toolFailureRows(ctx.toolResults)

  if (reason.includes("missing term_agent_token")) {
    return "Legacy TERM_AGENT_TOKEN configuration is missing."
  }

  if (reason.includes("missing deepseek_api_key")) {
    return "DEEPSEEK_API_KEY is missing, so the model backend cannot be called."
  }

  if (reason.includes("timed out")) {
    return "An upstream dependency exceeded its timeout budget and no completed result was returned."
  }

  for (var i = 0; i < failed.length; i++) {
    const row = failed[i]
    const err = row?.error.toLowerCase() ?? ""

    if (err.includes("not found")) {
      return "The requested file or working path was not present in the active workspace context."
    }

    if (err.includes("permission")) {
      return "The runtime lacks permission to complete one or more required operations."
    }
  }

  if (failed.length) {
    return "One or more required tool calls failed, so the pipeline could not produce a safe final answer."
  }

  return "The runtime state or required upstream dependency data was incomplete for this request."
}

const generateSyntheticDiagnostic = (ctx: FailureContext) => {
  const failed = toolFailureRows(ctx.toolResults)
  const stage = stageLabel(ctx.stage)
  const what = ctx.reason
  const where = `The failure happened in ${stage}.`
  const why0 = failed.length
    ? `At least one required tool call failed (${failed.length} failure${failed.length > 1 ? "s" : ""}), so execution could not reach a valid completion state.`
    : "The request pipeline ended without a valid assistant result payload."
  const missing = inferMissing(ctx)
  const details: string[] = []

  for (var i = 0; i < failed.length; i++) {
    const row = failed[i]

    if (!row) {
      continue
    }

    const part = row.input ? `${row.tool} (${row.input}): ${row.error}` : `${row.tool}: ${row.error}`
    details.push(part)
  }

  const tools = details.length ? `Failed tool operations: ${details.join(" | ")}.` : "Failed tool operations: none captured."

  return [
    `What went wrong: ${what}.`,
    `Where the failure occurred: ${where}`,
    `Why progress could not continue: ${why0}`,
    `What is missing or misconfigured: ${missing}`,
    tools,
  ].join("\n\n")
}

const isLegacyStallReason = (raw: string) => {
  const t0 = clean(raw)
  const t = t0.toLowerCase()

  if (!t) {
    return false
  }

  if (t.includes("no response events received")) {
    return true
  }

  if (t.includes("connection may be blocked")) {
    return true
  }

  if (t.includes("server stalled")) {
    return true
  }

  return false
}

const sanitizeFailureReason = (raw: string) => {
  const t = clean(raw)

  if (!t) {
    return "Request failed"
  }

  if (isLegacyStallReason(t)) {
    return "Upstream model stream stalled before a usable assistant response."
  }

  return t
}

const looksLikeShellAnswer = (raw: string) => {
  const txt = clean(raw)

  if (!txt) {
    return false
  }

  const low = txt.toLowerCase()

  if (low.includes("```bash") || low.includes("```sh") || low.includes("```shell")) {
    return true
  }

  if (/(^|\n)\s*[$#]\s+[^\n]+/.test(txt)) {
    return true
  }

  return false
}

const isToolArtifactText = (raw: string) => {
  const txt = clean(raw)

  if (!txt) {
    return false
  }

  const lines0 = txt.split("\n")
  const lines: string[] = []

  for (var i = 0; i < lines0.length; i++) {
    const s0 = lines0[i] ?? ""
    const s1 = clean(s0)

    if (s1) {
      lines.push(s1.toLowerCase())
    }
  }

  var direct = 0
  const names = ["session_ensure", "terminal_exec", "terminal_capture", "terminal_send", "editor_open"]

  for (var i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    var hit = false

    for (var j = 0; j < names.length; j++) {
      const n = names[j] ?? ""

      if (!n) {
        continue
      }

      if (line === n) {
        hit = true
        break
      }
    }

    if (!hit && /^fs_[a-z0-9_]+$/i.test(line)) {
      hit = true
    }

    if (!hit && /^project_[a-z0-9_]+$/i.test(line)) {
      hit = true
    }

    if (hit) {
      direct++
    }
  }

  if (direct >= 2) {
    return true
  }

  if (/\b(session_ensure|terminal_exec|terminal_capture|terminal_send|fs_[a-z0-9_]+|project_[a-z0-9_]+|editor_open)\b/i.test(txt)) {
    if (/"(command|path|content|root|query)"\s*:/i.test(txt)) {
      return true
    }
  }

  return false
}

const isInvalidAssistantText = (raw: string) => {
  if (isToolArtifactText(raw)) {
    return true
  }

  if (looksLikeShellAnswer(raw)) {
    return true
  }

  if (isLegacyStallReason(raw)) {
    return true
  }

  return false
}

const generateModelDiagnostic = async (
  ctx: FailureContext,
  call: (
    messages: Msg[],
    temp?: number,
    max?: number,
    signal?: AbortSignal,
    opt?: { tool_choice?: string; response_format?: Record<string, unknown> },
  ) => Promise<{ ok: boolean; text?: string; error?: string }>,
  signal?: AbortSignal,
): Promise<DiagnosticResult> => {
  const failed = toolFailureRows(ctx.toolResults)
  const list = failed.length
    ? failed
        .map((row) => {
          const detail = row.input ? `${row.tool} (${row.input}) -> ${row.error}` : `${row.tool} -> ${row.error}`
          return `- ${detail}`
        })
        .join("\n")
    : "- none"
  const channel = ctx.stream ? "stream" : "json"
  const prompt = [
    "Write a formal technical diagnostic in natural language for an end user.",
    "Do not output tool traces, control-flow text, debug markers, or JSON.",
    "Use exactly these section labels:",
    "What went wrong:",
    "Where the failure occurred:",
    "Why progress could not continue:",
    "What is missing or misconfigured:",
    "",
    `Stage: ${ctx.stage}`,
    `Reason: ${ctx.reason}`,
    `Transport: ${channel}`,
    `Has tool plan: ${ctx.hasToolPlan ? "yes" : "no"}`,
    `User request: ${ctx.query || "(empty)"}`,
    "Failed tool operations:",
    list,
  ].join("\n")
  const feed: Msg[] = [
    { role: "system", content: "You generate concise, formal, technically accurate failure diagnostics." },
    { role: "user", content: prompt },
  ]
  const res = await call(feed, 0.2, 420, signal, { tool_choice: "none" }).catch(() => ({
    ok: false,
    error: "Diagnostic generation request failed",
    text: "",
  }))
  const txt0 = typeof res.text === "string" ? res.text : ""
  const txt = txt0.trim()
  const bad = !res.ok || !txt || isInvalidAssistantText(txt)

  if (!bad) {
    return { text: txt0, diagnostic: { kind: "model_failure", stage: ctx.stage, source: "llm" } }
  }

  return {
    text: generateSyntheticDiagnostic(ctx),
    diagnostic: { kind: "model_failure", stage: ctx.stage, source: "synthetic" },
  }
}

export {
  stageLabel,
  toolInputLabel,
  toolFailureRows,
  isWriteTool,
  needSessionList,
  buildFailureContext,
  inferMissing,
  generateSyntheticDiagnostic,
  isLegacyStallReason,
  sanitizeFailureReason,
  looksLikeShellAnswer,
  isToolArtifactText,
  isInvalidAssistantText,
  generateModelDiagnostic,
}

export type { FailureTool }
