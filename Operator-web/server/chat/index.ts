import type { Msg } from "../types"
import { body } from "../utils/http"
import { clean, clip } from "../utils/text"
import { loadEnv } from "../env"
import { createLogger } from "../logs"
import { parseMessages } from "./messages"
import { lastUserText, pickLang, translate, translateMessages } from "./lang"
import { createDeepSeek, type ToolDef, type ToolRun } from "./deepseek"
import { kind, now, pickPlace, web } from "../web"
import type { NowCtx } from "../web"
import {
  editorOpen,
  fsApplyPatch,
  fsCopy,
  fsDelete,
  fsList,
  fsMkdir,
  fsMove,
  fsPurge,
  fsRead,
  fsReplaceRanges,
  fsStat,
  fsWrite,
  projectDetect,
  projectInstall,
  projectRun,
  projectSetup,
  projectTest,
  sessionEnsure,
  terminalCapture,
  terminalExec,
  terminalSend,
} from "../terminal/client"

var envLoaded = false

const hasUrl = (s: string) => {
  if (s.includes("http://")) {
    return true
  }

  if (s.includes("https://")) {
    return true
  }

  return false
}

const firstUrl = (s: string) => {
  const raw = typeof s === "string" ? s : ""

  if (!raw) {
    return ""
  }

  const m = raw.match(/https?:\/\/[^\s<>()"']+/i)
  const u0 = m?.[0] ?? ""

  if (!u0) {
    return ""
  }

  return u0.replace(/[)\].,;!?]+$/g, "")
}

const isGreeting = (s: string) => {
  const raw = clean(typeof s === "string" ? s : "")

  if (!raw) {
    return false
  }

  const norm = clean(raw.toLowerCase().replace(/[^a-z\s]/g, " "))

  if (!norm) {
    return false
  }

  const words = norm.split(" ")

  if (words.length > 3) {
    return false
  }

  const joined = words.join(" ")
  const list = [
    "hi",
    "hello",
    "hey",
    "yo",
    "sup",
    "hiya",
    "howdy",
    "hi there",
    "hello there",
    "hey there",
    "good morning",
    "good afternoon",
    "good evening",
  ]

  for (var i = 0; i < list.length; i++) {
    if (joined === list[i]) {
      return true
    }
  }

  return false
}

const isPlaceholder = (raw: string) => {
  const t0 = clean(raw)
  const t = t0.toLowerCase()

  if (!t) {
    return false
  }

  if (t === "replace_me" || t === "replaceme") {
    return true
  }

  if (t === "disabled" || t === "none") {
    return true
  }

  if (t === "unset" || t === "null") {
    return true
  }

  return false
}

const shouldPlan = (raw: string) => {
  const t0 = typeof raw === "string" ? raw : ""
  const t = t0.toLowerCase()

  if (!t) {
    return false
  }

  if (hasUrl(t)) {
    return true
  }

  const ext = [".md", ".txt", ".json", ".pdf", ".docx", ".csv", ".xlsx"]

  for (var i = 0; i < ext.length; i++) {
    const it = ext[i] ?? ""

    if (it && t.includes(it)) {
      return true
    }
  }

  const hits = [
    "latest",
    "current",
    "today",
    "yesterday",
    "tomorrow",
    "this week",
    "news",
    "price",
    "cost",
    "availability",
    "available",
    "in stock",
    "stock price",
    "market",
    "forecast",
    "weather",
    "time",
    "timezone",
    "schedule",
    "score",
    "standings",
    "domain",
    "godaddy",
    "whois",
    "website",
    "link",
    "source",
    "citation",
    "cite",
    "docs",
    "documentation",
    "manual",
    "readme",
    "file",
    "folder",
    "path",
    "directory",
    "repo",
    "repository",
    "codebase",
    "log",
    "install",
    "run",
    "test",
    "build",
    "compile",
    "deploy",
    "docker",
    "terminal",
    "shell",
    "command",
    "search",
    "lookup",
    "recommend",
    "restaurant",
    "hotel",
    "flight",
    "book",
    "ticket",
  ]

  for (var i = 0; i < hits.length; i++) {
    const it = hits[i] ?? ""

    if (it && t.includes(it)) {
      return true
    }
  }

  return false
}

const isFileBuildIntent = (raw: string) => {
  const t0 = clean(typeof raw === "string" ? raw : "")
  const t = t0.toLowerCase()

  if (!t) {
    return false
  }

  const make = ["create", "build", "make", "generate", "write", "scaffold", "design"]
  var wants = false

  for (var i = 0; i < make.length; i++) {
    const it = make[i] ?? ""

    if (!it) {
      continue
    }

    if (t.includes(it)) {
      wants = true
      break
    }
  }

  if (!wants) {
    return false
  }

  const targets = [
    "html",
    "css",
    "javascript",
    " js ",
    "website",
    "web page",
    "landing page",
    "index.html",
    "style.css",
    "script.js",
    "file",
    "folder",
    "project",
  ]

  for (var i = 0; i < targets.length; i++) {
    const it = targets[i] ?? ""

    if (!it) {
      continue
    }

    if (t.includes(it)) {
      return true
    }
  }

  return false
}

type SiteFile = {
  path: string
  content: string
}

const isHelloSiteIntent = (raw: string) => {
  const t0 = clean(typeof raw === "string" ? raw : "")
  const t = t0.toLowerCase()

  if (!t) {
    return false
  }

  if (!t.includes("hello world")) {
    return false
  }

  if (!t.includes("website") && !t.includes("web page") && !t.includes("webpage")) {
    return false
  }

  if (!t.includes("html")) {
    return false
  }

  if (!t.includes("css")) {
    return false
  }

  if (!t.includes("javascript") && !t.includes(" js ") && !t.endsWith(" js")) {
    return false
  }

  if (t.includes("active session folder") || t.includes("session folder")) {
    return true
  }

  if (t.includes("separate")) {
    return true
  }

  return false
}

const helloSiteFiles = (): SiteFile[] => {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hello World</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="page">
    <section class="card">
      <p class="label">ACTIVE SESSION BUILD</p>
      <h1>Hello World</h1>
      <p class="lead">A polished starter page with separate HTML, CSS, and JavaScript files.</p>
      <button id="pulse" class="btn" type="button">Animate Greeting</button>
      <p id="status" class="status">Ready</p>
    </section>
  </main>
  <script src="script.js" defer></script>
</body>
</html>
`
  const css = `:root {
  --bg-a: #0f172a;
  --bg-b: #0b1120;
  --shine: #38bdf8;
  --text: #e2e8f0;
  --muted: #94a3b8;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  color: var(--text);
  background:
    radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.22), transparent 45%),
    radial-gradient(circle at 80% 10%, rgba(99, 102, 241, 0.16), transparent 40%),
    linear-gradient(160deg, var(--bg-a), var(--bg-b));
  display: grid;
  place-items: center;
}

.page {
  width: min(92vw, 760px);
}

.card {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 24px;
  padding: 2.2rem;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(8px);
  box-shadow: 0 24px 70px rgba(2, 6, 23, 0.55);
}

.label {
  margin: 0 0 0.8rem;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
  color: var(--shine);
}

h1 {
  margin: 0;
  font-size: clamp(2rem, 4.5vw, 3.8rem);
}

.lead {
  margin-top: 0.9rem;
  color: var(--muted);
  font-size: 1.05rem;
  line-height: 1.45;
}

.btn {
  margin-top: 1.25rem;
  padding: 0.75rem 1.15rem;
  border: 0;
  border-radius: 999px;
  color: #031927;
  background: linear-gradient(120deg, #7dd3fc, #38bdf8);
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.16s ease, filter 0.16s ease;
}

.btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.08);
}

.btn:active {
  transform: translateY(0);
}

.status {
  margin-top: 0.9rem;
  color: #cbd5e1;
}

.card.flash {
  animation: glow 0.6s ease;
}

@keyframes glow {
  from {
    box-shadow: 0 0 0 rgba(56, 189, 248, 0);
  }
  to {
    box-shadow: 0 0 28px rgba(56, 189, 248, 0.32);
  }
}
`
  const js = `const btn = document.getElementById("pulse")
const card = document.querySelector(".card")
const status = document.getElementById("status")

const stamp = () => {
  const now = new Date()
  return now.toLocaleTimeString()
}

const run = () => {
  if (!btn || !card || !status) {
    return
  }

  card.classList.remove("flash")
  void card.offsetWidth
  card.classList.add("flash")
  status.textContent = "Hello World animation triggered at " + stamp()
}

