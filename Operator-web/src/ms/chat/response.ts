import { apiUrlWithBase } from "../../lib/api"
import { AgentWsClientMessageSchema, decodeAgentWsServerEvent } from "../../../../packages/contracts/src/ws"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "xterm"
import type { Req, Run, TermEntry } from "./types"
import {
  buildNoTextCompletionDiagnostic,
  normalizeTermOutput,
  resolveExecCommandEndOutput,
  resolveExecCommandEndStatus,
  safeTrim,
} from "./response-helpers"

export { buildNoTextCompletionDiagnostic, resolveExecCommandEndOutput, resolveExecCommandEndStatus }

export type ReadResult = {
  stream: false
  ok: boolean
  st: number
  j: unknown
  t: string
}

export type StreamResult = {
  stream: true
  ok: boolean
  text: string
  error?: string
  stalled?: boolean
  terms?: TermEntry[]
  wsConnectedBase?: string
}

export type WsStreamInput = {
  win: Window
  run: Run
  req: Req
  bases: string[]
  mark: (el: HTMLElement, txt: string) => void
  ph: HTMLElement | null
  signal?: AbortSignal
  submit?: boolean
}

export const readResponse = (r: Response): Promise<ReadResult> => {
  const ct0 = r.headers.get("content-type") ?? ""
  const ct = ct0.toLowerCase()

  if (!ct.includes("application/json")) {
    return r.text().then((t): ReadResult => ({ stream: false, ok: false, st: r.status, j: null as unknown, t }))
  }

  const c = r.clone()

  return r
    .json()
    .then((j): ReadResult => ({ stream: false, ok: r.ok, st: r.status, j, t: "" }))
    .catch(() =>
      c
        .text()
        .then((t): ReadResult => ({ stream: false, ok: false, st: r.status, j: null as unknown, t }))
        .catch((): ReadResult => ({ stream: false, ok: false, st: r.status, j: null as unknown, t: "" })),
    )
}

const parseEvent = (raw: unknown) => {
  const parsed = decodeAgentWsServerEvent(raw)

  if (!parsed.success) {
    return null
  }

  const row = parsed.data as unknown as Record<string, unknown>
  const type = parsed.data.type

  return { type, row }
}

const connectWs = async (win: Window, bases: string[]) => {
  const wsFromHttp = (raw: string) => {
    const text0 = typeof raw === "string" ? raw : ""
    const text = text0.trim()

    if (!text) {
      return ""
    }

    if (text.startsWith("ws://") || text.startsWith("wss://")) {
      return text
    }

    if (text.startsWith("http://")) {
      return `ws://${text.slice(7)}`
    }

    if (text.startsWith("https://")) {
      return `wss://${text.slice(8)}`
    }

    return text
  }

  const wsFromPath = (raw: string) => {
    const p0 = typeof raw === "string" ? raw : ""
    const p1 = p0.trim() || "/api/chat/ws"
    const p = p1.startsWith("/") ? p1 : `/${p1}`
    const proto = win.location.protocol === "https:" ? "wss" : "ws"
    return `${proto}://${win.location.host}${p}`
  }

  const bases0 = Array.isArray(bases) ? bases : []
  const list: string[] = [""]

  for (var i = 0; i < bases0.length; i++) {
    const base0 = bases0[i] ?? ""
    const base = base0.trim()

    if (!base) {
      continue
    }

    if (list.includes(base)) {
      continue
    }

    list.push(base)
  }

  for (var i = 0; i < list.length; i++) {
    const base0 = list[i] ?? ""
    const base = base0.trim()
    const full = base ? apiUrlWithBase("/api/chat/ws", base) : "/api/chat/ws"
    const url = base ? wsFromHttp(full) : wsFromPath(full)

    if (!url) {
      continue
    }

    const out = await new Promise<{ ok: boolean; ws: WebSocket | null }>((resolve) => {
      var done = false
      const pickCtor = () => {
        const w = win as unknown as { eval?: unknown; WebSocket?: unknown } | null
        const ev = w?.eval

        if (typeof ev === "function") {
          try {
            const got = (ev as (code: string) => unknown).call(win, "WebSocket")

            if (typeof got === "function") {
              return got as typeof WebSocket
            }
          } catch {}
        }

        const ctor = w?.WebSocket

        if (typeof ctor === "function") {
          return ctor as typeof WebSocket
        }

        return WebSocket
      }

      const Ws = pickCtor()
      const ws = new Ws(url)

      const finish = (ok: boolean) => {
        if (done) {
          return
        }

        done = true
        resolve({ ok, ws: ok ? ws : null })
      }

      const t = setTimeout(() => {
        ws.close()
        finish(false)
      }, 6000)

      ws.addEventListener("open", () => {
        clearTimeout(t)
        finish(true)
      })
      ws.addEventListener("error", () => {
        clearTimeout(t)
        finish(false)
      })
      ws.addEventListener("close", () => {
        clearTimeout(t)
        finish(false)
      })
    })

    if (out.ok && out.ws) {
      return { ws: out.ws, base }
    }
  }

  return { ws: null as WebSocket | null, base: "" }
}

const termWrap = (ph: HTMLElement | null) => {
  const row0 = ph?.closest?.('[data-ms-row="1"]') ?? null
  const row = row0 && (row0 as Node).nodeType === 1 ? (row0 as HTMLElement) : null

  if (!row) {
    return null
  }

  const w0 = row.querySelector('[data-ms-wrap="1"]') ?? null
  const wrap = w0 && (w0 as Node).nodeType === 1 ? (w0 as HTMLElement) : null
  return wrap
}

type XtermState = {
  root: HTMLElement
  term: Terminal
  fit: FitAddon
  obs: ResizeObserver | null
}

type TermResizeState = {
  __ms_resize_obs?: ResizeObserver | null
  __ms_resize_timer?: number
  __ms_resize_dims?: string
}

const stopTermResizeObserver = (win: Window | null, box: HTMLElement | null) => {
  const w = win ?? null
  const row = box as (HTMLElement & TermResizeState) | null

  if (!row) {
    return
  }

  const obs = row.__ms_resize_obs ?? null

  if (obs) {
    obs.disconnect()
    row.__ms_resize_obs = null
  }

  const timer = row.__ms_resize_timer ?? 0

  if (timer && w) {
    w.clearTimeout(timer)
    row.__ms_resize_timer = 0
  }

  row.__ms_resize_dims = ""
}

const foldKeyFor = (id: string) => {
  const key0 = typeof id === "string" ? id : ""
  const key = key0.trim()
  return key ? `ms_term_fold_${key}` : "ms_term_fold_"
}

const readFold = (win: Window | null, id: string) => {
  const key = foldKeyFor(id)
  const raw0 = win?.localStorage?.getItem(key) ?? ""
  const raw = raw0.trim()

  if (raw === "1") {
    return true
  }

  if (raw === "0") {
    return false
  }

  return null as boolean | null
}

const writeFold = (win: Window | null, id: string, folded: boolean) => {
  const key = foldKeyFor(id)
  const want = folded ? "1" : "0"
  win?.localStorage?.setItem(key, want)
}

const autoFold = (input: string, output: string) => {
  if (input.includes("\n")) {
    return true
  }

  if (input.length > 120) {
    return true
  }

  if (output.length > 4000) {
    return true
  }

  return false
}

const firstLine = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0
  const rows = text.split(/\r?\n/g)

  for (var i = 0; i < rows.length; i++) {
    const row0 = rows[i] ?? ""
    const row = row0.trim()

    if (!row) {
      continue
    }

    return row
  }

  return ""
}

const firstQuoted = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0
  const hit = text.match(/"([^"]+)"|'([^']+)'/)

  if (!hit) {
    return ""
  }

  const a = typeof hit[1] === "string" ? hit[1] : ""
  const b = typeof hit[2] === "string" ? hit[2] : ""
  const out0 = a || b
  return out0.trim()
}

