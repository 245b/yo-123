import { apiBaseCandidates, rememberApiBase } from "../../lib/api"
import { readActiveChat } from "../../lib/activeChat"
import { fromBase } from "../../lib/route"
import { streamWsResponse } from "./response"
import { activeKey } from "./storage"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "xterm"
import type { Att, Ch, DsWin, Msg, Req, Run, TermEntry } from "./types"

export type SessionLayout = {
  host: (ta?: HTMLTextAreaElement | null) => HTMLDivElement | null
  home: (ta?: HTMLTextAreaElement | null) => HTMLElement | null
  tune: (ta: HTMLTextAreaElement, home: boolean) => void
}

export type SessionMessages = {
  add: (
    ta: HTMLTextAreaElement | null,
    role: "user" | "assistant",
    txt: string,
    err?: boolean,
    pending?: boolean,
    atts?: Att[],
  ) => HTMLElement | null
  mark: (el: HTMLElement, txt: string) => void
}

export type SessionInput = {
  set: (ta: HTMLTextAreaElement) => void
}

export type SessionStore = {
  loadMsgs: (id: string) => Msg[]
  saveMsgs: (id: string, ms: Msg[]) => void
  loadTerms: (id: string) => Record<string, TermEntry[]>
  saveTerms: (id: string, terms: Record<string, TermEntry[]>) => void
  setCur: (id: string) => void
  touch: (id: string, name?: string) => void
}

export type SessionApi = {
  reset: (keep?: boolean) => boolean
  show: (id?: string | null) => void
  fresh: (name?: string) => string
  start: () => void
}