if (btn) {
  btn.addEventListener("click", run)
}

if (status) {
  status.textContent = "Ready at " + stamp()
}
`

  return [
    { path: "index.html", content: html },
    { path: "style.css", content: css },
    { path: "script.js", content: js },
  ]
}

const isLookupIntent = (raw: string) => {
  const t0 = clean(typeof raw === "string" ? raw : "")
  const t = t0.toLowerCase()

  if (!t) {
    return false
  }

  if (isFileBuildIntent(t)) {
    return false
  }

  if (hasUrl(t)) {
    return true
  }

  const keys = [
    "search the web",
    "web search",
    "search online",
    "look up",
    "lookup",
    "find online",
    "current events",
    "latest",
    "today",
    "this week",
    "headlines",
    "news",
    "stock price",
    "weather",
    "standings",
    "schedule",
    "as of",
  ]

  for (var i = 0; i < keys.length; i++) {
    const it = keys[i] ?? ""

    if (!it) {
      continue
    }

    if (t.includes(it)) {
      return true
    }
  }

  return false
}

const hasIsoDate = (raw: string) => {
  const t0 = typeof raw === "string" ? raw : ""
  const t = t0.trim()

  if (!t) {
    return false
  }

  return /\b\d{4}-\d{2}-\d{2}\b/.test(t)
}

const isRecencyQuery = (raw: string) => {
  const t0 = typeof raw === "string" ? raw : ""
  const t = t0.toLowerCase()

  if (!t) {
    return false
  }

  const keys = [
    "latest",
    "current",
    "current events",
    "today",
    "yesterday",
    "tomorrow",
    "this week",
    "this month",
    "this year",
    "news",
    "breaking",
    "headline",
    "recent",
    "update",
    "updates",
    "trending",
  ]

  for (var i = 0; i < keys.length; i++) {
    const k = keys[i] ?? ""

    if (k && t.includes(k)) {
      return true
    }
  }

  return false
}

const noSourcesMessage = (q: string, searched?: boolean) => {
  const url = firstUrl(q)

  if (url) {
    return (
      "I tried to fetch the website you shared, but I couldn't. " +
      "I didn't get any readable content back. The site might block automated access, require a login or subscription, " +
      "or be temporarily unavailable. If you want, share another link or tell me what you need from it."
    )
  }

  if (searched) {
    return "I tried to look that up, but I couldn't find reliable sources for it. If you can share a link or more detail, I can try again."
  }

  return "I don't have reliable sources for that yet. If you want me to look it up, share a link or add more detail."
}

const splitSentences = (s: string) => {
  const out: string[] = []
  var cur = ""

  for (var i = 0; i < s.length; i++) {
    const ch = s[i] ?? ""
    cur += ch
    const end = ch === "." || ch === "!" || ch === "?"

    if (!end) {
      continue
    }

    const next = s[i + 1] ?? ""
    const sep = next === " " || next === "\n" || next === "\t" || !next

    if (!sep) {
      continue
    }

    const seg = cur.trim()

    if (seg) {
      out.push(seg)
    }

    cur = ""
  }

  const tail = cur.trim()

  if (tail) {
    out.push(tail)
  }

  return out
}

const appendInst = (list: Msg[], inst: string) => {
  const feed = list.slice()
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
    const next = c ? `${c}\n\n${inst}` : inst
    feed[si] = { role: "system", content: next }
  }

  if (si < 0) {
    feed.unshift({ role: "system", content: inst })
  }

  return feed
}

type ToolRequest = {
  mode: "none" | "web" | "terminal" | "both"
  type?: "web" | "news" | "docs" | "time"
  reason?: string
  draft?: string
  queries?: string[]
}

type PreflightResult = {
  ok: boolean
  text?: string
  req?: ToolRequest
}

type PlanStep = {
  id: number
  action: string
  needs: "none" | "web" | "terminal"
}

type PlanReq = {
  step_id: number
  tool: string
  why?: string
  inputs: Record<string, unknown>
}

type PlanOut = {
  task_type: "reasoning" | "retrieval" | "execution" | "mixed"
  steps: PlanStep[]
  tool_requests: PlanReq[]
  answer_draft: string
}

type ToolResult = {
  tool: string
  ok: boolean
  error?: string
  input?: unknown
  result?: unknown
}

type DiagnosticStage = "reasoning" | "tool_selection" | "execution" | "environment"

type DiagnosticSource = "llm" | "synthetic"

type DiagnosticInfo = {
  kind: "model_failure"
  stage: DiagnosticStage
  source: DiagnosticSource
}

type FailureTool = {
  tool: string
  input: string
  error: string
}

type FailureContext = {
  stage: DiagnosticStage
  reason: string
  query: string
  stream: boolean
  model: string
  chatId: string
  sessionId: string
  hasToolPlan: boolean
  toolResults: ToolResult[]
}

type DiagnosticResult = {
  text: string
  diagnostic: DiagnosticInfo
}

type TermEntry = {
  id: string
  tool: string
  input: string
  output: string
  status: "running" | "done" | "failed"
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

const termEntries = (list: ToolResult[]) => {
  const out: TermEntry[] = []
  var count = 0

  for (var i = 0; i < list.length; i++) {
    const row = list[i]
    const tool0 = typeof row?.tool === "string" ? row.tool : ""
    const tool = tool0.trim()

    if (!tool.startsWith("terminal_")) {
      continue
    }

    count++
    const id = `term-${count}`
    const inputObj = row?.input
    const inRow = (inputObj && typeof inputObj === "object" ? inputObj : null) as {
      command?: unknown
      keys?: unknown
      path?: unknown
    } | null
    const cmd0 = typeof inRow?.command === "string" ? inRow.command : ""
    const keys0 = typeof inRow?.keys === "string" ? inRow.keys : ""
    const path0 = typeof inRow?.path === "string" ? inRow.path : ""
    var input = clean(cmd0) || clean(keys0) || clean(path0)

    if (!input) {
      try {
        input = JSON.stringify(inputObj ?? {})
      } catch {
        input = ""
      }
    }

    const resObj = row?.result
    const outRow = (resObj && typeof resObj === "object" ? resObj : null) as {
      output?: unknown
      text?: unknown
      error?: unknown
    } | null
    const out0 = typeof outRow?.output === "string" ? outRow.output : ""
    const out1 = typeof outRow?.text === "string" ? outRow.text : ""
    const err0 = typeof row?.error === "string" ? row.error : ""
    const err1 = typeof outRow?.error === "string" ? outRow.error : ""
    var output = out0 || out1 || err1 || err0

    if (!output) {
      output = row?.ok ? "done" : "failed"
    }

    out.push({
      id,
      tool,
      input: input || "",
      output: output || "",
      status: row?.ok ? "done" : "failed",
    })
  }

  return out
}

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
    return "TERM_AGENT_TOKEN is missing, so terminal tools cannot authenticate."
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

const pickMode = (raw: string) => {
  const list = ["none", "web", "terminal", "both"]

  for (var i = 0; i < list.length; i++) {
    const it = list[i] ?? ""

    if (raw === it) {
      return it
    }
  }

  return ""
}

const pickType = (raw: string) => {
  const list = ["web", "news", "docs", "time"]

  for (var i = 0; i < list.length; i++) {
    const it = list[i] ?? ""

    if (raw === it) {
      return it
    }
  }

  return ""
}

const pickNeed = (raw: string) => {
  const list = ["none", "web", "terminal"]

  for (var i = 0; i < list.length; i++) {
    const it = list[i] ?? ""

    if (raw === it) {
      return it
    }
  }

  return ""
}

const pickTask = (raw: string) => {
  const list = ["reasoning", "retrieval", "execution", "mixed"]

  for (var i = 0; i < list.length; i++) {
    const it = list[i] ?? ""

    if (raw === it) {
      return it
    }
  }

  return ""
}

const sessionTag = (raw: string) => {
  const t0 = clean(raw)
  const t1 = t0.replace(/[^a-zA-Z0-9_.-]+/g, "_")
  const t = clean(t1)

  if (!t) {
    return "operator"
  }

  return t
}

const splitPathParts = (raw: string) => {
  const t0 = clean(raw)

  if (!t0) {
    return []
  }

  const t1 = t0.replace(/\\/g, "/").replace(/^[a-zA-Z]:\//, "").replace(/^\/+/, "")
  const list0 = t1.split("/")
  const list: string[] = []

  for (var i = 0; i < list0.length; i++) {
    const part0 = clean(list0[i] ?? "")

    if (!part0 || part0 === "." || part0 === "..") {
      continue
    }

    list.push(part0)
  }

  return list
}

const scopeSessionPath = (session: string, raw: string) => {
  const sid = sessionTag(session)
  const parts0 = splitPathParts(raw)

  if (!parts0.length) {
    return sid
  }

  var from = 0
  const p0 = (parts0[0] ?? "").toLowerCase()
  const p1 = (parts0[1] ?? "").toLowerCase()

  if (p0 === "projects" && p1 === "operator") {
    from = 2
  } else if (p0 === "operator") {
    from = 1
  } else if ((parts0[0] ?? "") === sid) {
    from = 1
  }

  const tail = parts0.slice(from)

  if (!tail.length) {
    return sid
  }

  return [sid].concat(tail).join("/")
}

const isJsonish = (raw: string) => {
  const t = stripFence(raw).trim()

  if (!t) {
    return false
  }

  if (!t.startsWith("{") || !t.endsWith("}")) {
    return false
  }

  return true
}

const parseToolRequest = (raw: string): ToolRequest | null => {
  const t = stripFence(raw).trim()

  if (!t.startsWith("{") || !t.endsWith("}")) {
    return null
  }

  const out = parseJson(t)

  if (!out || typeof out !== "object") {
    return null
  }

  const o = out as { tool_request?: unknown }
  const tr0 = (o.tool_request && typeof o.tool_request === "object" ? o.tool_request : null) as {
    mode?: unknown
    type?: unknown
    reason?: unknown
    draft?: unknown
    queries?: unknown
  } | null

  if (!tr0) {
    return null
  }

  const mode0 = typeof tr0.mode === "string" ? tr0.mode : ""
  const mode1 = mode0.trim()
  const mode2 = pickMode(mode1)

  if (!mode2) {
    return null
  }

  const type0 = typeof tr0.type === "string" ? tr0.type : ""
  const type1 = type0.trim()
  const type2 = pickType(type1)
  const reason0 = typeof tr0.reason === "string" ? tr0.reason : ""
  const draft0 = typeof tr0.draft === "string" ? tr0.draft : ""
  const queries0 = Array.isArray(tr0.queries) ? tr0.queries : []
  const qs: string[] = []

  for (var i = 0; i < queries0.length; i++) {
    const it = queries0[i]
    const s0 = typeof it === "string" ? it : ""
    const s1 = clean(s0)

    if (!s1) {
      continue
    }

    qs.push(s1)
  }

  const outReq: ToolRequest = {
    mode: mode2 as ToolRequest["mode"],
  }

  if (type2) {
    outReq.type = type2 as ToolRequest["type"]
  }

  const reason = clean(reason0)

  if (reason) {
    outReq.reason = reason
  }

  const draft = clean(draft0)

  if (draft) {
    outReq.draft = draft
  }

  if (qs.length) {
    outReq.queries = qs
  }

  return outReq
}

const numPick = (v: unknown) => {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.floor(v)
  }

  if (typeof v === "string") {
    const n0 = Number.parseInt(v, 10)
    const n1 = Number.isFinite(n0) ? n0 : 0
    return n1
  }

  return 0
}

const parsePlan = (raw: string): PlanOut | null => {
  const t = stripFence(raw).trim()

  if (!t.startsWith("{") || !t.endsWith("}")) {
    return null
  }

  const out = parseJson(t)

  if (!out || typeof out !== "object") {
    return null
  }

  const o = out as {
    task_type?: unknown
    steps?: unknown
    tool_requests?: unknown
    answer_draft?: unknown
  }
  const task0 = typeof o.task_type === "string" ? o.task_type : ""
  const task1 = task0.trim()
  const task2 = pickTask(task1)

  if (!task2) {
    return null
  }

  const steps0 = Array.isArray(o.steps) ? o.steps : []
  const steps: PlanStep[] = []

  for (var i = 0; i < steps0.length; i++) {
    const row = (steps0[i] && typeof steps0[i] === "object" ? steps0[i] : null) as {
      id?: unknown
      action?: unknown
      needs?: unknown
    } | null

    if (!row) {
      continue
    }

    const id0 = numPick(row.id)
    const action0 = typeof row.action === "string" ? row.action : ""
    const action1 = clean(action0)
    const needs0 = typeof row.needs === "string" ? row.needs : ""
    const needs1 = needs0.trim()
    const needs2 = pickNeed(needs1)

    if (!id0 || !action1 || !needs2) {
      continue
    }

    steps.push({ id: id0, action: action1, needs: needs2 as PlanStep["needs"] })
  }

  const list0 = Array.isArray(o.tool_requests) ? o.tool_requests : []
  const reqs: PlanReq[] = []

  for (var i = 0; i < list0.length; i++) {
    const row = (list0[i] && typeof list0[i] === "object" ? list0[i] : null) as {
      step_id?: unknown
      tool?: unknown
      why?: unknown
      inputs?: unknown
    } | null

    if (!row) {
      continue
    }

    const tool0 = typeof row.tool === "string" ? row.tool : ""
    const tool1 = clean(tool0)

    if (!tool1) {
      continue
    }

    const step0 = numPick(row.step_id)
    const why0 = typeof row.why === "string" ? row.why : ""
    const why1 = clean(why0)
    const inputs0 = (row.inputs && typeof row.inputs === "object" ? row.inputs : null) as Record<string, unknown> | null
    const req: PlanReq = { step_id: step0, tool: tool1, inputs: inputs0 ?? {} }

    if (why1) {
      req.why = why1
    }

    reqs.push(req)
  }

  const draft0 = typeof o.answer_draft === "string" ? o.answer_draft : ""
  const draft1 = draft0.trim()

  return {
    task_type: task2 as PlanOut["task_type"],
    steps,
    tool_requests: reqs,
    answer_draft: draft1,
  }
}

const lookupType = (raw: string): PlanReq["tool"] | "" => {
  const k0 = kind(raw)
  const k = clean(k0)

  if (k === "web" || k === "news" || k === "docs" || k === "time") {
    return k
  }

  return ""
}

const makeLookupPlan = (q: string, tool: PlanReq["tool"]): PlanOut => ({
  task_type: "retrieval",
  steps: [{ id: 1, action: "Gather current external data for the request.", needs: "terminal" }],
  tool_requests: [
    {
      step_id: 1,
      tool,
      why: "Auto-enforced lookup for explicit web/current-events intent.",
      inputs: { queries: [q] },
    },
  ],
  answer_draft: "",
})

const isLookupTerminalCommand = (raw: string) => {
  const t0 = clean(raw)
  const t = t0.toLowerCase()

  if (!t) {
    return false
  }

  if (t === "mcp-search" || t.startsWith("mcp-search ")) {
    return true
  }

  if (t === "date" || t.startsWith("date ")) {
    return true
  }

  return false
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

    const searchMode0 = clean(process.env.SEARCH_MODE ?? "")
    const searchMode = (searchMode0 || "terminal").toLowerCase()
    const terminalOnly = searchMode === "terminal"
    const termToken0 = clean(process.env.TERM_AGENT_TOKEN ?? "")
    const termToken = isPlaceholder(termToken0) ? "" : termToken0

    if (terminalOnly && !termToken) {
      return deps.bad("Missing TERM_AGENT_TOKEN (required for terminal-only mode)", 500)
    }

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

    var key = (process.env.DEEPSEEK_API_KEY ?? "").trim()

    if (!key || key === "sk-REPLACE_ME") {
      const k0 = (process.env.DEEPSEEK_API_KEY ?? "").trim()
      key = k0
    }

    if (!key || key === "sk-REPLACE_ME") {
      return deps.bad("Missing DEEPSEEK_API_KEY (set in .env; see .env.example)", 500)
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
    const greet = isGreeting(last)
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
        ? "Terminal-only mode: use fs_* tools for file operations and project_* tools for installs/runs. Use terminal_exec for local inspection (ls, rg, cat). For any search or web lookup, you MUST run terminal_exec with mcp-search \"query\" before answering. Do not use built-in web lookup tools. Never output shell command blocks in the final answer; execute tools and report results."
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
            "terminal_exec: run a shell command (use for ls, rg, cat, mcp-search).",
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
      "Do not use tools unless you have already reasoned and determined they are necessary; never search for pure reasoning tasks. After each tool result, read the output and decide the next step from that output before calling another tool. If the output already answers the request, stop tool use and answer directly. For explicit web/current-events lookup tasks, use date and mcp-search only; do not run filesystem listing commands. After successful file-write/create operations, run fs_list with path='.' to confirm created files and mention that confirmation in your final reasoning."
    const inst = [
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
    const planInst = [
      "Reply only in English. Do not include other languages.",
      policy,
      truthLine,
      termAccess,
      toolGuide,
      "For news/current events, include today's date (YYYY-MM-DD) in each search query.",
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
    const replanInst = `${planInst} Tools are not permitted for reasoning tasks. Remove tool_requests and answer in answer_draft.`
    const finalInst =
      "Tools are disabled for this response. Use any provided tool results and answer now. If files were created or edited, confirm them by citing the session folder fs_list output."

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
    var worked = false
    var work = () => {}
    var emitTerm = (_: { phase: "start" | "update" | "done" | "error"; tool: string; id: string; args?: unknown; result?: unknown }) => {}
    const termTools: ToolDef[] = termToken
      ? [
          {
            type: "function",
            function: {
              name: "session_ensure",
              description: "Ensure a terminal session exists.",
              parameters: {
                type: "object",
                properties: {
                  sessionId: { type: "string", description: "Optional session id." },
                },
              },
            },
          },
          {
            type: "function",
            function: {
              name: "terminal_exec",
              description: "Execute a shell command in the terminal.",
              parameters: {
                type: "object",
                properties: {
                  sessionId: { type: "string", description: "Optional session id." },
                  command: { type: "string", description: "Shell command to run." },
                  timeoutMs: { type: "number", description: "Optional timeout in ms." },
                  maxChars: { type: "number", description: "Optional max output length." },
                  cwd: { type: "string", description: "Optional working directory." },
                  target_pane: { type: "string", description: "Optional tmux target pane." },
                },
                required: ["command"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "terminal_capture",
              description: "Capture recent terminal output.",
              parameters: {
                type: "object",
                properties: {
                  sessionId: { type: "string", description: "Optional session id." },
                  tailLines: { type: "number", description: "Lines of output to return." },
                  target_pane: { type: "string", description: "Optional tmux target pane." },
                },
              },
            },
          },
          {
            type: "function",
            function: {
              name: "terminal_send",
              description: "Send keystrokes to the terminal.",
              parameters: {
                type: "object",
                properties: {
                  sessionId: { type: "string", description: "Optional session id." },
                  keys: { type: "string", description: "Keys to send." },
                  enter: { type: "boolean", description: "Send Enter after keys." },
                  target_pane: { type: "string", description: "Optional tmux target pane." },
                },
              },
            },
          },
          {
            type: "function",
            function: {
              name: "fs_list",
              description: "List files and folders.",
              parameters: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Path to list." },
                  recursive: { type: "boolean", description: "Recurse into subdirectories." },
                  max_entries: { type: "number", description: "Maximum entries to return." },
                  max_depth: { type: "number", description: "Maximum depth when recursive." },
                },
                required: ["path"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "fs_stat",
              description: "Stat a file or folder.",
              parameters: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Path to stat." },
                },
                required: ["path"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "fs_read",
              description: "Read a file.",
              parameters: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Path to read." },
                  max_bytes: { type: "number", description: "Max bytes to read." },
                  start_line: { type: "number", description: "Start line (1-based)." },
                  end_line: { type: "number", description: "End line (1-based)." },
                  binary: { type: "boolean", description: "Return base64 data." },
                },
                required: ["path"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "fs_write",
              description: "Write a file.",
              parameters: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Path to write." },
                  content: { type: "string", description: "File content." },
                  atomic: { type: "boolean", description: "Use atomic write." },
                  create_parents: { type: "boolean", description: "Create parent directories." },
                },
                required: ["path", "content"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "fs_move",
              description: "Move or rename a file or folder.",
              parameters: {
                type: "object",
                properties: {
                  src: { type: "string", description: "Source path." },
                  dst: { type: "string", description: "Destination path." },
                  overwrite: { type: "boolean", description: "Overwrite destination if it exists." },
                },
                required: ["src", "dst"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "fs_copy",
              description: "Copy a file or folder.",
              parameters: {
                type: "object",
                properties: {
                  src: { type: "string", description: "Source path." },
                  dst: { type: "string", description: "Destination path." },
                  recursive: { type: "boolean", description: "Copy folders recursively." },
                  overwrite: { type: "boolean", description: "Overwrite destination if it exists." },
                },
                required: ["src", "dst"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "fs_delete",
              description: "Delete a file or folder.",
              parameters: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Path to delete." },
                  recursive: { type: "boolean", description: "Delete folders recursively." },
                  to_trash: { type: "boolean", description: "Move to trash instead of permanent delete." },
                },
                required: ["path"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "fs_mkdir",
              description: "Create a directory.",
              parameters: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Path to create." },
                  parents: { type: "boolean", description: "Create parent directories." },
                },
                required: ["path"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "fs_purge",
              description: "Permanently delete a file/folder or purge trash.",
              parameters: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Path to purge (optional)." },
                  recursive: { type: "boolean", description: "Delete folders recursively." },
                },
              },
            },
          },
          {
            type: "function",
            function: {
              name: "fs_apply_patch",
              description: "Apply a unified diff to a file.",
              parameters: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Path to patch." },
                  unified_diff: { type: "string", description: "Unified diff content." },
                },
                required: ["path", "unified_diff"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "fs_replace_ranges",
              description: "Replace line ranges in a file.",
              parameters: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Path to edit." },
                  ranges: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        start_line: { type: "number", description: "Start line (1-based)." },
                        end_line: { type: "number", description: "End line (1-based)." },
                        content: { type: "string", description: "Replacement content." },
                      },
                      required: ["start_line", "end_line", "content"],
                    },
                  },
                },
                required: ["path", "ranges"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "editor_open",
              description: "Open a file in an editor pane.",
              parameters: {
                type: "object",
                properties: {
                  path: { type: "string", description: "Path to open." },
                  editor: { type: "string", description: "Editor binary name." },
                  line: { type: "number", description: "Line to jump to." },
                  col: { type: "number", description: "Column to jump to." },
                  target_pane: { type: "string", description: "Target tmux pane." },
                  sessionId: { type: "string", description: "Optional session id." },
                },
                required: ["path"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "project_detect",
              description: "Detect project type at a root.",
              parameters: {
                type: "object",
                properties: {
                  root: { type: "string", description: "Project root path." },
                },
                required: ["root"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "project_setup",
              description: "Set up project environment.",
              parameters: {
                type: "object",
                properties: {
                  root: { type: "string", description: "Project root path." },
                },
                required: ["root"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "project_install",
              description: "Install project dependencies.",
              parameters: {
                type: "object",
                properties: {
                  root: { type: "string", description: "Project root path." },
                  locked: { type: "boolean", description: "Require lockfiles." },
                  network: { type: "boolean", description: "Allow network access." },
                  hashes: { type: "boolean", description: "Require hashes for Python installs." },
                },
                required: ["root"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "project_run",
              description: "Run a command in the project.",
              parameters: {
                type: "object",
                properties: {
                  root: { type: "string", description: "Project root path." },
                  command: { type: "array", items: { type: "string" }, description: "Command argv." },
                  timeout_s: { type: "number", description: "Timeout in seconds." },
                },
                required: ["root", "command"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "project_test",
              description: "Run project tests.",
              parameters: {
                type: "object",
                properties: {
                  root: { type: "string", description: "Project root path." },
                  timeout_s: { type: "number", description: "Timeout in seconds." },
                },
                required: ["root"],
              },
            },
          },
        ]
      : []
    const runTool: ToolRun | null = termToken
      ? async (name, args, meta) => {
          const id0 = typeof meta?.id === "string" ? meta.id : ""
          const id = id0.trim() || "tool"
          const tool = name.trim()
          const numArg = (v: unknown) => {
            if (typeof v === "number" && Number.isFinite(v)) {
              return v
            }

            if (typeof v === "string") {
              const n0 = Number.parseInt(v, 10)
              return Number.isFinite(n0) ? n0 : undefined
            }

            return undefined
          }
          const scoped = (raw: string) => scopeSessionPath(sid, raw)
          const callData = {
            ts: new Date().toISOString(),
            chatId: cid,
            sessionId: sid,
            model,
            tool,
            id,
            args,
          }

          emitTerm({ phase: "start", tool, id, args })
          await logger.write("logs", "tool_call", callData).catch(() => {})

          var result: unknown = { ok: false, error: "Unknown tool" }

          try {
            if (tool === "session_ensure") {
              const sessionId = typeof args.sessionId === "string" ? args.sessionId : sid
              result = await sessionEnsure(sessionId)
            } else if (tool === "terminal_exec") {
              const command0 = typeof args.command === "string" ? args.command : ""
              var command = command0.trim()

              if (!command) {
                result = { ok: false, error: "Missing command" }
              } else {
                if (terminalOnly && allowExec && lookupIntent && lookupKind && !fileBuildIntent && !isLookupTerminalCommand(command)) {
                  const esc = query.replace(/"/g, '\\"').replace(/\r/g, " ").replace(/\n/g, " ")
                  command = `mcp-search "${esc}"`
                }

                const sessionId = typeof args.sessionId === "string" ? args.sessionId : sid
                const timeoutMs = numArg(args.timeoutMs)
                const maxChars = numArg(args.maxChars)
                const cwd0 = typeof args.cwd === "string" ? args.cwd : ""
                const cwd = cwd0.trim() || "."
                const targetPane = typeof args.target_pane === "string" ? args.target_pane : undefined
                result = await terminalExec({ sessionId, command, timeoutMs, maxChars, cwd, targetPane })
              }
            } else if (tool === "terminal_capture") {
              const sessionId = typeof args.sessionId === "string" ? args.sessionId : sid
              const tailLines = numArg(args.tailLines)
              const targetPane = typeof args.target_pane === "string" ? args.target_pane : undefined
              result = await terminalCapture({ sessionId, tailLines, targetPane })
            } else if (tool === "terminal_send") {
              const sessionId = typeof args.sessionId === "string" ? args.sessionId : sid
              const keys = typeof args.keys === "string" ? args.keys : undefined
              const enter = args.enter === true
              const targetPane = typeof args.target_pane === "string" ? args.target_pane : undefined
              result = await terminalSend({ sessionId, keys, enter, targetPane })
            } else if (tool === "fs_list") {
              const path0 = typeof args.path === "string" ? args.path : "."
              const path = scoped(path0 || ".")
              const recursive = args.recursive === true
              const maxEntries = numArg(args.max_entries)
              const maxDepth = numArg(args.max_depth)
              result = await fsList({ path, recursive, maxEntries, maxDepth })
            } else if (tool === "fs_stat") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()

              if (!pathRaw) {
                result = { ok: false, error: "Missing path" }
              } else {
                const path = scoped(pathRaw)
                result = await fsStat({ path })
              }
            } else if (tool === "fs_read") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()

              if (!pathRaw) {
                result = { ok: false, error: "Missing path" }
              } else {
                const path = scoped(pathRaw)
                const maxBytes = numArg(args.max_bytes)
                const startLine = numArg(args.start_line)
                const endLine = numArg(args.end_line)
                const binary = args.binary === true
                result = await fsRead({ path, maxBytes, startLine, endLine, binary })
              }
            } else if (tool === "fs_write") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()
              const content = typeof args.content === "string" ? args.content : ""

              if (!pathRaw) {
                result = { ok: false, error: "Missing path" }
              } else if (!content && args.content !== "") {
                result = { ok: false, error: "Missing content" }
              } else {
                const path = scoped(pathRaw)
                const atomic = args.atomic !== false
                const createParents = args.create_parents !== false
                result = await fsWrite({ path, content, atomic, createParents })
              }
            } else if (tool === "fs_move") {
              const src0 = typeof args.src === "string" ? args.src : ""
              const dst0 = typeof args.dst === "string" ? args.dst : ""
              const srcRaw = src0.trim()
              const dstRaw = dst0.trim()

              if (!srcRaw || !dstRaw) {
                result = { ok: false, error: "Missing src or dst" }
              } else {
                const src = scoped(srcRaw)
                const dst = scoped(dstRaw)
                const overwrite = args.overwrite === true
                result = await fsMove({ src, dst, overwrite })
              }
            } else if (tool === "fs_copy") {
              const src0 = typeof args.src === "string" ? args.src : ""
              const dst0 = typeof args.dst === "string" ? args.dst : ""
              const srcRaw = src0.trim()
              const dstRaw = dst0.trim()

              if (!srcRaw || !dstRaw) {
                result = { ok: false, error: "Missing src or dst" }
              } else {
                const src = scoped(srcRaw)
                const dst = scoped(dstRaw)
                const recursive = args.recursive !== false
                const overwrite = args.overwrite === true
                result = await fsCopy({ src, dst, recursive, overwrite })
              }
            } else if (tool === "fs_delete") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()

              if (!pathRaw) {
                result = { ok: false, error: "Missing path" }
              } else {
                const path = scoped(pathRaw)
                const recursive = args.recursive === true
                const toTrash = args.to_trash !== false
                result = await fsDelete({ path, recursive, toTrash })
              }
            } else if (tool === "fs_mkdir") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()

              if (!pathRaw) {
                result = { ok: false, error: "Missing path" }
              } else {
                const path = scoped(pathRaw)
                const parents = args.parents !== false
                result = await fsMkdir({ path, parents })
              }
            } else if (tool === "fs_purge") {
              const path0 = typeof args.path === "string" ? args.path.trim() : ""
              const path = path0 ? scoped(path0) : undefined
              const recursive = args.recursive !== false
              result = await fsPurge({ path, recursive })
            } else if (tool === "fs_apply_patch") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()
              const unifiedDiff = typeof args.unified_diff === "string" ? args.unified_diff : ""

              if (!pathRaw || !unifiedDiff) {
                result = { ok: false, error: "Missing path or unified_diff" }
              } else {
                const path = scoped(pathRaw)
                result = await fsApplyPatch({ path, unifiedDiff })
              }
            } else if (tool === "fs_replace_ranges") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()
              const ranges0 = Array.isArray(args.ranges) ? args.ranges : []
              const ranges = ranges0 as { start_line: number; end_line: number; content: string }[]

              if (!pathRaw || !ranges.length) {
                result = { ok: false, error: "Missing path or ranges" }
              } else {
                const path = scoped(pathRaw)
                result = await fsReplaceRanges({ path, ranges })
              }
            } else if (tool === "editor_open") {
              const path0 = typeof args.path === "string" ? args.path : ""
              const pathRaw = path0.trim()

              if (!pathRaw) {
                result = { ok: false, error: "Missing path" }
              } else {
                const path = scoped(pathRaw)
                const editor = typeof args.editor === "string" ? args.editor : undefined
                const line = numArg(args.line)
                const col = numArg(args.col)
                const targetPane = typeof args.target_pane === "string" ? args.target_pane : undefined
                const sessionId0 = typeof args.sessionId === "string" ? args.sessionId : sid
                const sessionId = sessionTag(sessionId0)
                result = await editorOpen({ path, editor, line, col, targetPane, sessionId })
              }
            } else if (tool === "project_detect") {
              const root0 = typeof args.root === "string" ? args.root : ""
              const rootRaw = root0.trim()

              if (!rootRaw) {
                result = { ok: false, error: "Missing root" }
              } else {
                const root = scoped(rootRaw)
                result = await projectDetect({ root })
              }
            } else if (tool === "project_setup") {
              const root0 = typeof args.root === "string" ? args.root : ""
              const rootRaw = root0.trim()

              if (!rootRaw) {
                result = { ok: false, error: "Missing root" }
              } else {
                const root = scoped(rootRaw)
                result = await projectSetup({ root })
              }
            } else if (tool === "project_install") {
              const root0 = typeof args.root === "string" ? args.root : ""
              const rootRaw = root0.trim()

              if (!rootRaw) {
                result = { ok: false, error: "Missing root" }
              } else {
                const root = scoped(rootRaw)
                const locked = args.locked !== false
                const network = args.network !== false
                const hashes = args.hashes === true
                result = await projectInstall({ root, locked, network, hashes })
              }
            } else if (tool === "project_run") {
              const root0 = typeof args.root === "string" ? args.root : ""
              const rootRaw = root0.trim()
              const command0 = Array.isArray(args.command) ? args.command : []
              const command = command0.filter((item): item is string => typeof item === "string")

              if (!rootRaw || !command.length) {
                result = { ok: false, error: "Missing root or command" }
              } else {
                const root = scoped(rootRaw)
                const timeoutS = numArg(args.timeout_s)
                result = await projectRun({ root, command, timeoutS })
              }
            } else if (tool === "project_test") {
              const root0 = typeof args.root === "string" ? args.root : ""
              const rootRaw = root0.trim()

              if (!rootRaw) {
                result = { ok: false, error: "Missing root" }
              } else {
                const root = scoped(rootRaw)
                const timeoutS = numArg(args.timeout_s)
                result = await projectTest({ root, timeoutS })
              }
            }
          } catch (err) {
            const row = err && typeof err === "object" ? (err as { message?: unknown } | null) : null
            const m0 = typeof row?.message === "string" ? row.message : ""
            const m = m0.trim() || "Tool execution failed"
            result = { ok: false, error: m }
          }

          const ok = result && typeof result === "object" && (result as { ok?: unknown }).ok === true
          emitTerm({ phase: ok ? "done" : "error", tool, id, args, result })
          await logger
            .write("logs", "tool_result", {
              ...callData,
              result,
            })
            .catch(() => {})

          return result
        }
      : null
    const runHelloSiteFallback = async () => {
      if (!terminalOnly || !allowExec || !runTool || !isHelloSiteIntent(query)) {
        return null
      }

      const files = helloSiteFiles()
      const results: ToolResult[] = []
      const nextId = () => {
        const rid0 = globalThis.crypto?.randomUUID?.() ?? ""
        return rid0 || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
      }

      for (var i = 0; i < files.length; i++) {
        const file = files[i]

        if (!file) {
          continue
        }

        const input = {
          path: file.path,
          content: file.content,
          atomic: true,
          create_parents: true,
        }
        const out = await runTool("fs_write", input, { id: nextId() })
        const ok = !!(out && typeof out === "object" && (out as { ok?: unknown }).ok === true)
        results.push({ tool: "fs_write", ok, input, result: out })
      }

      const listInput = {
        path: ".",
        recursive: true,
        max_depth: 2,
        max_entries: 200,
      }
      const listOut = await runTool("fs_list", listInput, { id: nextId() })
      const listOk = !!(listOut && typeof listOut === "object" && (listOut as { ok?: unknown }).ok === true)
      results.push({ tool: "fs_list", ok: listOk, input: listInput, result: listOut })

      const seen = new Set<string>()
      const listRow = (listOut && typeof listOut === "object" ? listOut : null) as { result?: unknown } | null
      const listResult = (listRow?.result && typeof listRow.result === "object" ? listRow.result : null) as {
        entries?: unknown
      } | null
      const entries = Array.isArray(listResult?.entries) ? listResult.entries : []

      for (var i = 0; i < entries.length; i++) {
        const row = (entries[i] && typeof entries[i] === "object" ? entries[i] : null) as {
          rel?: unknown
          path?: unknown
        } | null
        const rel0 = typeof row?.rel === "string" ? row.rel : ""
        const path0 = typeof row?.path === "string" ? row.path : ""
        const rel = clean(rel0).replace(/\\/g, "/")
        const path = clean(path0).replace(/\\/g, "/")

        if (rel) {
          seen.add(rel)
        }

        if (path) {
          seen.add(path)
          const tail = path.split("/").pop() ?? ""

          if (tail) {
            seen.add(tail)
          }
        }
      }

      const hasFile = (name: string) => {
        const target = clean(name).replace(/\\/g, "/")

        if (!target) {
          return false
        }

        if (seen.has(target)) {
          return true
        }

        const list = Array.from(seen)

        for (var i = 0; i < list.length; i++) {
          const row = list[i] ?? ""

          if (row.endsWith(`/${target}`)) {
            return true
          }
        }

        return false
      }
      const names = files.map((row) => row.path)
      const confirmed: string[] = []
      const missing: string[] = []

      for (var i = 0; i < names.length; i++) {
        const name = names[i] ?? ""

        if (!name) {
          continue
        }

        if (hasFile(name)) {
          confirmed.push(name)
          continue
        }

        missing.push(name)
      }

      const failed = toolFailureRows(results)
      const allOk = failed.length === 0
      const filesText = names.map((name) => `- ${name}`).join("\n")
      const confirmedText = confirmed.length ? confirmed.map((name) => `- ${name}`).join("\n") : "- none"
      var text = ""

      if (allOk && !missing.length) {
        text = [
          "Created a great-looking Hello World website in the active session folder using separate files.",
          "Files created:",
          filesText,
          "Verified with fs_list:",
          confirmedText,
          "Open index.html in the active session folder to preview the page.",
        ].join("\n")
      }

      if (!text && allOk) {
        text = [
          "Created a great-looking Hello World website in the active session folder using separate files.",
          "Files created:",
          filesText,
          "fs_list completed, but file-name confirmation was partial.",
          "Open index.html in the active session folder to preview the page.",
        ].join("\n")
      }

      if (!text) {
        const failText = failed.length
          ? failed.map((row) => `- ${row.tool}${row.input ? ` (${row.input})` : ""}: ${row.error}`).join("\n")
          : "- Unknown file operation failure."
        text = [
          "I could not finish creating the Hello World website in the active session folder because one or more file operations failed.",
          "Failed operations:",
          failText,
        ].join("\n")
      }

      const ctx = {
        type: "file_build_fallback",
        source: "deterministic",
        files: names,
        confirmed,
        missing,
        failed,
      }
      return { text, ctx, results }
    }
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

    const execTools = async (plan: PlanOut | null, mark?: () => void) => {
      const results: ToolResult[] = []
      const ctxTools: unknown[] = []
      var ctxType = ""
      var webCount = 0
      var termCount = 0
      var now0: NowCtx | null = null
      var autoListed = false
      var autoListOk = false
      const list = Array.isArray(plan?.tool_requests) ? plan?.tool_requests ?? [] : []
      const nextId = () => {
        const rid0 = globalThis.crypto?.randomUUID?.() ?? ""
        const rid = rid0 || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
        return rid
      }

      for (var i = 0; i < list.length; i++) {
        const req = list[i]
        const tool0 = typeof req?.tool === "string" ? req.tool : ""
        const tool1 = normTool(tool0)

        if (!tool1) {
          continue
        }

        if (!allowTool(tool1)) {
          results.push({ tool: tool1, ok: false, error: "Tool not allowed", input: req?.inputs })
          continue
        }

        const kind = toolKind(tool1)
        const inputs = (req?.inputs && typeof req.inputs === "object" ? req.inputs : null) as Record<string, unknown> | null
        const input = inputs ?? {}

        if (kind) {
          const qs = pickQueries(input, query)

          if (!qs.length) {
            results.push({ tool: kind, ok: false, error: "Missing query", input })
            continue
          }

          if (terminalOnly) {
            if (!runTool) {
              results.push({ tool: "terminal_exec", ok: false, error: "Tool runner unavailable", input: { command: "mcp-search" } })
              continue
            }

            if (!allowExec) {
              results.push({ tool: "terminal_exec", ok: false, error: "terminal_exec not allowed", input: { command: "mcp-search" } })
              continue
            }

            if (mark) {
              mark()
            }

            var tag = ""
            const needDate = kind === "news" || kind === "time" || qs.some((q) => isRecencyQuery(q))

            if (needDate) {
              if (termCount >= termBudget) {
                results.push({ tool: "terminal_exec", ok: false, error: "Tool budget exceeded", input: { command: "date -u +%Y-%m-%d" } })
                continue
              }

              termCount++
              const id0 = nextId()
              const res0 = await runTool("terminal_exec", { command: "date -u +%Y-%m-%d" }, { id: id0 })
              const ok0 = !!(res0 && typeof res0 === "object" && (res0 as { ok?: unknown }).ok === true)
              results.push({ tool: "terminal_exec", ok: ok0, input: { command: "date -u +%Y-%m-%d" }, result: res0 })
              const row0 = (res0 && typeof res0 === "object" ? res0 : null) as { output?: unknown } | null
              const out0 = typeof row0?.output === "string" ? row0.output : ""
              const line0 = out0.split("\n")[0] ?? ""
              const line1 = clean(line0)

              if (line1) {
                tag = line1
              }
            }

            for (var qi = 0; qi < qs.length; qi++) {
              if (termCount >= termBudget) {
                results.push({ tool: "terminal_exec", ok: false, error: "Tool budget exceeded", input: { command: "mcp-search" } })
                continue
              }

              termCount++
              const q0 = qs[qi] ?? ""
              const needTag = (kind === "news" || kind === "time" || isRecencyQuery(q0)) && tag && !hasIsoDate(q0)
              const q1 = needTag ? `${tag} ${q0}` : q0
              const esc = q1.replace(/"/g, '\\"').replace(/\r/g, " ").replace(/\n/g, " ")
              const cmd = `mcp-search "${esc}"`
              const id1 = nextId()
              const res1 = await runTool("terminal_exec", { command: cmd }, { id: id1 })
              const ok1 = !!(res1 && typeof res1 === "object" && (res1 as { ok?: unknown }).ok === true)
              results.push({ tool: "terminal_exec", ok: ok1, input: { command: cmd }, result: res1 })
            }
            continue
          }

          for (var qi = 0; qi < qs.length; qi++) {
            if (webCount >= webBudget) {
              results.push({ tool: kind, ok: false, error: "Tool budget exceeded", input })
              continue
            }

            webCount++

            if (mark) {
              mark()
            }

            if (!now0) {
              now0 = await now()
            }

            const q0 = qs[qi] ?? ""
            const needTag = (kind === "news" || kind === "time" || isRecencyQuery(q0)) && !hasIsoDate(q0)
            const q1 = needTag ? `${now0.dateIso} ${q0}` : q0
            const min = pickDate(q1)
            const ctx0 = await web(q1, kind, min, now0)

            if (!ctx0 || typeof ctx0 !== "object") {
              results.push({ tool: kind, ok: false, error: "Lookup failed", input })
              continue
            }

            ctxTools.push(ctx0)

            if (!ctxType) {
              ctxType = kind
            }

            results.push({ tool: kind, ok: true, input, result: ctx0 })
          }
          continue
        }

        if (!runTool) {
          results.push({ tool: tool1, ok: false, error: "Tool runner unavailable", input })
          continue
        }

        if (tool1.startsWith("terminal_")) {
          if (tool1 === "terminal_exec" || tool1 === "terminal_send") {
            if (!allowExec) {
              results.push({ tool: tool1, ok: false, error: "terminal_exec not allowed", input })
              continue
            }
          }

          if (termCount >= termBudget) {
            results.push({ tool: tool1, ok: false, error: "Tool budget exceeded", input })
            continue
          }

          termCount++
        }

        const id = nextId()
        const res = await runTool(tool1, input, { id })
        const ok = !!(res && typeof res === "object" && (res as { ok?: unknown }).ok === true)
        results.push({ tool: tool1, ok, input, result: res })
      }

      if (runTool && needSessionList(results)) {
        if (mark) {
          mark()
        }

        const input = { path: ".", recursive: true, max_depth: 2, max_entries: 200 }
        const id = nextId()
        const res = await runTool("fs_list", input, { id })
        const ok = !!(res && typeof res === "object" && (res as { ok?: unknown }).ok === true)
        results.push({ tool: "fs_list", ok, input, result: res })
        autoListed = true
        autoListOk = ok
      }

      var ctx: unknown = null
      var note = ""

      if (ctxTools.length) {
        var min = 0
        var max = 0
        var reject = false

        for (var i = 0; i < ctxTools.length; i++) {
          const row = (ctxTools[i] && typeof ctxTools[i] === "object" ? ctxTools[i] : null) as {
            minDate?: unknown
            maxDate?: unknown
            rejectMissingDate?: unknown
            type?: unknown
          } | null

          if (!row) {
            continue
          }

          const min0 = typeof row.minDate === "number" ? row.minDate : 0
          const max0 = typeof row.maxDate === "number" ? row.maxDate : 0

          if (min0 && (!min || min0 < min)) {
            min = min0
          }

          if (max0 && max0 > max) {
            max = max0
          }

          if (row.rejectMissingDate === true) {
            reject = true
          }

          if (!ctxType) {
            const t0 = typeof row.type === "string" ? row.type : ""
            ctxType = t0.trim()
          }
        }

        const root: Record<string, unknown> = { type: ctxType || "web", tools: ctxTools, rejectMissingDate: reject }

        if (min) {
          root.minDate = min
        }

        if (max) {
          root.maxDate = max
        }

        if (now0) {
          const meta = applyLookupMeta(root, now0)
          ctx = meta.ctx
          note = meta.note
        }

        if (!now0) {
          ctx = root
        }
      }

      if (autoListed && autoListOk) {
        note = note
          ? `${note} Confirm created files using the session folder listing from fs_list in your final reasoning.`
          : "Confirm created files using the session folder listing from fs_list in your final reasoning."
      }

      if (autoListed && !autoListOk) {
        note = note
          ? `${note} A required session folder listing check failed; report that file confirmation could not be verified.`
          : "A required session folder listing check failed; report that file confirmation could not be verified."
      }

      return { results, ctx, note }
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
      const rid0 = globalThis.crypto?.randomUUID?.() ?? ""
      const rid = rid0 || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
      const enc = new TextEncoder()
      const out = new ReadableStream({
        start: (ctl) => {
          var closed = false
          var final = ""
          var keep: ReturnType<typeof setInterval> | 0 = 0
          var terms = new Map<string, { tool: string; args?: unknown }>()
          var termDone = new Set<string>()
          var sentText = false
          var sentTerm = false

          const end = () => {
            if (closed) {
              return
            }

            closed = true

            if (keep) {
              clearInterval(keep)
              keep = 0
            }

            ctl.close()
          }

          const push = (ev: string, data?: string) => {
            if (closed) {
              return
            }

            const e0 = typeof ev === "string" ? ev : ""
            const e = e0.trim()

            if (e) {
              ctl.enqueue(enc.encode(`event: ${e}\n`))
            }

            const d0 = typeof data === "string" ? data : ""
            const d = d0.replace(/\r/g, "")
            const lines = d ? d.split("\n") : [""]

            for (var i = 0; i < lines.length; i++) {
              const line = lines[i] ?? ""
              ctl.enqueue(enc.encode(`data: ${line}\n`))
            }

            ctl.enqueue(enc.encode("\n"))
          }

          const comment = (data?: string) => {
            if (closed) {
              return
            }

            const d0 = typeof data === "string" ? data : ""
            const d = d0.replace(/\r/g, "")
            ctl.enqueue(enc.encode(`: ${d}\n\n`))
          }

          const termStart = (id: string, tool: string, args?: unknown) => {
            if (closed) {
              return
            }

            const key0 = typeof id === "string" ? id : ""
            const key = key0.trim()

            if (!key) {
              return
            }

            if (terms.has(key)) {
              return
            }

            sentTerm = true
            const tool0 = typeof tool === "string" ? tool : ""
            const name = tool0.trim() || "terminal"
            terms.set(key, { tool: name, args })
            const payload = {
              phase: "start",
              tool: name,
              id: key,
              stepId: key,
              args,
              runId: rid,
              sessionId: sid,
              ts: new Date().toISOString(),
            }
            push("term", JSON.stringify(payload))
          }

          const termEnd = (id: string, tool: string, phase: "done" | "error", result?: unknown, args?: unknown) => {
            if (closed) {
              return
            }

            const key0 = typeof id === "string" ? id : ""
            const key = key0.trim()

            if (!key) {
              return
            }

            if (termDone.has(key)) {
              return
            }

            if (!terms.has(key)) {
              termStart(key, tool, args)
            }

            termDone.add(key)
            sentTerm = true
            const tool0 = typeof tool === "string" ? tool : ""
            const name = tool0.trim() || "terminal"
            const payload = {
              phase,
              tool: name,
              id: key,
              stepId: key,
              args,
              result,
              runId: rid,
              sessionId: sid,
              ts: new Date().toISOString(),
            }
            push("term", JSON.stringify(payload))
          }

          const flushTerms = (msg: string) => {
            if (closed) {
              return
            }

            const m0 = typeof msg === "string" ? msg : ""
            const m = m0.trim() || "Run terminated"
            const ts = new Date().toISOString()

            terms.forEach((row, key) => {
              if (termDone.has(key)) {
                return
              }

              termDone.add(key)
              const tool0 = typeof row?.tool === "string" ? row.tool : ""
              const tool = tool0.trim() || "terminal"
              const payload = {
                phase: "error",
                tool,
                id: key,
                stepId: key,
                args: row?.args,
                result: { error: m },
                runId: rid,
                sessionId: sid,
                ts,
              }
              push("term", JSON.stringify(payload))
            })
          }

          const finish = (kind: "done" | "error", msg?: string) => {
            if (final) {
              end()
              return
            }

            final = kind

            if (kind === "done" && !sentText && !sentTerm) {
              push("done", "")
              end()
              return
            }

            if (kind === "error") {
              const m0 = typeof msg === "string" ? msg : ""
              const m = m0.trim() || "Stream error"
              flushTerms(m)
              push("error", m)
              end()
              return
            }

            flushTerms("Run finished before tool completion")
            push("done", "")
            end()
          }

          const started = new Date().toISOString()
          push("run", JSON.stringify({ phase: "start", runId: rid, sessionId: sid, ts: started }))

          work = () => {
            if (worked) {
              return
            }

            worked = true
            push("work", "1")
          }
          emitTerm = (evt) => {
            const p0 = typeof evt?.phase === "string" ? evt.phase : ""
            const phase = p0.trim()
            const id0 = typeof evt?.id === "string" ? evt.id : ""
            const id1 = id0.trim()
            const id = id1 || "tool"
            const tool0 = typeof evt?.tool === "string" ? evt.tool : ""
            const tool = tool0.trim() || "terminal"
            const args = evt?.args
            const result = evt?.result

            if (phase === "start") {
              termStart(id, tool, args)
              return
            }

            if (phase === "update") {
              if (!terms.has(id)) {
                termStart(id, tool, args)
              }

              sentTerm = true
              const payload = {
                phase: "update",
                tool,
                id,
                stepId: id,
                args,
                result,
                runId: rid,
                sessionId: sid,
                ts: new Date().toISOString(),
              }
              push("term", JSON.stringify(payload))
              return
            }

            if (phase === "done" || phase === "error") {
              termEnd(id, tool, phase, result, args)
            }
          }

          const stop = () => {
            finish("error", "Request aborted")
          }

          if (sig.aborted) {
            finish("error", "Request aborted")
            return
          }

          sig.addEventListener("abort", stop, { once: true })

          keep = setInterval(() => {
            comment("keepalive")
          }, 15000)

          const sendText = async (msg: string) => {
            const parts = streamParts(msg)

            if (!parts.length) {
              return
            }

            sentText = true
            const wait = streamDelay()
            const group = streamGroup()
            var buf = ""
            var count = 0

            for (var i = 0; i < parts.length; i++) {
              if (sig.aborted) {
                return
              }

              const part = parts[i] ?? ""
              buf += part
              count++

              if (count < group) {
                continue
              }

              push("delta", buf)
              buf = ""
              count = 0

              if (wait > 0) {
                await new Promise((res) => setTimeout(res, wait))
              }
            }

            if (buf) {
              push("delta", buf)
            }
          }

          const sendFailure = async (
            stage: DiagnosticStage,
            reason: string,
            hasToolPlan?: boolean,
            toolResults?: ToolResult[],
          ) => {
            const why = sanitizeFailureReason(reason)
            const info = await modelFailure(stage, why, true, hasToolPlan, toolResults)

            await sendText(info.out.text)
            await logger
              .write("transcripts", "chat_response", {
                ts: new Date().toISOString(),
                chatId: cid,
                sessionId: sid,
                model,
                text: info.out.text,
                ctx: modelFailureCtx(info.fail, info.out, "stream"),
              })
              .catch(() => {})
            finish("done", "")
          }

          const run = async () => {
            var pinged = false
            var plabel = ""
            const ping = (label?: string) => {
              const s0 = typeof label === "string" ? label : ""
              const s1 = s0.trim()
              const s = s1 || "search"

              if (pinged && s === plabel) {
                return
              }

              pinged = true
              plabel = s
              push("search", s)
            }

            if (timeLocal) {
              const fallback = timeFromClock()
              const txt0 = typeof fallback.text === "string" ? fallback.text : ""
              const txt = txt0.trim()

              if (!txt) {
                finish("error", "Time lookup failed")
                return
              }

              await sendText(txt)
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
              finish("done", "")
              return
            }

            const fileOut = await runHelloSiteFallback()

            if (fileOut) {
              var text = fileOut.text

              if (lang !== "English" && !strict) {
                const t0 = await translate(text, lang)

                if (t0) {
                  text = t0
                }
              }

              await sendText(text)
              await logger
                .write("transcripts", "chat_response", {
                  ts: new Date().toISOString(),
                  chatId: cid,
                  sessionId: sid,
                  model,
                  text,
                  ctx: fileOut.ctx,
                })
                .catch(() => {})
              finish("done", "")
              return
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
                  if (greet) {
                    txt = "How can I help you?"
                  } else {
                    const m1 = fetchFail(ctx)

                    if (m1) {
                      await sendText(m1)
                      await logger
                        .write("transcripts", "chat_response", {
                          ts: new Date().toISOString(),
                          chatId: cid,
                          sessionId: sid,
                          model,
                          text: m1,
                          ctx,
                        })
                        .catch(() => {})
                      finish("done", "")
                      return
                    }

                    const msg = deny(ctx, last)

                    if (msg) {
                      await sendText(msg)
                      await logger
                        .write("transcripts", "chat_response", {
                          ts: new Date().toISOString(),
                          chatId: cid,
                          sessionId: sid,
                          model,
                          text: msg,
                          ctx,
                        })
                        .catch(() => {})
                      finish("done", "")
                      return
                    }

                    if (!urls.length) {
                      txt = noSourcesMessage(last, hadLookup(ctx))
                    }

                    if (urls.length) {
                      txt = enforceStyle(txt)
                      txt = citeAll(txt, urls)
                    }
                  }
                }

                if (!strict && urls.length) {
                  txt = appendSources(txt, urls)
                }

                if (!txt) {
                  await sendFailure("reasoning", "Model returned no assistant response text.", false, [])
                  return
                }

                await sendText(txt)
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
                finish("done", "")
                return
              }
            }

            const hasToolReq = !!(plan && plan.tool_requests.length)
            const toolPlan = hasToolReq ? plan : null
            const toolOut = await execTools(toolPlan, () => ping())
            const failStage: DiagnosticStage = hasToolReq || toolOut.results.length ? "execution" : "reasoning"
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

            const res = await clientPlain.call(feed, 0.2, undefined, sig, { tool_choice: "none" })
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
            var txt = ""

            if (!res.ok) {
              const eRaw = typeof res.error === "string" ? res.error : "DeepSeek error"
              txt = await retryText()

              if (!txt) {
                const e0 = sanitizeFailureReason(eRaw)
                await sendFailure(failStage, e0, hasToolReq, toolOut.results)
                return
              }
            }

            if (!txt) {
              txt = typeof res.text === "string" ? res.text : ""
            }

            if (isInvalidAssistantText(txt)) {
              txt = await retryText()
            }

            if (isInvalidAssistantText(txt)) {
              await sendFailure(
                failStage,
                "Model returned an invalid non-user-facing response.",
                hasToolReq,
                toolOut.results,
              )
              return
            }

            const ctx = toolOut.ctx
            const urls = pickUrls(ctx)

            if (strict) {
              if (greet) {
                txt = "How can I help you?"
              } else {
                const m1 = fetchFail(ctx)

                if (m1) {
                  await sendText(m1)
                  await logger
                    .write("transcripts", "chat_response", {
                      ts: new Date().toISOString(),
                      chatId: cid,
                      sessionId: sid,
                      model,
                      text: m1,
                      ctx,
                    })
                    .catch(() => {})
                  finish("done", "")
                  return
                }

                const msg = deny(ctx, last)

                if (msg) {
                  await sendText(msg)
                  await logger
                    .write("transcripts", "chat_response", {
                      ts: new Date().toISOString(),
                      chatId: cid,
                      sessionId: sid,
                      model,
                      text: msg,
                      ctx,
                    })
                    .catch(() => {})
                  finish("done", "")
                  return
                }

                if (!urls.length) {
                  txt = noSourcesMessage(last, hadLookup(ctx))
                }

                if (urls.length) {
                  txt = enforceStyle(txt)
                  txt = citeAll(txt, urls)
                }
              }
            }

            if (!strict && urls.length) {
              txt = appendSources(txt, urls)
            }

            if (!txt) {
              await sendFailure(failStage, "Model returned no assistant response text.", hasToolReq, toolOut.results)
              return
            }

            await sendText(txt)
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
            finish("done", "")
          }

          run().catch(async (err) => {
            if (sig.aborted) {
              finish("error", "Request aborted")
              return
            }

            const row = err && typeof err === "object" ? (err as { message?: unknown } | null) : null
            const m0 = typeof row?.message === "string" ? row.message : ""
            const m1 = m0.trim()
            const m = m1 || "Stream error"
            await sendFailure("environment", m, false, [])
          })
        },
      })

      return new Response(out, {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store",
          connection: "keep-alive",
          ...deps.corsHeaders,
        },
      })
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
          if (greet) {
            txt = "How can I help you?"
          } else {
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
          }
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
    const toolOut = await execTools(toolPlan)
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
      if (greet) {
        txt = "How can I help you?"
      } else {
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
      }
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