const summaryFor = (input: string) => {
  const line = firstLine(input)

  if (!line) {
    return ""
  }

  const q = firstQuoted(line)

  if (/\bmcp-search\b/.test(line) || /\bmcp-search\.js\b/.test(line)) {
    const tail0 = line.split(/\bmcp-search(?:\.js)?\b/).slice(1).join(" ").trim()
    const query = q || tail0

    if (query) {
      return `Searching about ${query}`
    }

    return "Searching..."
  }

  if (/\b(rg|grep)\b/.test(line)) {
    const pieces = line.split(/\s+/g).filter(Boolean)
    var seen = false

    for (var i = 0; i < pieces.length; i++) {
      const piece = pieces[i] ?? ""

      if (!seen) {
        if (piece === "rg" || piece === "grep") {
          seen = true
        }

        continue
      }

      if (piece.startsWith("-")) {
        continue
      }

      const pat0 = q || piece
      const pat = pat0.replace(/^['"]|['"]$/g, "")

      if (pat) {
        return `Searching for ${pat}`
      }
    }

    return "Searching..."
  }

  const clean = line.trim()
  const short = clean.length > 60 ? clean.slice(0, 60) : clean
  return short
}

const xtermMount = (box: HTMLElement | null) => {
  const el0 = box?.querySelector?.('[data-ms-term-out="1"]') ?? null
  return el0 && (el0 as Node).nodeType === 1 ? (el0 as HTMLElement) : null
}

const destroyXterm = (box: HTMLElement | null) => {
  const row = box as (HTMLElement & { __ms_xterm?: XtermState | null; __ms_xterm_out?: string }) | null
  const cur = row?.__ms_xterm ?? null

  if (!row) {
    return
  }

  if (!cur) {
    row.__ms_xterm_out = ""
    return
  }

  if (cur.obs) {
    cur.obs.disconnect()
  }

  cur.term.dispose()
  row.__ms_xterm = null
  row.__ms_xterm_out = ""
  cur.root.textContent = ""
}

const ensureXterm = (box: HTMLElement | null) => {
  if (!box) {
    return null
  }

  const root = xtermMount(box)

  if (!root) {
    return null
  }

  const row = box as HTMLElement & { __ms_xterm?: XtermState | null; __ms_xterm_out?: string }
  const cur = row.__ms_xterm ?? null

  if (cur && cur.root === root) {
    return cur
  }

  destroyXterm(box)

  const term = new Terminal({
    convertEol: true,
    disableStdin: true,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 12,
    scrollback: 2000,
    theme: {
      background: "transparent",
      foreground: "#f4f4f5",
      cursor: "#f4f4f5",
      selectionBackground: "rgba(255,255,255,0.22)",
    },
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(root)

  if (root.clientWidth > 40 && root.clientHeight > 20) {
    fit.fit()
  }

  const obs = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    if (root.clientWidth > 40 && root.clientHeight > 20) {
      fit.fit()
    }
  }) : null

  if (obs) {
    obs.observe(root)
  }

  const state: XtermState = { root, term, fit, obs }
  row.__ms_xterm = state
  row.__ms_xterm_out = ""
  return state
}

const ensureTermBox = (doc: Document, ph: HTMLElement | null, id: string, tool: string) => {
  const wrap = termWrap(ph)

  if (!wrap) {
    return null
  }

  const sel = `[data-ms-term-id="${id}"]`
  const ex0 = wrap.querySelector(sel) ?? null
  const ex = ex0 && (ex0 as Node).nodeType === 1 ? (ex0 as HTMLElement) : null

  if (ex) {
    bindTermBox(doc.defaultView ?? null, ex, id)
    return ex
  }

  const box = doc.createElement("div")
  box.className = "ms-term"
  box.setAttribute("data-ms-term-id", id)

  const head = doc.createElement("div")
  head.className = "ms-term-head"

  const tag = doc.createElement("div")
  tag.className = "ms-term-tag"
  tag.textContent = tool || "terminal"

  const right = doc.createElement("div")
  right.className = "ms-term-right"

  const win = doc.defaultView

  const fold = doc.createElement("button")
  fold.type = "button"
  fold.className = "ms-term-fold"
  fold.setAttribute("aria-label", "Toggle terminal output collapse")
  fold.textContent = ">"

  const status = doc.createElement("div")
  status.className = "ms-term-muted"
  status.setAttribute("data-ms-term-status", "1")
  status.textContent = "running"

  head.appendChild(tag)
  right.appendChild(fold)
  right.appendChild(status)
  head.appendChild(right)

  const body = doc.createElement("div")
  body.className = "ms-term-body"

  const summaryWrap = doc.createElement("div")
  summaryWrap.className = "ms-term-summary"
  summaryWrap.setAttribute("data-ms-term-summary-wrap", "1")

  const summary = doc.createElement("span")
  summary.className = "ms-term-summary-text"
  summary.setAttribute("data-ms-term-summary", "1")

  const ellipsis = doc.createElement("span")
  ellipsis.className = "ms-term-summary-ellipsis"
  ellipsis.textContent = "\u2026 "

  const summaryToggle = doc.createElement("button")
  summaryToggle.type = "button"
  summaryToggle.className = "ms-term-summary-toggle"
  summaryToggle.setAttribute("aria-label", "Expand terminal output")
  summaryToggle.textContent = "<"

  summaryWrap.appendChild(summary)
  summaryWrap.appendChild(ellipsis)
  summaryWrap.appendChild(summaryToggle)

  const details = doc.createElement("div")
  details.className = "ms-term-details"
  details.setAttribute("data-ms-term-details", "1")

  const inLabel = doc.createElement("div")
  inLabel.className = "ms-term-label"
  inLabel.textContent = "input"

  const inPre = doc.createElement("div")
  inPre.className = "ms-term-pre"
  inPre.setAttribute("data-ms-term-in", "1")

  const outLabel = doc.createElement("div")
  outLabel.className = "ms-term-label"
  outLabel.textContent = "output"

  const out = doc.createElement("div")
  out.className = "ms-term-xterm"
  out.setAttribute("data-ms-term-out", "1")

  const rawOut = doc.createElement("div")
  rawOut.setAttribute("data-ms-term-raw", "1")
  rawOut.style.display = "none"

  details.appendChild(inLabel)
  details.appendChild(inPre)
  details.appendChild(outLabel)
  details.appendChild(out)
  body.appendChild(summaryWrap)
  body.appendChild(details)
  body.appendChild(rawOut)
  box.appendChild(head)
  box.appendChild(body)

  const manual = readFold(win ?? null, id)

  if (manual === true) {
    setFoldState(box, true)
  }
  bindTermBox(win ?? null, box, id)

  const tools0 = wrap.querySelector('[data-ms-tools="1"]') ?? null
  const tools = tools0 && (tools0 as Node).nodeType === 1 ? (tools0 as HTMLElement) : null

  if (tools) {
    wrap.insertBefore(box, tools)
    return box
  }

  wrap.appendChild(box)
  return box
}

const setTermText = (box: HTMLElement | null, sel: string, text: string) => {
  if (!box) {
    return
  }

  const el0 = box.querySelector(sel) ?? null
  const el = el0 && (el0 as Node).nodeType === 1 ? (el0 as HTMLElement) : null

  if (!el) {
    return
  }

  el.textContent = text
}

const setTermStatus = (box: HTMLElement | null, status: string) => {
  setTermText(box, '[data-ms-term-status="1"]', status)
}

const setFoldState = (box: HTMLElement | null, folded: boolean) => {
  if (!box) {
    return
  }

  const btn0 = box.querySelector(".ms-term-fold") ?? null
  const btn = btn0 && (btn0 as Node).nodeType === 1 ? (btn0 as HTMLButtonElement) : null

  if (folded) {
    box.setAttribute("data-ms-term-folded", "1")

    if (btn) {
      btn.textContent = "<"
    }

    destroyXterm(box)
    return
  }

  box.removeAttribute("data-ms-term-folded")

  if (btn) {
    btn.textContent = ">"
  }
}

type TermBound = { __ms_term_bound?: true }

const bindTermBox = (win: Window | null, box: HTMLElement, id: string) => {
  const row = box as HTMLElement & TermBound & { __ms_term?: TermEntry | null; __ms_xterm_out?: string }

  if (row.__ms_term_bound === true) {
    return
  }

  row.__ms_term_bound = true
  const toggle = (ev: Event) => {
    const b0 = (ev as PointerEvent).button
    const ok = typeof b0 !== "number" || b0 === 0

    if (!ok) {
      return
    }

    const path = (ev as PointerEvent).composedPath?.() ?? []
    var btn: Element | null = null

    for (var i = 0; i < path.length; i++) {
      const n = path[i]
      const b0 = n as { tagName?: string } | null

      if (b0?.tagName !== "BUTTON") {
        continue
      }

      btn = b0 as unknown as Element
      break
    }

    if (!btn) {
      const t = ev.target as { closest?: (s: string) => Element | null } | null
      btn = t?.closest?.("button") ?? null
    }

    if (!btn) {
      return
    }

    const c0 = (btn.getAttribute("class") ?? "").trim()
    const isFold = c0.includes("ms-term-fold")
    const isExp = c0.includes("ms-term-summary-toggle")

    if (!isFold && !isExp) {
      return
    }

    ev.preventDefault()
    ev.stopPropagation()

    const was = box.getAttribute("data-ms-term-folded") === "1"
    const next = !was
    setFoldState(box, next)
    writeFold(win ?? null, id, next)

    if (next) {
      stopTermResizeObserver(win ?? null, box)
      destroyXterm(box)
      return
    }

    const term = row.__ms_term ?? null

    if (!term) {
      return
    }

    setTermText(box, '[data-ms-term-in="1"]', term.input)
    setTermText(box, '[data-ms-term-raw="1"]', term.output)
    destroyXterm(box)
    const state = ensureXterm(box)

    if (!state) {
      return
    }

    state.term.write(term.output)
    row.__ms_xterm_out = term.output
  }

  box.addEventListener("click", toggle, true)
}

const addCompactionMarker = (doc: Document, ph: HTMLElement | null, id: string) => {
  const key = safeTrim(id)

  if (!key) {
    return
  }

  const wrap = termWrap(ph)

  if (!wrap) {
    return
  }

  const ex = wrap.querySelector(`[data-ms-compact-id="${key}"]`)

  if (ex && (ex as Node).nodeType === 1) {
    return
  }

  const marker = doc.createElement("div")
  marker.setAttribute("data-ms-compact-id", key)
  marker.style.display = "flex"
  marker.style.flexDirection = "column"
  marker.style.gap = "6px"
  marker.style.marginTop = "10px"
  marker.style.marginBottom = "10px"

  const line = doc.createElement("div")
  line.style.width = "100%"
  line.style.height = "1px"
  line.style.background = "var(--border-main, rgba(255,255,255,0.2))"
  line.style.opacity = "0.8"

  const text = doc.createElement("div")
  text.textContent = "auto compacting..."
  text.style.fontSize = "11px"
  text.style.textTransform = "lowercase"
  text.style.letterSpacing = "0.06em"
  text.style.color = "var(--text-tertiary)"
  text.style.opacity = "0.85"
  text.style.transform = "translateY(30%)"

  marker.appendChild(line)
  marker.appendChild(text)

  const terms = wrap.querySelectorAll('[data-ms-term-id]')
  const lastTerm0 = terms.length ? terms[terms.length - 1] : null
  const lastTerm = lastTerm0 && (lastTerm0 as Node).nodeType === 1 ? (lastTerm0 as HTMLElement) : null

  if (lastTerm && lastTerm.parentNode === wrap) {
    wrap.insertBefore(marker, lastTerm)
    return
  }

  const tools0 = wrap.querySelector('[data-ms-tools="1"]')
  const tools = tools0 && (tools0 as Node).nodeType === 1 ? (tools0 as HTMLElement) : null

  if (tools) {
    wrap.insertBefore(marker, tools)
    return
  }

  wrap.appendChild(marker)
}

export const streamWsResponse = async (input: WsStreamInput): Promise<StreamResult> => {
  // `streamWsResponse` runs in the parent app realm (booting the snapshot iframe) but must render into the snapshot doc.
  const doc = input.ph?.ownerDocument ?? input.win.document
  const win = doc.defaultView ?? input.win
  const run = input.run
  const ph = input.ph
  const mark = input.mark
  const signal = input.signal
  const req = input.req
  const bases = input.bases
  const doSubmit = input.submit !== false
  const connected = await connectWs(win, bases)
  const ws = connected.ws

  if (!ws) {
    return { stream: true, ok: false, text: "", error: "WebSocket connect failed" }
  }

  run.ws = ws
  run.txt = ""
  var txt = ""
  var err = ""
  var done = false
  var stalled = false
  const stallMs = 180000
  var last = Date.now()
  var taskSeen = false
  var compacts = 0
  var turnStatus = ""
  var turnDetail = ""
  const order: string[] = []
  const map: Record<string, TermEntry> = {}
  const procByCall: Record<string, string> = {}
  const emittedByCall: Record<string, string> = {}
  const promptByCall: Record<string, HTMLElement> = {}
  var capApprovals = true
  var capUserInput = true
  var capResize = true
  const rt: Record<string, { state: string; lag: number; restarts: number; limit: number; reason: string }> = {}
  const wsSend = (payload: unknown) => {
    if (ws.readyState !== 1) {
      return
    }

    ws.send(JSON.stringify(payload))
  }
  const runtimeBox = () => {
    const id = "__ms_runtime_status"
    const ex0 = doc.getElementById(id) ?? null
    const ex = ex0?.tagName === "DIV" ? (ex0 as HTMLDivElement) : null

    if (ex) {
      return ex
    }

    const list0 = doc.getElementById("__ms_ds_list") ?? null
    const list = list0?.tagName === "DIV" ? (list0 as HTMLDivElement) : null
    const div = doc.createElement("div")
    div.id = id
    div.setAttribute("data-ms-runtime", "1")
    div.style.display = "none"
    div.style.padding = "8px 12px"
    div.style.margin = "8px auto 0"
    div.style.maxWidth = "768px"
    div.style.border = "1px solid rgba(0,0,0,0.12)"
    div.style.borderRadius = "10px"
    div.style.background = "rgba(250,250,250,0.9)"
    div.style.fontSize = "12px"
    div.style.lineHeight = "1.2"
    div.style.color = "rgba(0,0,0,0.75)"
    div.style.whiteSpace = "pre-wrap"

    if (list) {
      list.insertBefore(div, list.firstChild)
      return div
    }

    const home0 = doc.getElementById("chat-home-view-container") ?? null
    const home = home0?.tagName === "DIV" ? (home0 as HTMLDivElement) : null

    if (home) {
      home.insertBefore(div, home.firstChild)
      return div
    }

    doc.body.appendChild(div)
    return div
  }
  const renderRuntime = () => {
    const box = runtimeBox()

    if (!box) {
      return
    }

    const roles = Object.keys(rt)

    if (!roles.length) {
      box.textContent = ""
      box.style.display = "none"
      return
    }

    roles.sort()
    var worst = "ready"

    for (var i = 0; i < roles.length; i++) {
      const role = roles[i] ?? ""
      const row = rt[role]
      const st = safeTrim(row?.state)

      if (st === "degraded") {
        worst = "degraded"
        break
      }

      if (st === "starting" && worst !== "degraded") {
        worst = "starting"
      }
    }

    const head = worst === "degraded" ? "Runtime degraded" : worst === "starting" ? "Runtime starting" : "Runtime ready"
    const lines: string[] = [head]

    for (var i = 0; i < roles.length; i++) {
      const role = roles[i] ?? ""
      const row = rt[role]
      const st = safeTrim(row?.state) || "unknown"
      const lag = Number.isFinite(row?.lag) ? Math.max(0, Math.floor(row.lag)) : 0
      const restarts = Number.isFinite(row?.restarts) ? Math.max(0, Math.floor(row.restarts)) : 0
      const limit = Number.isFinite(row?.limit) ? Math.max(0, Math.floor(row.limit)) : 0
      const why = safeTrim(row?.reason)
      const suffix = why ? ` (${why})` : ""
      lines.push(`${role}: ${st} lag=${Math.round(lag / 100) / 10}s restarts=${restarts}/${limit}${suffix}`)
    }

    box.textContent = lines.join("\n")
    box.style.display = "block"
    box.style.background = worst === "degraded" ? "rgba(255,242,242,0.95)" : worst === "starting" ? "rgba(255,250,229,0.95)" : "rgba(250,250,250,0.9)"
    box.style.borderColor = worst === "degraded" ? "rgba(214,40,40,0.35)" : worst === "starting" ? "rgba(179,132,0,0.35)" : "rgba(0,0,0,0.12)"
  }
  const callForProcess = (processId: string) => {
    const pid = safeTrim(processId)

    if (!pid) {
      return ""
    }

    const keys = Object.keys(procByCall)

    for (var i = 0; i < keys.length; i++) {
      const key = keys[i] ?? ""

      if (!key) {
        continue
      }

      if (procByCall[key] === pid) {
        return key
      }
    }

    return ""
  }
  const promptHost = () => {
    const wrap = termWrap(ph)

    if (wrap) {
      const ex0 = wrap.querySelector('[data-ms-prompts="1"]') ?? null
      const ex = ex0 && (ex0 as Node).nodeType === 1 ? (ex0 as HTMLElement) : null

      if (ex) {
        return ex
      }

      const box = doc.createElement("div")
      box.setAttribute("data-ms-prompts", "1")
      box.style.display = "flex"
      box.style.flexDirection = "column"
      box.style.gap = "8px"
      box.style.marginTop = "8px"
      const tools0 = wrap.querySelector('[data-ms-tools="1"]') ?? null
      const tools = tools0 && (tools0 as Node).nodeType === 1 ? (tools0 as HTMLElement) : null

      if (tools) {
        wrap.insertBefore(box, tools)
        return box
      }

      wrap.appendChild(box)
      return box
    }

    const list0 = doc.getElementById("__ms_ds_list") ?? null
    const list = list0?.tagName === "DIV" ? (list0 as HTMLDivElement) : null
    const home0 = doc.getElementById("chat-home-view-container") ?? null
    const home = home0?.tagName === "DIV" ? (home0 as HTMLDivElement) : null
    const root = list ?? home ?? doc.body

    const ex0 = root.querySelector('[data-ms-global-prompts="1"]') ?? null
    const ex = ex0 && (ex0 as Node).nodeType === 1 ? (ex0 as HTMLElement) : null

    if (ex) {
      return ex
    }

    const box = doc.createElement("div")
    box.setAttribute("data-ms-global-prompts", "1")
    box.style.display = "flex"
    box.style.flexDirection = "column"
    box.style.gap = "8px"
    box.style.marginTop = "8px"
    root.insertBefore(box, root.firstChild)
    return box
  }
  const clearPrompt = (callId: string) => {
    const key = safeTrim(callId)

    if (!key) {
      return
    }

    const row = promptByCall[key]

    if (!row) {
      return
    }

    if (row.parentNode) {
      row.parentNode.removeChild(row)
    }

    delete promptByCall[key]
  }
  const clearPrompts = () => {
    const keys = Object.keys(promptByCall)

    for (var i = 0; i < keys.length; i++) {
      const key = keys[i] ?? ""

      if (!key) {
        continue
      }

      clearPrompt(key)
    }
  }
  const ensureInteractiveControls = (box: HTMLElement | null, callId: string, processId: string | undefined, status: string) => {
    if (!box) {
      return
    }

    const folded = box.getAttribute("data-ms-term-folded") === "1"
    const boxExt = box as HTMLElement & TermResizeState

    const body0 = box.querySelector(".ms-term-body") ?? null
    const body = body0 && (body0 as Node).nodeType === 1 ? (body0 as HTMLElement) : null

    if (!body) {
      return
    }

    const host0 = box.querySelector('[data-ms-term-details="1"]') ?? body
    const host = host0 && (host0 as Node).nodeType === 1 ? (host0 as HTMLElement) : null

    if (!host) {
      return
    }

    const ex0 = host.querySelector('[data-ms-term-live="1"]') ?? null
    const ex = ex0 && (ex0 as Node).nodeType === 1 ? (ex0 as HTMLElement) : null
    const pid0 = safeTrim(processId)

    if (!pid0 || status !== "running" || folded) {
      if (ex && ex.parentNode) {
        ex.removeAttribute("data-ms-call-id")
        ex.removeAttribute("data-ms-process-id")
        ex.parentNode.removeChild(ex)
      }

      stopTermResizeObserver(win ?? null, box)
      return
    }

    const pid = pid0
    var row = ex

    if (!row) {
      row = doc.createElement("div")
      row.setAttribute("data-ms-term-live", "1")
      row.style.display = "flex"
      row.style.alignItems = "center"
      row.style.gap = "8px"
      row.style.paddingTop = "4px"

      const input = doc.createElement("input")
      input.type = "text"
      input.setAttribute("data-ms-term-live-input", "1")
      input.placeholder = "Send stdin"
      input.style.flex = "1"
      input.style.minWidth = "0"
      input.style.border = "1px solid var(--border-main, rgba(255,255,255,0.2))"
      input.style.borderRadius = "8px"
      input.style.background = "transparent"
      input.style.color = "var(--text-primary)"
      input.style.padding = "6px 8px"
      input.style.fontSize = "12px"

      const send = doc.createElement("button")
      send.type = "button"
      send.textContent = "Send"
      send.style.border = "1px solid var(--border-main, rgba(255,255,255,0.2))"
      send.style.borderRadius = "8px"
      send.style.background = "transparent"
      send.style.color = "var(--text-primary)"
      send.style.padding = "6px 10px"
      send.style.fontSize = "12px"
      send.style.cursor = "pointer"
      send.addEventListener("click", () => {
        const val0 = input.value ?? ""
        const val = val0

        if (!val) {
          return
        }

        const target0 = row?.getAttribute("data-ms-process-id") ?? ""
        const target = target0.trim()

        if (!target) {
          return
        }

        wsSend({
          type: "write_stdin",
          process_id: target,
          chars: `${val}\n`,
          yield_time_ms: 400,
        })
        input.value = ""
      })
      input.addEventListener("keydown", (ev) => {
        const key = (ev as KeyboardEvent).key

        if (key !== "Enter") {
          return
        }

        ev.preventDefault()
        send.click()
      })

      const stop = doc.createElement("button")
      stop.type = "button"
      stop.textContent = "Stop"
      stop.style.border = "1px solid var(--border-main, rgba(255,255,255,0.2))"
      stop.style.borderRadius = "8px"
      stop.style.background = "transparent"
      stop.style.color = "var(--text-primary)"
      stop.style.padding = "6px 10px"
      stop.style.fontSize = "12px"
      stop.style.cursor = "pointer"
      stop.addEventListener("click", () => {
        const target0 = row?.getAttribute("data-ms-process-id") ?? ""
        const target = target0.trim()

        if (!target) {
          return
        }

        wsSend({
          type: "terminate_command",
          process_id: target,
        })
      })

      row.appendChild(input)
      row.appendChild(send)
      row.appendChild(stop)
      host.appendChild(row)
    }

    const prevPid0 = row.getAttribute("data-ms-process-id") ?? ""
    const prevPid = prevPid0.trim()

    if (prevPid && prevPid !== pid) {
      boxExt.__ms_resize_dims = ""
    }

    row.setAttribute("data-ms-call-id", callId)
    row.setAttribute("data-ms-process-id", pid)

    if (!capResize) {
      stopTermResizeObserver(win ?? null, box)
      return
    }

    if (typeof ResizeObserver !== "function") {
      stopTermResizeObserver(win ?? null, box)
      return
    }

    if (!boxExt.__ms_resize_obs) {
      const onResize = () => {
        const target0 = row?.getAttribute("data-ms-process-id") ?? ""
        const target = target0.trim()

        if (!target) {
          return
        }

        const out0 = box.querySelector('[data-ms-term-out="1"]') ?? null
        const out = out0 && (out0 as Node).nodeType === 1 ? (out0 as HTMLElement) : null
        const width = out?.clientWidth ?? box.clientWidth
        const height = out?.clientHeight ?? box.clientHeight
        const cols = Math.max(40, Math.floor(width / 8))
        const rows = Math.max(12, Math.floor(height / 18))
        const dims = `${cols}x${rows}`

        if (boxExt.__ms_resize_dims === dims) {
          return
        }

        boxExt.__ms_resize_dims = dims
        wsSend({
          type: "resize_pty",
          process_id: target,
          cols,
          rows,
        })
      }
      const runResize = () => {
        const timer = boxExt.__ms_resize_timer ?? 0

        if (timer) {
          win.clearTimeout(timer)
        }

        boxExt.__ms_resize_timer = win.setTimeout(onResize, 120)
      }
      boxExt.__ms_resize_obs = new ResizeObserver(() => {
        runResize()
      })
      boxExt.__ms_resize_obs.observe(box)
      runResize()
    }
  }

  const draw = () => {
    if (!ph) {
      return
    }

    mark(ph, txt)
    ph.removeAttribute("data-pending")
    ph.removeAttribute("data-ms-stall")
  }

  const setThinking = (label?: string) => {
    if (!ph || txt) {
      return
    }

    ph.removeAttribute("data-ms-stall")
    ph.removeAttribute("data-err")
    ph.setAttribute("data-pending", "1")
    ph.textContent = label || "Thinking..."
  }

  const setStalled = () => {
    if (!ph) {
      return
    }

    ph.setAttribute("data-ms-stall", "1")
    ph.setAttribute("data-err", "1")

    if (!txt) {
      ph.textContent = "Request stalled"
      ph.removeAttribute("data-pending")
    }
  }

  const setTool = (id: string, patch: Partial<TermEntry>, processId?: string) => {
    const key = safeTrim(id)

    if (!key) {
      return
    }

    const cur = map[key] ?? {
      id: key,
      tool: "terminal",
      input: "",
      output: "running...",
      status: "running" as "running" | "done" | "failed",
    }

    const next: TermEntry = {
      id: key,
      tool: patch.tool ?? cur.tool,
      input: patch.input ?? cur.input,
      output: patch.output ?? cur.output,
      status: patch.status ?? cur.status,
    }

    if (!map[key]) {
      order.push(key)
    }

    const nextProcess0 = safeTrim(processId)

    if (nextProcess0) {
      procByCall[key] = nextProcess0
    }

    map[key] = next
    const box = ensureTermBox(doc, ph, key, next.tool)

    if (box) {
      ;(box as HTMLElement & { __ms_term?: TermEntry | null }).__ms_term = next
    }

    const sum0 = summaryFor(next.input)
    const sum = sum0 || next.tool || "terminal"
    setTermText(box, '[data-ms-term-summary="1"]', sum)
    setTermText(box, '[data-ms-term-raw="1"]', next.output)

    const manual = readFold(win ?? null, key)

    if (manual === true) {
      setFoldState(box, true)
    }

    if (manual === false) {
      setFoldState(box, false)
    }

    if (manual === null) {
      const want = autoFold(next.input, next.output)

      if (want) {
        setFoldState(box, true)
      }
    }

    const folded = box?.getAttribute("data-ms-term-folded") === "1"

    if (!folded) {
      setTermText(box, '[data-ms-term-in="1"]', next.input)
      const state = ensureXterm(box)
      const out0 = typeof next.output === "string" ? next.output : ""
      const out = out0
      const row = box as (HTMLElement & { __ms_xterm_out?: string }) | null
      const prev0 = row?.__ms_xterm_out ?? ""
      const prev = typeof prev0 === "string" ? prev0 : ""

      if (state && row) {
        if (out === prev) {
          row.__ms_xterm_out = out
        }

        if (out !== prev) {
          const append = out.startsWith(prev) && out.length >= prev.length

          if (append) {
            const delta = out.slice(prev.length)

            if (delta) {
              state.term.write(delta)
            }

            row.__ms_xterm_out = out
          }

          if (!append) {
            destroyXterm(box)
            const nextState = ensureXterm(box)

            if (nextState) {
              nextState.term.write(out)
              row.__ms_xterm_out = out
            }
          }
        }
      }
    }

    setTermStatus(box, next.status)
    const currentProcess0 = procByCall[key] ?? ""
    const currentProcess = currentProcess0.trim() || undefined
    ensureInteractiveControls(box, key, currentProcess, next.status)
  }

  const emitTermEvent = (term: TermEntry | null | undefined) => {
    const row = term ?? null
    const chatId = safeTrim(req.chatId)
    const id = safeTrim(row?.id)
    const tool = safeTrim(row?.tool)

    if (!chatId || !id || !tool) {
      return
    }

    const status0 = safeTrim(row?.status)
    const status = status0 === "running" || status0 === "failed" ? status0 : "done"
    const payload = {
      type: "ms-agent-term-event",
      chatId,
      term: {
        id,
        tool,
        input: row?.input ?? "",
        output: row?.output ?? "",
        status,
      },
      ts: Date.now(),
    }
    const sign = [payload.term.tool, payload.term.status, payload.term.input, payload.term.output].join("\n")
    const prev = emittedByCall[id] ?? ""

    if (prev === sign) {
      return
    }

    emittedByCall[id] = sign
    const target = win.parent

    if (!target) {
      return
    }

    target.postMessage(payload, "*")
  }

  const showApprovalPrompt = (row: Record<string, unknown>) => {
    const callId = safeTrim(row.call_id)

    if (!callId) {
      return
    }

    const host = promptHost()

    if (!host) {
      return
    }

    const tool = safeTrim(row.tool) || "tool"
    const reason = safeTrim(row.reason)
    const command = safeTrim(row.command)
    const details0 = row.details
    const details = details0 && typeof details0 === "object" ? (details0 as Record<string, unknown>) : null
    const lines: string[] = []

    if (details) {
      const justification = safeTrim(details.justification)

      if (justification) {
        lines.push(`Justification: ${justification}`)
      }

      const paths0 = Array.isArray(details.paths) ? details.paths : []
      const paths = paths0.filter((p): p is string => typeof p === "string" && p.trim().length > 0)

      if (paths.length) {
        lines.push(`Paths: ${paths.join(", ")}`)
      }

      const matched0 = Array.isArray(details.matched_rules) ? details.matched_rules : []

      if (matched0.length) {
        lines.push("Matched rules:")

        for (var i = 0; i < matched0.length && i < 6; i++) {
          const m0 = matched0[i]
          const m = m0 && typeof m0 === "object" ? (m0 as Record<string, unknown>) : null

          if (!m) {
            continue
          }

          const dec = safeTrim(m.decision)
          const kind = safeTrim(m.kind)
          const mp0 = Array.isArray(m.matched_prefix) ? m.matched_prefix : []
          const mp = mp0.filter((t): t is string => typeof t === "string" && t.trim().length > 0).join(" ")
          const why = safeTrim(m.justification) || safeTrim(m.reason)
          const src0 = m.source && typeof m.source === "object" ? (m.source as Record<string, unknown>) : null
          const srcFile = safeTrim(src0?.file)
          const srcIndex0 = typeof src0?.index === "number" ? src0.index : undefined
          const srcIndex = typeof srcIndex0 === "number" && Number.isFinite(srcIndex0) ? srcIndex0 : undefined
          var line = dec || kind || "rule"

          if (mp) {
            line = `${line}: ${mp}`
          }

          if (why) {
            line = `${line} (${why})`
          }

          if (srcFile) {
            line = `${line} @${srcFile}${typeof srcIndex === "number" ? `:${srcIndex}` : ""}`
          }

          lines.push(`- ${line}`)
        }
      }

      const exec0 = details.execpolicy && typeof details.execpolicy === "object" ? (details.execpolicy as Record<string, unknown>) : null

      if (exec0) {
        const j2 = safeTrim(exec0.justification)

        if (j2) {
          lines.push(`Policy justification: ${j2}`)
        }

        const matched1 = Array.isArray(exec0.matched_rules) ? exec0.matched_rules : []

        if (matched1.length) {
          lines.push("Policy matched rules:")

          for (var i = 0; i < matched1.length && i < 6; i++) {
            const m0 = matched1[i]
            const m = m0 && typeof m0 === "object" ? (m0 as Record<string, unknown>) : null

            if (!m) {
              continue
            }

            const dec = safeTrim(m.decision)
            const kind = safeTrim(m.kind)
            const mp0 = Array.isArray(m.matched_prefix) ? m.matched_prefix : []
            const mp = mp0.filter((t): t is string => typeof t === "string" && t.trim().length > 0).join(" ")
            const why = safeTrim(m.justification) || safeTrim(m.reason)
            var line = dec || kind || "rule"

            if (mp) {
              line = `${line}: ${mp}`
            }

            if (why) {
              line = `${line} (${why})`
            }

            lines.push(`- ${line}`)
          }
        }
      }
    }

    const sig = [`tool=${tool}`, `reason=${reason}`, `command=${command}`, `details=${lines.join("\n")}`].join("\n").trim()
    const ex0 = promptByCall[callId] ?? null
    const ex = ex0 && (ex0 as Node).nodeType === 1 ? (ex0 as HTMLElement) : null
    const prevSig0 = ex?.getAttribute("data-ms-prompt-sig") ?? ""
    const prevSig = prevSig0.trim()

    if (ex && ex.isConnected && prevSig === sig) {
      return
    }

    clearPrompt(callId)
    const card = doc.createElement("div")
    card.setAttribute("data-ms-prompt-id", callId)
    card.setAttribute("data-ms-prompt-sig", sig)
    card.style.border = "1px solid var(--border-main, rgba(255,255,255,0.2))"
    card.style.borderRadius = "12px"
    card.style.padding = "10px"
    card.style.background = "var(--fill-tsp-gray-main, rgba(0,0,0,0.08))"
    card.style.display = "flex"
    card.style.flexDirection = "column"
    card.style.gap = "8px"

    const title = doc.createElement("div")
    title.textContent = "Tool approval required"
    title.style.fontSize = "12px"
    title.style.fontWeight = "600"

    const detail = doc.createElement("div")
    const pieces: string[] = []
    pieces.push(`Tool: ${tool}`)

    if (reason) {
      pieces.push(reason)
    }

    if (command) {
      pieces.push(`Command: ${command}`)
    }

    detail.textContent = pieces.join(" | ")
    detail.style.fontSize = "12px"
    detail.style.opacity = "0.9"

    var extra: HTMLDivElement | null = null

    if (lines.length) {
      extra = doc.createElement("div")
      extra.style.fontSize = "12px"
      extra.style.opacity = "0.9"
      extra.style.whiteSpace = "pre-wrap"
      extra.textContent = lines.join("\n")
    }

    const actions = doc.createElement("div")
    actions.style.display = "flex"
    actions.style.gap = "8px"

    const mkBtn = (label: string) => {
      const btn = doc.createElement("button")
      btn.type = "button"
      btn.textContent = label
      btn.style.border = "1px solid var(--border-main, rgba(255,255,255,0.2))"
      btn.style.borderRadius = "8px"
      btn.style.background = "transparent"
      btn.style.color = "var(--text-primary)"
      btn.style.padding = "6px 10px"
      btn.style.fontSize = "12px"
      btn.style.cursor = "pointer"
      return btn
    }

    const approve = mkBtn("Approve")
    const deny = mkBtn("Deny")
    const deferClear = () => {
      const w = win as unknown as { setTimeout?: (fn: () => void, ms: number) => unknown } | null
      const st = w?.setTimeout

      if (typeof st !== "function") {
        clearPrompt(callId)
        return
      }

      st(() => clearPrompt(callId), 0)
    }
    approve.addEventListener("click", () => {
      wsSend({
        type: "approve_tool",
        call_id: callId,
        approved: true,
      })
      deferClear()
      setThinking("Working...")
    })
    deny.addEventListener("click", () => {
      wsSend({
        type: "approve_tool",
        call_id: callId,
        approved: false,
      })
      deferClear()
      setThinking("Denied")
    })

    actions.appendChild(approve)
    actions.appendChild(deny)
    card.appendChild(title)
    card.appendChild(detail)

    if (extra) {
      card.appendChild(extra)
    }

    card.appendChild(actions)
    host.appendChild(card)
    promptByCall[callId] = card
  }

  const showUserInputPrompt = (row: Record<string, unknown>) => {
    const callId = safeTrim(row.call_id)

    if (!callId) {
      return
    }

    const host = promptHost()

    if (!host) {
      return
    }

    clearPrompt(callId)
    const card = doc.createElement("form")
    card.setAttribute("data-ms-prompt-id", callId)
    card.style.border = "1px solid var(--border-main, rgba(255,255,255,0.2))"
    card.style.borderRadius = "12px"
    card.style.padding = "10px"
    card.style.background = "var(--fill-tsp-gray-main, rgba(0,0,0,0.08))"
    card.style.display = "flex"
    card.style.flexDirection = "column"
    card.style.gap = "10px"

    const title = doc.createElement("div")
    title.textContent = "User input required"
    title.style.fontSize = "12px"
    title.style.fontWeight = "600"
    card.appendChild(title)

    const questions0 = Array.isArray(row.questions) ? row.questions : []
    const qRefs: Array<{ id: string; checks: HTMLInputElement[]; note: HTMLInputElement | null; text: HTMLInputElement | null }> = []

    for (var i = 0; i < questions0.length; i++) {
      const q0 = questions0[i]
      const q = q0 && typeof q0 === "object" ? (q0 as Record<string, unknown>) : null

      if (!q) {
        continue
      }

      const id = safeTrim(q.id)
      const header = safeTrim(q.header)
      const question = safeTrim(q.question)

      if (!id || !header || !question) {
        continue
      }

      const block = doc.createElement("div")
      block.style.display = "flex"
      block.style.flexDirection = "column"
      block.style.gap = "6px"

      const h = doc.createElement("div")
      h.textContent = `${header}: ${question}`
      h.style.fontSize = "12px"
      h.style.fontWeight = "500"
      block.appendChild(h)

      const options0 = Array.isArray(q.options) ? q.options : []
      const checks: HTMLInputElement[] = []

      for (var oi = 0; oi < options0.length; oi++) {
        const op0 = options0[oi]
        const op = op0 && typeof op0 === "object" ? (op0 as Record<string, unknown>) : null

        if (!op) {
          continue
        }

        const label = safeTrim(op.label)

        if (!label) {
          continue
        }

        const wrap = doc.createElement("label")
        wrap.style.display = "inline-flex"
        wrap.style.alignItems = "center"
        wrap.style.gap = "6px"
        wrap.style.fontSize = "12px"
        const cb = doc.createElement("input")
        cb.type = "checkbox"
        cb.value = label
        wrap.appendChild(cb)
        wrap.appendChild(doc.createTextNode(label))
        block.appendChild(wrap)
        checks.push(cb)
      }

      var text: HTMLInputElement | null = null
      var note: HTMLInputElement | null = null

      if (!checks.length) {
        text = doc.createElement("input")
        text.type = "text"
        text.placeholder = "Answer"
        text.style.border = "1px solid var(--border-main, rgba(255,255,255,0.2))"
        text.style.borderRadius = "8px"
        text.style.background = "transparent"
        text.style.color = "var(--text-primary)"
        text.style.padding = "6px 8px"
        text.style.fontSize = "12px"
        block.appendChild(text)
      }

      if (q.is_other === true) {
        note = doc.createElement("input")
        note.type = "text"
        note.placeholder = "Other"
        note.style.border = "1px solid var(--border-main, rgba(255,255,255,0.2))"
        note.style.borderRadius = "8px"
        note.style.background = "transparent"
        note.style.color = "var(--text-primary)"
        note.style.padding = "6px 8px"
        note.style.fontSize = "12px"
        block.appendChild(note)
      }

      qRefs.push({ id, checks, note, text })
      card.appendChild(block)
    }

    const submit = doc.createElement("button")
    submit.type = "submit"
    submit.textContent = "Submit answers"
    submit.style.alignSelf = "flex-start"
    submit.style.border = "1px solid var(--border-main, rgba(255,255,255,0.2))"
    submit.style.borderRadius = "8px"
    submit.style.background = "transparent"
    submit.style.color = "var(--text-primary)"
    submit.style.padding = "6px 10px"
    submit.style.fontSize = "12px"
    submit.style.cursor = "pointer"
    card.appendChild(submit)

    card.addEventListener("submit", (ev) => {
      ev.preventDefault()
      const answers: Record<string, { answers: string[] }> = {}

      for (var i = 0; i < qRefs.length; i++) {
        const ref = qRefs[i]

        if (!ref) {
          continue
        }

        const rows: string[] = []

        for (var ci = 0; ci < ref.checks.length; ci++) {
          const cb = ref.checks[ci]

          if (!cb || cb.checked !== true) {
            continue
          }

          const val0 = cb.value ?? ""
          const val = val0.trim()

          if (!val) {
            continue
          }

          rows.push(val)
        }

        const text0 = ref.text?.value ?? ""
        const text = text0.trim()

        if (text) {
          rows.push(text)
        }

        const note0 = ref.note?.value ?? ""
        const note = note0.trim()

        if (note) {
          rows.push(note)
        }

        answers[ref.id] = { answers: rows }
      }

      wsSend({
        type: "request_user_input_response",
        call_id: callId,
        answers,
      })
      clearPrompt(callId)
      setThinking("Working...")
    })

    host.appendChild(card)
    promptByCall[callId] = card
  }

  const allTerms = () => {
    const out: TermEntry[] = []

    for (var i = 0; i < order.length; i++) {
      const key = order[i] ?? ""
      const row = map[key]

      if (!row) {
        continue
      }

      out.push(row)
    }

    return out
  }

  const latestTermOutput = () => {
    for (var i = order.length - 1; i >= 0; i--) {
      const key = order[i] ?? ""
      const row = map[key]

      if (!row) {
        continue
      }

      const out = normalizeTermOutput(row.output)

      if (!out) {
        continue
      }

      return row.output
    }

    return ""
  }

  const finalizeRunningTerms = (msg: string) => {
    for (var i = 0; i < order.length; i++) {
      const key = order[i] ?? ""
      const row = map[key]

      if (!row || row.status !== "running") {
        continue
      }

      const out0 = safeTrim(row.output)
      const out = out0 && out0 !== "running..." ? out0 : msg
      setTool(key, { status: "failed", output: out })
    }
  }

  const toInt = (v: unknown) => {
    const n0 = typeof v === "number" ? v : Number.parseInt(safeTrim(v), 10)

    if (!Number.isFinite(n0)) {
      return undefined
    }

    return Math.floor(n0)
  }

  const promise = new Promise<StreamResult>((resolve) => {
    var settled = false

    const finish = (res: StreamResult) => {
      if (settled) {
        return
      }

      settled = true
      done = true
      clearPrompts()
      ws.close()
      run.ws = null
      resolve(res)
    }

    const timeoutTick = win.setInterval(() => {
      if (done) {
        win.clearInterval(timeoutTick)
        return
      }

      const gap = Date.now() - last

      if (gap < stallMs) {
        return
      }

      stalled = true
      setStalled()
      finalizeRunningTerms("Tool stalled (no output)")
      finish({ stream: true, ok: false, text: txt, stalled: true, error: "Request stalled", terms: allTerms(), wsConnectedBase: connected.base })
    }, 1000)

    const abort = () => {
      if (done) {
        return
      }

      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "cancel_turn", chatId: req.chatId }))
      }

      finalizeRunningTerms("Stopped")
      finish({ stream: true, ok: false, text: txt, error: "Request aborted", terms: allTerms(), wsConnectedBase: connected.base })
    }

    if (signal) {
      signal.addEventListener("abort", abort, { once: true })
    }

    ws.addEventListener("message", (evt) => {
      if (done) {
        return
      }

      last = Date.now()
      const data0 = typeof evt.data === "string" ? evt.data : ""
      const parsed = data0
        ? (() => {
            try {
              return JSON.parse(data0) as unknown
            } catch {
              return null
            }
          })()
        : null
      const ev = parseEvent(parsed)

      if (!ev) {
        return
      }

      const type = ev.type
      const row = ev.row

      if (type === "runtime_capabilities") {
        const caps = row.capabilities && typeof row.capabilities === "object" ? (row.capabilities as Record<string, unknown>) : null
        capApprovals = caps?.approvals === true
        capUserInput = caps?.request_user_input === true
        capResize = caps?.resize_pty === true
        return
      }

      if (type === "turn_status") {
        const status = safeTrim(row.status)
        const detail0 = typeof row.detail === "string" ? row.detail : ""
        const detail = detail0.trim()

        if (!status) {
          return
        }

        turnStatus = status
        turnDetail = detail

        if (status === "waiting_approval") {
          setThinking("Awaiting approval...")
          return
        }

        if (status === "waiting_user_input") {
          setThinking("Awaiting input...")
          return
        }

        if (status === "running" && !txt) {
          setThinking("Working...")
        }

        if (status === "completed" || status === "failed" || status === "interrupted") {
          clearPrompts()
        }

        return
      }

      if (type === "tool_approval_requested") {
        capApprovals = true
        showApprovalPrompt(row)
        setThinking("Awaiting approval...")
        return
      }

      if (type === "request_user_input_requested") {
        capUserInput = true
        showUserInputPrompt(row)
        setThinking("Awaiting input...")
        return
      }

      if (type === "pty_resized") {
        return
      }

      if (type === "task_started") {
        taskSeen = true
        setThinking("Thinking...")
        return
      }

      if (type === "session_state") {
        const inflight = row.inflight === true
        const turnState = safeTrim((row as { turn_state?: unknown }).turn_state)

        if (doSubmit && !inflight) {
          return
        }

        const terms0 = (row as { terms?: unknown }).terms
        const terms = Array.isArray(terms0) ? terms0 : []

        for (var i = 0; i < terms.length; i++) {
          const it = terms[i]
          const obj = it && typeof it === "object" ? (it as Record<string, unknown>) : null

          if (!obj) {
            continue
          }

          const id = safeTrim(obj.id)

          if (!id) {
            continue
          }

          const tool = safeTrim(obj.tool) || "terminal"
          const input = typeof obj.input === "string" ? obj.input : ""
          const output = typeof obj.output === "string" ? obj.output : ""
          const st0 = safeTrim(obj.status)
          const st = st0 === "running" || st0 === "failed" ? st0 : "done"
          setTool(id, { tool, input, output, status: st })
          emitTermEvent(map[id] ?? null)
        }

        if (inflight) {
          taskSeen = true

          if (turnState === "waiting_approval") {
            setThinking("Awaiting approval...")
            return
          }

          if (turnState === "waiting_user_input") {
            setThinking("Awaiting input...")
            return
          }

          if (!txt) {
            setThinking("Resuming...")
          }

          return
        }

        const msgs0 = (row as { messages?: unknown }).messages
        const msgs = Array.isArray(msgs0) ? msgs0 : []
        var lastMsg = ""

        for (var i = msgs.length - 1; i >= 0; i--) {
          const it = msgs[i]
          const obj = it && typeof it === "object" ? (it as Record<string, unknown>) : null

          if (!obj) {
            continue
          }

          const role = safeTrim(obj.role)

          if (role !== "assistant") {
            continue
          }

          const content0 = typeof obj.content === "string" ? obj.content : ""
          const content = content0.trim()

          if (!content) {
            continue
          }

          lastMsg = content0
          break
        }

        if (!lastMsg) {
          err = err || "No completed turn to resume"
          finalizeRunningTerms(err)
          finish({ stream: true, ok: false, text: txt, error: err, stalled, terms: allTerms(), wsConnectedBase: connected.base })
          return
        }

        txt = lastMsg
        run.txt = txt
        draw()
        finish({ stream: true, ok: true, text: txt, stalled, terms: allTerms(), wsConnectedBase: connected.base })
        return
      }

      if (type === "item_started") {
        setThinking("Thinking...")
        return
      }

      if (type === "agent_message_content_delta") {
        const d = safeTrim(row.delta)

        if (!d) {
          return
        }

        txt += d
        run.txt = txt
        draw()
        return
      }

      if (type === "reasoning_content_delta") {
        setThinking("Thinking...")
        return
      }

      if (type === "context_compacted") {
        compacts += 1
        addCompactionMarker(doc, ph, `compact-${compacts}`)

        if (!txt) {
          setThinking("Auto compacting...")
        }

        return
      }

      if (type === "exec_command_begin") {
        const callId = safeTrim(row.call_id) || `term-${order.length + 1}`
        const cmd = safeTrim(row.command)
        const tool0 = safeTrim((row as { tool_name?: unknown }).tool_name)
        const tool = tool0 || "terminal_exec"
        const processId = safeTrim(row.process_id)
        setTool(callId, { tool, input: cmd || tool || "command", output: "running...", status: "running" }, processId)
        emitTermEvent(map[callId] ?? null)
        setThinking("Working...")
        return
      }

      if (type === "exec_command_output_delta") {
        const callId = safeTrim(row.call_id)
        const chunk = typeof row.chunk === "string" ? row.chunk : ""
        const processId = safeTrim(row.process_id)

        if (!callId) {
          return
        }

        const cur = map[callId]
        const prev0 = cur ? cur.output : ""
        const prev = normalizeTermOutput(prev0)
        const next = `${prev}${chunk}` || "running..."
        setTool(callId, { output: next, status: "running" }, processId)
        setThinking("Working...")
        return
      }

      if (type === "terminal_interaction") {
        const callId = safeTrim(row.call_id)
        const stdin = typeof row.stdin === "string" ? row.stdin : ""
        const processId = safeTrim(row.process_id)

        if (!callId) {
          return
        }

        const cur = map[callId]
        const nextIn = `${cur?.input ?? ""}${stdin}`
        setTool(callId, { input: nextIn, status: "running" }, processId)
        return
      }

      if (type === "exec_command_end") {
        const callId = safeTrim(row.call_id)
        const processId = safeTrim(row.process_id)

        if (!callId) {
          return
        }

        const exitCode = toInt(row.exit_code)
        const out0 = typeof row.output === "string" ? row.output : ""
        const prev = map[callId]?.output ?? ""
        const status = resolveExecCommandEndStatus({ exitCode: row.exit_code, processId })
        const out = status === "running" ? out0 || prev || "running..." : resolveExecCommandEndOutput({ output: out0, previous: prev })
        setTool(callId, { output: out, status }, processId)
        emitTermEvent(map[callId] ?? null)

        if (!txt) {
          setThinking("Thinking...")
        }

        return
      }

      if (type === "exec_process_exit") {
        const processId = safeTrim(row.process_id)

        if (!processId) {
          return
        }

        const callId = callForProcess(processId)

        if (!callId) {
          return
        }

        const code = toInt(row.exit_code)
        const exitCode = typeof code === "number" ? code : -1
        const out0 = typeof row.output === "string" ? row.output : ""
        const status = exitCode === 0 ? ("done" as const) : ("failed" as const)
        const out = out0 || map[callId]?.output || "done"
        setTool(callId, { output: out, status }, processId)
        emitTermEvent(map[callId] ?? null)
        return
      }

      if (type === "runtime_host_health") {
        const role = safeTrim(row.host_role)
        const state = safeTrim(row.state)
        const lag = toInt(row.heartbeat_lag_ms) ?? 0
        const restarts = toInt(row.restart_count) ?? 0
        const limit = toInt(row.restart_limit) ?? 0
        const reason = safeTrim(row.reason)

        if (!role) {
          return
        }

        rt[role] = {
          state: state || "unknown",
          lag: typeof lag === "number" ? lag : 0,
          restarts: typeof restarts === "number" ? restarts : 0,
          limit: typeof limit === "number" ? limit : 0,
          reason,
        }
        renderRuntime()
        return
      }

      if (type === "warning") {
        const msg = safeTrim(row.message)

        if (!msg) {
          return
        }

        if (!txt) {
          setThinking(msg)
        }

        return
      }

      if (type === "error") {
        err = safeTrim(row.message) || "Request failed"
        finalizeRunningTerms(err)
        finish({
          stream: true,
          ok: false,
          text: txt,
          error: err,
          stalled,
          terms: allTerms(),
          wsConnectedBase: connected.base,
        })
        return
      }

      if (type === "task_complete" || type === "turn_complete") {
        const detail0 = typeof row.detail === "string" ? row.detail : ""
        const detail = detail0.trim()

        if (detail) {
          turnDetail = detail
        }

        if (!txt) {
          const lastMsg = safeTrim(row.last_agent_message)

          if (lastMsg) {
            txt = lastMsg
          }
        }

        run.txt = txt

        if (!txt) {
          const fallback = buildNoTextCompletionDiagnostic({
            status: turnStatus || "completed-without-text",
            detail: turnDetail,
            latestOutput: latestTermOutput(),
          })
          txt = fallback
          run.txt = txt
          err = fallback
          draw()
          finalizeRunningTerms(err)
          finish({
            stream: true,
            ok: false,
            text: txt,
            error: err,
            stalled,
            terms: allTerms(),
            wsConnectedBase: connected.base,
          })
          return
        }

        draw()
        finish({
          stream: true,
          ok: true,
          text: txt,
          stalled,
          terms: allTerms(),
          wsConnectedBase: connected.base,
        })
      }
    })

    ws.addEventListener("error", () => {
      if (done) {
        return
      }

      err = err || "WebSocket error"
      finalizeRunningTerms(err)
      finish({ stream: true, ok: false, text: txt, error: err, stalled, terms: allTerms(), wsConnectedBase: connected.base })
    })

    ws.addEventListener("close", () => {
      if (done) {
        return
      }

      if (run.stop === true) {
        finalizeRunningTerms("Stopped")
        finish({ stream: true, ok: false, text: txt, error: "Stopped", stalled, terms: allTerms(), wsConnectedBase: connected.base })
        return
      }

      if (taskSeen && txt) {
        draw()
        finish({ stream: true, ok: true, text: txt, stalled, terms: allTerms(), wsConnectedBase: connected.base })
        return
      }

      err = err || "WebSocket closed before completion"
      finalizeRunningTerms(err)
      finish({ stream: true, ok: false, text: txt, error: err, stalled, terms: allTerms(), wsConnectedBase: connected.base })
    })

    const configure = {
      type: "configure",
      chatId: req.chatId,
      mode: req.mode,
      allow_terminal_exec: req.allow_terminal_exec === true,
    }
    const submit = {
      type: "submit_turn",
      chatId: req.chatId,
      mode: req.mode,
      allow_terminal_exec: req.allow_terminal_exec === true,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    }

    const cfg = AgentWsClientMessageSchema.safeParse(configure)

    if (!cfg.success) {
      const msg = "Client WS contract validation failed: configure"
      finalizeRunningTerms(msg)
      finish({ stream: true, ok: false, text: txt, error: msg, stalled, terms: allTerms(), wsConnectedBase: connected.base })
      return
    }

    ws.send(JSON.stringify(cfg.data))

    if (doSubmit) {
      const turn = AgentWsClientMessageSchema.safeParse(submit)

      if (!turn.success) {
        const msg = "Client WS contract validation failed: submit_turn"
        finalizeRunningTerms(msg)
        finish({
          stream: true,
          ok: false,
          text: txt,
          error: msg,
          stalled,
          terms: allTerms(),
          wsConnectedBase: connected.base,
        })
        return
      }

      ws.send(JSON.stringify(turn.data))
    }
  })

  return promise
}