export const setupSession = (
  doc: Document,
  win: Window,
  sr: ShadowRoot | null,
  layout: SessionLayout,
  messages: SessionMessages,
  input: SessionInput,
  store: SessionStore,
): SessionApi => {
  const host = layout.host
  const home = layout.home
  const tune = layout.tune
  const add = messages.add
  const mark = messages.mark
  const set = input.set
  const loadMsgs = store.loadMsgs
  const saveMsgs = store.saveMsgs
  const loadTerms = store.loadTerms
  const saveTerms = store.saveTerms
  const setCur = store.setCur
  const touch = store.touch
  const ak = activeKey
  const setSessionActive = (id: string) => {
    const cid = id.trim()
    const tw = win.parent && win.parent !== win ? win.parent : win
    const p = fromBase(tw.location?.pathname ?? "")
    const on = p.startsWith("/t/")

    if (cid && on) {
      doc.documentElement.setAttribute("data-ms-chat-active", "1")
      return
    }

    doc.documentElement.removeAttribute("data-ms-chat-active")
  }

  const termWrap = (el: HTMLElement) => {
    const row0 = el.closest?.('[data-ms-row="1"]') ?? null
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

  const foldKeyFor = (id: string) => {
    const key0 = typeof id === "string" ? id : ""
    const key = key0.trim()
    return key ? `ms_term_fold_${key}` : "ms_term_fold_"
  }

  const readFold = (id: string) => {
    const key = foldKeyFor(id)
    const raw0 = win.localStorage.getItem(key) ?? ""
    const raw = raw0.trim()

    if (raw === "1") {
      return true
    }

    if (raw === "0") {
      return false
    }

    return null as boolean | null
  }

  const writeFold = (id: string, folded: boolean) => {
    const key = foldKeyFor(id)
    const want = folded ? "1" : "0"
    win.localStorage.setItem(key, want)
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

  const termBox = (wrap: HTMLElement, entry: TermEntry) => {
    const id0 = typeof entry?.id === "string" ? entry.id : ""
    const id = id0.trim() || "tool"
    const sel = `[data-ms-term-id="${id}"]`
    const ex0 = wrap.querySelector(sel) ?? null
    const ex = ex0 && (ex0 as Node).nodeType === 1 ? (ex0 as HTMLElement) : null

    if (ex) {
      return ex
    }

    const box = doc.createElement("div")
    box.className = "ms-term"
    box.setAttribute("data-ms-term-id", id)

    const head = doc.createElement("div")
    head.className = "ms-term-head"

    const tag = doc.createElement("div")
    tag.className = "ms-term-tag"
    const tool0 = typeof entry?.tool === "string" ? entry.tool : ""
    const tool = tool0.trim() || "terminal"
    tag.textContent = tool

    const right = doc.createElement("div")
    right.className = "ms-term-right"

    const fold = doc.createElement("button")
    fold.type = "button"
    fold.className = "ms-term-fold"
    fold.setAttribute("aria-label", "Toggle terminal output collapse")
    fold.textContent = ">"

    const status = doc.createElement("div")
    status.className = "ms-term-muted"
    status.setAttribute("data-ms-term-status", "1")
    status.textContent = "done"

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

    const input0 = typeof entry?.input === "string" ? entry.input : ""
    const output0 = typeof entry?.output === "string" ? entry.output : ""
    const sum0 = summaryFor(input0)
    const sum = sum0 || tool || "terminal"
    setTermText(box, '[data-ms-term-summary="1"]', sum)
    setTermText(box, '[data-ms-term-raw="1"]', output0)

    const manual = readFold(id)

    if (manual === true) {
      setFoldState(box, true)
    }

    if (manual === false) {
      setFoldState(box, false)
    }

    if (manual === null) {
      const want = autoFold(input0, output0)

      if (want) {
        setFoldState(box, true)
      }
    }

    const tools0 = wrap.querySelector('[data-ms-tools="1"]') ?? null
    const tools = tools0 && (tools0 as Node).nodeType === 1 ? (tools0 as HTMLElement) : null

    if (tools) {
      wrap.insertBefore(box, tools)
      return box
    }

    wrap.appendChild(box)
    return box
  }

  const setTermText = (box: HTMLElement, sel: string, text: string) => {
    const el0 = box.querySelector(sel) ?? null
    const el = el0 && (el0 as Node).nodeType === 1 ? (el0 as HTMLElement) : null

    if (!el) {
      return
    }

    el.textContent = text
  }

  const hookTerms = () => {
    const key = "data-ms-term-click"
    const ok = doc.documentElement.getAttribute(key) === "1"

    if (ok) {
      return
    }

    doc.documentElement.setAttribute(key, "1")
    const fn = (ev: Event) => {
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

      const box0 = btn.closest?.("[data-ms-term-id]") ?? null
      const box = box0 && (box0 as Node).nodeType === 1 ? (box0 as HTMLElement) : null

      if (!box) {
        return
      }

      const id0 = box.getAttribute("data-ms-term-id") ?? ""
      const id = id0.trim()

      if (!id) {
        return
      }

      ev.preventDefault()
      ev.stopPropagation()

      const was = box.getAttribute("data-ms-term-folded") === "1"
      const next = !was
      setFoldState(box, next)
      writeFold(id, next)

      if (next) {
        return
      }

      const row = box as HTMLElement & { __ms_term?: TermEntry | null; __ms_xterm_out?: string }
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

    doc.addEventListener("click", fn, true)
  }

  hookTerms()

  const setTermStatus = (box: HTMLElement, text: string) => {
    setTermText(box, '[data-ms-term-status="1"]', text)
  }

  const renderTerms = (el: HTMLElement, list: TermEntry[]) => {
    const wrap = termWrap(el)

    if (!wrap) {
      return
    }

    for (var i = 0; i < list.length; i++) {
      const it = list[i]

      if (!it) {
        continue
      }

      const box = termBox(wrap, it)
      ;(box as HTMLElement & { __ms_term?: TermEntry | null }).__ms_term = it
      const tool0 = typeof it.tool === "string" ? it.tool : ""
      const tool = tool0.trim() || "terminal"
      const input0 = typeof it.input === "string" ? it.input : ""
      const output0 = typeof it.output === "string" ? it.output : ""
      const status0 = typeof it.status === "string" ? it.status : ""
      const status = status0 === "failed" || status0 === "running" ? status0 : "done"
      const sum0 = summaryFor(input0)
      const sum = sum0 || tool
      setTermText(box, '[data-ms-term-summary="1"]', sum)
      setTermText(box, '[data-ms-term-raw="1"]', output0)

      const manual = readFold(it.id)

      if (manual === true) {
        setFoldState(box, true)
      }

      if (manual === false) {
        setFoldState(box, false)
      }

      if (manual === null) {
        const want = autoFold(input0, output0)

        if (want) {
          setFoldState(box, true)
        }
      }

      const folded = box.getAttribute("data-ms-term-folded") === "1"

      if (!folded) {
        setTermText(box, '[data-ms-term-in="1"]', input0)
        const row = box as HTMLElement & { __ms_xterm_out?: string }
        const prev0 = row.__ms_xterm_out ?? ""
        const prev = typeof prev0 === "string" ? prev0 : ""
        const out = output0 || "done"

        if (out !== prev) {
          destroyXterm(box)
          const state = ensureXterm(box)

          if (state) {
            state.term.write(out)
            row.__ms_xterm_out = out
          }
        }
      }

      setTermStatus(box, status)
    }
  }

  const reset = (keep?: boolean) => {
    const ww = win as DsWin
    ww.__ms_ds_busy = false
    ww.__ms_ds_abort = null
    ww.__ms_ds_run = null
    ww.__ms_ds_msgs = []
    ww.__ms_ds_id = ""
    setSessionActive("")

    if (!keep) {
      setCur("")
    }

    const t0 = ww.__ms_ds_ta ?? null
    const on0 = (t0 as unknown as { isConnected?: boolean } | null)?.isConnected
    const on = typeof on0 === "boolean" ? on0 : false
    var ta = on && t0?.tagName === "TEXTAREA" ? t0 : null

    if (!ta) {
      const sh = sr ?? doc.querySelector("browser-mcp-container")?.shadowRoot ?? null
      const root0 = doc.getElementById("chat-home-view-container") ?? sh?.querySelector("#chat-home-view-container") ?? null
      const root = root0 && (root0 as Node).nodeType === 1 ? (root0 as HTMLElement) : null

      if (root) {
        const ta0 = root.querySelector<HTMLTextAreaElement>('[data-ms-chatbox="1"] textarea, textarea') ?? null
        ta = ta0?.tagName === "TEXTAREA" ? (ta0 as HTMLTextAreaElement) : null
      }
    }

    if (ta) {
      ww.__ms_ds_ta = ta
    }

    const home0 = !keep
    const h = home0 ? home(ta) : host(ta)

    if (!home0) {
      const list0 = h?.querySelector("#__ms_ds_list") ?? null
      const list = list0?.tagName === "DIV" ? (list0 as HTMLDivElement) : null

      if (list) {
        const imgs = Array.from(list.querySelectorAll<HTMLImageElement>('img[data-ms-obj-url]'))

        for (var i = 0; i < imgs.length; i++) {
          const it = imgs[i]
          const u0 = it?.getAttribute("data-ms-obj-url") ?? ""
          const u = u0.trim()

          if (!u) {
            continue
          }

          if (typeof URL.revokeObjectURL === "function") {
            URL.revokeObjectURL(u)
          }
        }

        list.textContent = ""
        list.scrollTop = 0
      }
    }

    if (!ta) {
      ww.__ms_ds_ta = null
      return !!h
    }

    tune(ta, home0)
    ta.focus()
    return true
  }

  var tid = 0
  var tn = 0
  var want = ""
  var last = ""

  const show = (id?: string | null) => {
    const ww = win as DsWin
    const cid0 = (id ?? "").trim()
    const cur0 = (ww.__ms_ds_id ?? "").trim()

    if (cid0 !== last) {
      last = cid0
      tn = 0
    }

    if (cid0 && cur0 === cid0) {
      const sh = sr ?? doc.querySelector("browser-mcp-container")?.shadowRoot ?? null
      const ds0 = doc.getElementById("__ms_ds") ?? sh?.querySelector("#__ms_ds") ?? null
      const ds = ds0?.tagName === "DIV" ? (ds0 as HTMLDivElement) : null

      if (ds) {
        setSessionActive(cid0)
        return
      }
    }

    if (!cid0 && !cur0) {
      setSessionActive("")
      return
    }

    const ok = reset(true)
    ww.__ms_ds_id = cid0

    if (!ok) {
      want = cid0

      if (tid) {
        return
      }

      tn++

      if (tn > 40) {
        return
      }

      tid = win.setTimeout(() => {
        tid = 0
        show(want)
      }, 120)
      return
    }

    tn = 0
    want = cid0

    if (tid) {
      win.clearTimeout(tid)
      tid = 0
    }

    if (!cid0) {
      ww.__ms_ds_msgs = []
      setSessionActive("")
      return
    }

    const hs = loadMsgs(cid0)
    const tm = loadTerms(cid0)
    ww.__ms_ds_msgs = hs

    const t0 = ww.__ms_ds_ta ?? null
    const on0 = (t0 as unknown as { isConnected?: boolean } | null)?.isConnected
    const on = typeof on0 === "boolean" ? on0 : false
    var ta = on && t0?.tagName === "TEXTAREA" ? t0 : null

    if (!ta) {
      const sh = sr ?? doc.querySelector("browser-mcp-container")?.shadowRoot ?? null
      const ta0 =
        doc.querySelector('[data-ms-chatbox="1"] textarea') ?? sh?.querySelector('[data-ms-chatbox="1"] textarea') ?? null
      ta = ta0?.tagName === "TEXTAREA" ? (ta0 as HTMLTextAreaElement) : null
    }

    if (!hs.length) {
      setSessionActive("")
      home(ta)

      if (!ta) {
        return
      }

      tune(ta, true)

      if (cid0 !== cur0) {
        ta.focus()
      }

      return
    }
    setSessionActive(cid0)

    for (var i = 0; i < hs.length; i++) {
      const m = hs[i]
      const el = add(ta, m.role, m.content, false, false, m.atts)

      if (m.role !== "assistant") {
        continue
      }

      if (!el) {
        continue
      }

      const list = tm[`${i}`] ?? []

      if (!list.length) {
        continue
      }

      renderTerms(el, list)
    }

    if (!ta) {
      return
    }

    const ta1 = ta
    ta1.setAttribute("placeholder", "Send message to Manus")
    set(ta1)

    const pendKey = `ms_chat_pending_${cid0}`
    const pend0 = win.localStorage.getItem(pendKey) ?? ""
    const pend = pend0.trim()

    if (!pend) {
      return
    }

    const lastMsg = hs[hs.length - 1] ?? null

    if (!lastMsg || lastMsg.role !== "user") {
      win.localStorage.removeItem(pendKey)
      return
    }

    if (ww.__ms_ds_busy) {
      return
    }

    const ph = add(ta1, "assistant", "Resuming...", false, true)

    if (!ph) {
      return
    }

    const run: Run = { ph, txt: "", ta: ta1, box: null }
    ww.__ms_ds_run = run
    ww.__ms_ds_busy = true
    const ac = new AbortController()
    ww.__ms_ds_abort = ac
    set(ta1)

    const m0 = doc.documentElement.getAttribute("data-ms-mode") ?? ""
    const m1 = m0.trim()
    const mode = m1 || "chat"
    const allowExec = mode.startsWith("operator-")
    const req: Req = { messages: [], chatId: cid0, mode, allow_terminal_exec: allowExec }
    const list0 = apiBaseCandidates()
    const list = list0.length ? list0.concat("") : [""]

    streamWsResponse({
      win,
      run,
      req,
      bases: list,
      mark,
      ph,
      signal: ac.signal,
      submit: false,
    })
      .then((sx) => {
        if (sx.wsConnectedBase) {
          rememberApiBase(sx.wsConnectedBase)
        }

        const stop = ww.__ms_ds_run?.stop === true
        ww.__ms_ds_busy = false
        ww.__ms_ds_abort = null
        ww.__ms_ds_run = null
        set(ta1)

        if (stop) {
          win.localStorage.removeItem(pendKey)
          return
        }

        const t0 = typeof sx.text === "string" ? sx.text : ""
        const t = t0.trim()
        const terms = Array.isArray(sx.terms) ? sx.terms : []

        if (!sx.ok || !t) {
          const e0 = typeof sx.error === "string" ? sx.error : ""
          const e = e0.trim() || "Resume failed"
          ph.textContent = e
          ph.setAttribute("data-err", "1")
          ph.removeAttribute("data-pending")
          win.localStorage.removeItem(pendKey)
          return
        }

        const last = hs[hs.length - 1] ?? null

        if (!last || last.role !== "assistant" || last.content.trim() !== t) {
          hs.push({ role: "assistant", content: t })
          touch(cid0)
          saveMsgs(cid0, hs)

          if (terms.length) {
            const map = loadTerms(cid0)
            map[`${hs.length - 1}`] = terms
            saveTerms(cid0, map)
          }
        }

        win.localStorage.removeItem(pendKey)
      })
      .catch(() => {
        ww.__ms_ds_busy = false
        ww.__ms_ds_abort = null
        ww.__ms_ds_run = null
        set(ta1)
        ph.textContent = "Resume failed"
        ph.setAttribute("data-err", "1")
        ph.removeAttribute("data-pending")
        win.localStorage.removeItem(pendKey)
      })
  }

  const fresh = (name?: string) => {
    const ww = win as DsWin
    const cur0 = ww.__ms_ds_id ?? ""
    const cur = cur0.trim()

    if (cur) {
      const hs = loadMsgs(cur)

      if (!hs.length) {
        setCur(cur)
        show(cur)
        return cur
      }
    }

    const id0 = win.crypto?.randomUUID?.() ?? ""
    const id = id0 || `${Date.now()}`
    touch(id, name)
    setCur(id)
    show(id)
    return id
  }

  const init = () => {
    const ww = win as DsWin

    if ((ww.__ms_ds_id ?? "").trim()) {
      return
    }

    const id = readActiveChat(win)

    if (!id) {
      setSessionActive("")
      return
    }

    const has = loadMsgs(id).length > 0
    setSessionActive(has ? id : "")

    show(id)
  }

  const onStorage = (ev: StorageEvent) => {
    const e = ev as StorageEvent
    const k = e.key ?? ""
    const a = e.storageArea ?? null

    if (a && a !== win.sessionStorage) {
      return
    }

    if (k !== ak) {
      return
    }

    const id = (e.newValue ?? "").trim()
    show(id)
  }

  var sid = 0

  const sync = () => {
    sid = 0
    const ww = win as DsWin
    const want = readActiveChat(win)
    const cur0 = ww.__ms_ds_id ?? ""
    const cur = cur0.trim()
    const has = want ? loadMsgs(want).length > 0 : false
    setSessionActive(has ? want : "")

    if (want !== cur) {
      show(want)
    }

    sid = win.setTimeout(sync, 180)
  }

  const start = () => {
    win.requestAnimationFrame(init)
    win.setTimeout(init, 250)
    win.setTimeout(init, 1000)
    win.addEventListener("storage", onStorage)
    sid = win.setTimeout(sync, 180)
  }

  return { reset, show, fresh, start }
}
