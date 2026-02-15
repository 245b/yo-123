import type { Msg } from "../types"
import { clean } from "../utils/text"

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

export {
  hasUrl,
  firstUrl,
  isGreeting,
  isPlaceholder,
  shouldPlan,
  isFileBuildIntent,
  isHelloSiteIntent,
  helloSiteFiles,
  isLookupIntent,
  hasIsoDate,
  isRecencyQuery,
  noSourcesMessage,
  splitSentences,
  appendInst,
  stripFence,
  parseJson,
  termEntries,
}

export type {
  SiteFile,
  ToolRequest,
  PreflightResult,
  PlanStep,
  PlanReq,
  PlanOut,
  ToolResult,
  DiagnosticStage,
  DiagnosticSource,
  DiagnosticInfo,
  FailureTool,
  FailureContext,
  DiagnosticResult,
  TermEntry,
}
