import type { DraftFile } from "../../app/lib/store"
import { apiBaseCandidates, rememberApiBase } from "../../lib/api"
import { createAttachmentHelpers } from "./attachments"
import { streamWsResponse } from "./response"
import { createTitleUpdater } from "./title"
import type { Att, Ch, DsWin, Msg, Req, Run, TermEntry } from "./types"

export type FlowInput = {
  pickAtt: () => DraftFile[]
  clearAtt: () => void
  send: (box: Element, ta: HTMLTextAreaElement) => HTMLButtonElement | null
  set: (ta: HTMLTextAreaElement) => void
  shine: (b: HTMLButtonElement, on: boolean) => void
}

export type FlowStore = {
  setCur: (id: string) => void
  touch: (id: string, name?: string) => void
  saveMsgs: (id: string, ms: Msg[]) => void
  loadTerms: (id: string) => Record<string, TermEntry[]>
  saveTerms: (id: string, terms: Record<string, TermEntry[]>) => void
}

export type FlowUi = {
  host: (ta?: HTMLTextAreaElement | null) => HTMLDivElement | null
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

export type FlowApi = {
  go: (ta: HTMLTextAreaElement) => void
  halt: (why?: string) => void
}

export const setupFlow = (
  doc: Document,
  win: Window,
  sr: ShadowRoot | null,
  input: FlowInput,
  store: FlowStore,
  ui: FlowUi,
): FlowApi => {
  const clearAtt = input.clearAtt
  const send = input.send
  const set = input.set
  const shine = input.shine
  const setCur = store.setCur
  const touch = store.touch
  const saveMsgs = store.saveMsgs
  const loadTerms = store.loadTerms
  const saveTerms = store.saveTerms
  const host = ui.host
  const add = ui.add
  const mark = ui.mark
  const ck = "ms_chats"
  const pk = "ms_chat_"
  const tk = "ms_chat_title_"
  const nk = "ms_chat_title_name_"
  const wipe = "8==D 245B"
  const adminOpenPhrase = "big dick"
  const postRightPanelOpen = (chatId: string, reason: string) => {
    const id = chatId.trim()
    const why = reason.trim()

    if (!why) {
      return
    }

    const target = win.parent

    if (!target) {
      return
    }

    target.postMessage(
      {
        type: "ms-right-panel-open-request",
        chatId: id,
        reason: why,
        ts: Date.now(),
      },
      "*",
    )
  }
  const isLegacyStallText = (raw: string) => {
    const t0 = typeof raw === "string" ? raw : ""
    const t = t0.trim().toLowerCase()

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
  const isTransientTransportFailure = (raw: string, stalled?: boolean) => {
    if (stalled === true) {
      return true
    }

    const t0 = typeof raw === "string" ? raw : ""
    const t = t0.trim().toLowerCase()

    if (!t) {
      return false
    }

    if (t === "websocket connect failed") {
      return true
    }

    if (t === "websocket error") {
      return true
    }

    if (t === "websocket closed before completion") {
      return true
    }

    if (t === "request stalled") {
      return true
    }

    if (isLegacyStallText(t0)) {
      return true
    }

    return false
  }

  const startThinkingTimer = (ph: HTMLElement | null) => {
    if (!ph) {
      return () => {}
    }

    const p = ph as HTMLElement & { __msThinkStop?: (() => void) | null }
    const prev = p.__msThinkStop

    if (typeof prev === "function") {
      prev()
    }

    const started = Date.now()
    const thinkDelayMs = 3000
    const thinkSpeed = 0.5
    var stop: (() => void) | null = null
    const tick = () => {
      if (!ph.isConnected) {
        if (stop) {
          stop()
        }
        return
      }

      const pending = ph.getAttribute("data-pending") === "1"
      const stalled = ph.getAttribute("data-ms-stall") === "1"

      if (!pending || stalled) {
        if (stop) {
          stop()
        }
        return
      }

      const cur0 = ph.textContent ?? ""
      const cur = cur0.trim()

      if (!cur.startsWith("Thinking")) {
        if (stop) {
          stop()
        }
        return
      }

      const elapsed = Date.now() - started

      if (elapsed < thinkDelayMs) {
        ph.textContent = "Thinking..."
        return
      }

      const sec = Math.floor(((elapsed - thinkDelayMs) / 1000) * thinkSpeed)

      if (sec < 1) {
        ph.textContent = "Thinking..."
        return
      }

      const tag = sec >= 60 ? `${Math.floor(sec / 60)}m` : `${sec}s`
      ph.textContent = `Thinking... (${tag})`
    }

    const id = win.setInterval(tick, 1000)
    stop = () => {
      win.clearInterval(id)

      if (p.__msThinkStop === stop) {
        p.__msThinkStop = null
      }
    }
    p.__msThinkStop = stop
    return stop
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
    tag.textContent = tool0.trim() || "terminal"

    const right = doc.createElement("div")
    right.className = "ms-term-right"

    const foldKey = "ms_term_fold_next"
    const raw0 = win.localStorage.getItem(foldKey) ?? ""
    const raw = raw0.trim()
    const foldOn = raw === "1"

    if (foldOn) {
      box.setAttribute("data-ms-term-folded", "1")
    }

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

    const inLabel = doc.createElement("div")
    inLabel.className = "ms-term-label"
    inLabel.textContent = "input"

    const inPre = doc.createElement("div")
    inPre.className = "ms-term-pre"
    inPre.setAttribute("data-ms-term-in", "1")

    const outLabel = doc.createElement("div")
    outLabel.className = "ms-term-label"
    outLabel.textContent = "output"

    const outPre = doc.createElement("div")
    outPre.className = "ms-term-pre ms-term-muted"
    outPre.setAttribute("data-ms-term-out", "1")
    outPre.textContent = "done"

    body.appendChild(inLabel)
    body.appendChild(inPre)
    body.appendChild(outLabel)
    body.appendChild(outPre)
    box.appendChild(head)
    box.appendChild(body)

    const toggle = (ev: Event) => {
      const b0 = (ev as PointerEvent).button
      const ok = typeof b0 !== "number" || b0 === 0

      if (!ok) {
        return
      }

      ev.preventDefault()
      ev.stopPropagation()

      const was = box.getAttribute("data-ms-term-folded") === "1"
      const next = !was

      if (next) {
        box.setAttribute("data-ms-term-folded", "1")
        setTermText(box, '[data-ms-term-in="1"]', "")
        setTermText(box, '[data-ms-term-out="1"]', "")
      }

      if (!next) {
        box.removeAttribute("data-ms-term-folded")
        const row = box as HTMLElement & { __ms_term?: TermEntry | null }
        const term = row.__ms_term ?? null

        if (term) {
          setTermText(box, '[data-ms-term-in="1"]', term.input)
          setTermText(box, '[data-ms-term-out="1"]', term.output)
        }
      }

      win.localStorage.setItem(foldKey, next ? "1" : "0")
    }

    fold.addEventListener("click", toggle, true)

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
      const input0 = typeof it.input === "string" ? it.input : ""
      const output0 = typeof it.output === "string" ? it.output : ""
      const status0 = typeof it.status === "string" ? it.status : ""
      const status = status0 === "failed" || status0 === "running" ? status0 : "done"
      const folded = box.getAttribute("data-ms-term-folded") === "1"

      if (!folded) {
        setTermText(box, '[data-ms-term-in="1"]', input0)
        setTermText(box, '[data-ms-term-out="1"]', output0 || "done")
      }

      setTermStatus(box, status)
    }
  }

  const clearAll = (ta?: HTMLTextAreaElement | null) => {
    const ls = win.localStorage
    const keys: string[] = []

    for (var i = 0; i < ls.length; i++) {
      const k0 = ls.key(i)
      const k = typeof k0 === "string" ? k0 : ""

      if (k) {
        keys.push(k)
      }
    }

    for (var i = 0; i < keys.length; i++) {
      const k = keys[i] ?? ""

      if (!k) {
        continue
      }

      if (k === ck || k.startsWith(pk) || k.startsWith("ms_chat_pending_")) {
        ls.removeItem(k)
      }
    }

    ls.removeItem("__ms_chat_draft")
    clearAtt()

    const ww = win as DsWin
    ww.__ms_ds_busy = false
    ww.__ms_ds_abort = null
    ww.__ms_ds_run = null
    ww.__ms_ds_msgs = []
    ww.__ms_ds_id = ""

    const reset = ww.__ms_ds_reset

    if (typeof reset === "function") {
      reset()
    }

    if (typeof reset !== "function") {
      setCur("")
    }

    if (!ta) {
      return
    }

    ta.value = ""
    const g = win as unknown as typeof globalThis
    const E = g.Event
    ta.dispatchEvent(new E("input", { bubbles: true }))
    ta.dispatchEvent(new E("change", { bubbles: true }))
    set(ta)
  }

  const att = createAttachmentHelpers(doc)
  const title = createTitleUpdater({
    win,
    touch,
    chatsKey: ck,
    chatPrefix: pk,
    titleKey: tk,
    titleNameKey: nk,
  })

  const go = (ta: HTMLTextAreaElement) => {
    const ww = win as DsWin

    if (ww.__ms_ds_busy) {
      return
    }

    ww.__ms_ds_ta = ta

    const v0 = ta.value ?? ""
    const v = v0.trim()
    const fs = input.pickAtt()
    const ha = fs.length > 0

    if (v === wipe) {
      clearAll(ta)
      return
    }

    if (!v && !ha) {
      return
    }

    const admin0 = v.toLowerCase()
    const admin = admin0 === adminOpenPhrase

    if (admin) {
      const cid0 = ww.__ms_ds_id ?? ""
      const cid = cid0.trim()
      postRightPanelOpen(cid, "admin_chat")
      ta.value = ""
      const g = win as unknown as typeof globalThis
      const E = g.Event
      ta.dispatchEvent(new E("input", { bubbles: true }))
      ta.dispatchEvent(new E("change", { bubbles: true }))
      set(ta)
      ta.focus()
      return
    }

    const cur0 = ww.__ms_ds_id ?? ""
    const cur = cur0.trim()

    if (!cur) {
      const id0 = win.crypto?.randomUUID?.() ?? ""
      const id = id0 || `${Date.now()}`
      ww.__ms_ds_id = id
      touch(id)
      setCur(id)
    }

    const cid0 = ww.__ms_ds_id ?? ""
    const cid = cid0.trim()

    if (!cid) {
      return
    }

    const pendKey = `ms_chat_pending_${cid}`
    const pend0 = win.localStorage.getItem(pendKey) ?? ""
    const pend = pend0.trim()

    if (pend) {
      return
    }

    setCur(cid)
    touch(cid)
    doc.documentElement.setAttribute("data-ms-chat-active", "1")

    const hs = ww.__ms_ds_msgs ?? []
    ww.__ms_ds_msgs = hs

    const box =
      ta.closest("form") ??
      ta.closest('[data-ms-chatbox="1"]') ??
      ta.closest("div.rounded-\\[22px\\]") ??
      ta.closest("div.rounded-\\[24px\\]") ??
      ta.closest("div") ??
      null

    if (!box) {
      return
    }

    const ns = fs
      .map((it) => (it?.name ?? "").trim())
      .filter((it) => it.length > 0)
      .slice(0, 6)
      .join(", ")
    const hu = v.length > 0
    var msg = v.trim()

    if (!msg && ha) {
      msg = ns ? `Attached files: ${ns}` : "Attached files"
    }

    var rq = msg

    if (!hu && ha) {
      rq = ns ? `Please analyze the attached files (${ns}).` : "Please analyze the attached files."
    }

    const searchOn = (box.getAttribute("data-ms-search") ?? "").trim() === "1"

    if (searchOn && hu) {
      rq = att.searchPrefix(rq)
    }

    const b = send(box, ta)

    ww.__ms_ds_busy = true
    win.localStorage.setItem(pendKey, `${Date.now()}`)

    if (b) {
      shine(b, false)
    }
    var ats: Att[] = []

    if (ha) {
      const out: Att[] = []

      for (var i = 0; i < fs.length; i++) {
        const it = fs[i]

        if (!it) {
          continue
        }

        const nm0 = (it.name ?? "").trim()
        const tp0 = (it.type ?? "").toLowerCase()
        const ex = att.ext(nm0)

        if (!att.isImage(tp0, ex)) {
          continue
        }

        const u0 = typeof URL.createObjectURL === "function" ? URL.createObjectURL(it.file) : ""
        const u = typeof u0 === "string" ? u0 : ""

        if (!u) {
          continue
        }

        out.push({ name: nm0 || "image", url: u })
      }

      ats = out
    }

    const m: Msg = { role: "user", content: msg }
    hs.push(m)
    add(ta, "user", msg, false, false, ats)
    saveMsgs(cid, hs)
    title(cid, hs, "user")

    if (ha) {
      const list = fs.slice()
      const sync = async () => {
        const img = await att.readImgAtts(list)

        if (!img.length) {
          return
        }

        m.atts = img
        saveMsgs(cid, hs)
      }

      sync()
    }

    const p0 = ta.getAttribute("placeholder") ?? ""
    const p = p0.trim().toLowerCase()

    if (p.includes("assign a task") && p.includes("ask")) {
      ta.setAttribute("placeholder", "Send message to Operator")
      ta.rows = 1
    }

    ta.value = ""
    if (ha) {
      clearAtt()
    }
    const g = win as unknown as typeof globalThis
    const E = g.Event
    ta.dispatchEvent(new E("input", { bubbles: true }))
    ta.dispatchEvent(new E("change", { bubbles: true }))
    set(ta)
    ta.focus()

    const ph = add(ta, "assistant", "Thinking...", false, true)
    const run: Run = { ph, txt: "", ta, box }
    ww.__ms_ds_run = run
    const ac = new AbortController()
    ww.__ms_ds_abort = ac
    const msgs = hs.slice(Math.max(0, hs.length - 24))
    var ax: Msg[] | null = null
    const sendReq = async (atts: DraftFile[], rq: string, retry?: boolean) => {
      const rq0 = rq.trim()
      var base = msgs.slice()
      const last = base[base.length - 1] ?? null

      if (last && last.role === "user" && rq0 && last.content !== rq0) {
        base[base.length - 1] = { role: "user", content: rq0 }
      }

      var extra: Msg[] = []

      if (atts.length) {
        if (!ax) {
          if (ph) {
            ph.textContent = "Analyzing attachments..."
          }

          ax = await att.readAtts(atts, ac.signal)
        }

        extra = ax || []
      }

      if (ac.signal.aborted) {
        return
      }

      const stopped = ww.__ms_ds_run?.stop === true

      if (stopped) {
        return
      }

      if (extra.length) {
        const idx = Math.max(0, base.length - 1)
        const head = base.slice(0, idx)
        const tail = base.slice(idx)
        base = head.concat(extra, tail)
      }

      const m0 = doc.documentElement.getAttribute("data-ms-mode") ?? ""
      const m1 = m0.trim()
      const mode = m1 || "chat"
      const allowExec = mode.startsWith("operator-")
      const clean = base.map((m) => ({ role: m.role, content: m.content }))
      const req: Req = { messages: clean, chatId: cid, mode, allow_terminal_exec: allowExec }
      const again = retry === true
      const list0 = apiBaseCandidates()
      const list = list0.length ? list0.concat("") : [""]
      const sx = await streamWsResponse({
        win,
        run,
        req,
        bases: list,
        mark,
        ph,
        signal: ac.signal,
      })

      if (sx.wsConnectedBase) {
        rememberApiBase(sx.wsConnectedBase)
      }

      const stop = ww.__ms_ds_run?.stop === true

      if (stop) {
        ww.__ms_ds_busy = false
        ww.__ms_ds_abort = null
        ww.__ms_ds_run = null
        set(ta)
        win.localStorage.removeItem(pendKey)
        return
      }

      const retryable =
        !sx.ok &&
        !ac.signal.aborted &&
        !again &&
        isTransientTransportFailure(typeof sx.error === "string" ? sx.error : "", sx.stalled === true)

      if (retryable) {
        return sendReq(atts, rq, true)
      }

      ww.__ms_ds_busy = false
      ww.__ms_ds_abort = null
      ww.__ms_ds_run = null
      set(ta)
      win.localStorage.removeItem(pendKey)
      const t0 = typeof sx.text === "string" ? sx.text : ""
      const t = t0.trim()
      const terms = Array.isArray(sx.terms) ? sx.terms : []

      if (!sx.ok || !t) {
        const eRaw = typeof sx.error === "string" ? sx.error : ""
        const e0 = isLegacyStallText(eRaw) ? "" : eRaw
        const e = e0 || "Request failed"

        if (ph) {
          ph.textContent = e
          ph.setAttribute("data-err", "1")
          ph.removeAttribute("data-pending")
          return
        }

        add(ta, "assistant", e, true)
        return
      }

      hs.push({ role: "assistant", content: t })
      touch(cid)
      saveMsgs(cid, hs)
      if (terms.length) {
        const map = loadTerms(cid)
        map[`${hs.length - 1}`] = terms
        saveTerms(cid, map)
      }
      title(cid, hs, "assistant")

      if (ph) {
        mark(ph, t)
        ph.removeAttribute("data-pending")
        return
      }

      add(ta, "assistant", t)
    }

    sendReq(fs, rq).catch(() => {
      ww.__ms_ds_busy = false
      ww.__ms_ds_abort = null
      ww.__ms_ds_run = null
      win.localStorage.removeItem(pendKey)
      set(ta)

      if (ph) {
        ph.textContent = "Request failed"
        ph.setAttribute("data-err", "1")
        ph.removeAttribute("data-pending")
        return
      }

      add(ta, "assistant", "Request failed", true)
    })
  }

  const halt = (why?: string) => {
    const ww = win as DsWin
    const busy = ww.__ms_ds_busy === true
    const ac = ww.__ms_ds_abort ?? null
    const run = ww.__ms_ds_run ?? null
    const stopped = run?.stop === true
    const rd = run?.rd ?? null
    const ws = run?.ws ?? null

    if (stopped) {
      return
    }

    if (!busy && !ac && !run) {
      return
    }

    if (run) {
      run.stop = true
    }

    ww.__ms_ds_busy = false
    ww.__ms_ds_abort = null

    if (ac) {
      ac.abort()
    }

    if (rd) {
      rd.cancel().catch(() => {})
    }

    if (ws) {
      ws.close()
    }

    const ph = run?.ph ?? null
    const t0 = run?.txt ?? ""
    const t = t0.trim()

    if (ph) {
      if (t) {
        mark(ph, t)
      }

      if (!t) {
        ph.textContent = why || "Stopped"
      }

      ph.removeAttribute("data-pending")
    }

    if (t) {
      const hs = ww.__ms_ds_msgs ?? []
      ww.__ms_ds_msgs = hs
      const cid0 = ww.__ms_ds_id ?? ""
      const cid = cid0.trim()

      if (cid) {
        hs.push({ role: "assistant", content: t })
        touch(cid)
        saveMsgs(cid, hs)
      }
    }

    const ta0 = run?.ta ?? ww.__ms_ds_ta ?? null
    const ta = ta0?.tagName === "TEXTAREA" ? (ta0 as HTMLTextAreaElement) : null

    if (!ta) {
      return
    }

    set(ta)

    const cid0 = ww.__ms_ds_id ?? ""
    const cid = cid0.trim()

    if (cid) {
      win.localStorage.removeItem(`ms_chat_pending_${cid}`)
    }
  }

  return { go, halt }
}
