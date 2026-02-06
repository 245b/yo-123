import { activeKey } from "./storage"
import type { Att, Ch, DsWin, Msg, TermEntry } from "./types"

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
}

export type SessionInput = {
  set: (ta: HTMLTextAreaElement) => void
}

export type SessionStore = {
  loadMsgs: (id: string) => Msg[]
  loadTerms: (id: string) => Record<string, TermEntry[]>
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
  const set = input.set
  const loadMsgs = store.loadMsgs
  const loadTerms = store.loadTerms
  const setCur = store.setCur
  const touch = store.touch
  const ak = activeKey

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

    const status = doc.createElement("div")
    status.className = "ms-term-muted"
    status.setAttribute("data-ms-term-status", "1")
    status.textContent = "done"

    head.appendChild(tag)
    head.appendChild(status)

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
      const input0 = typeof it.input === "string" ? it.input : ""
      const output0 = typeof it.output === "string" ? it.output : ""
      const status0 = typeof it.status === "string" ? it.status : ""
      const status = status0 === "failed" || status0 === "running" ? status0 : "done"
      setTermText(box, '[data-ms-term-in="1"]', input0)
      setTermText(box, '[data-ms-term-out="1"]', output0 || "done")
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
        return
      }
    }

    if (!cid0 && !cur0) {
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

    ta.setAttribute("placeholder", "Send message to Manus")
    set(ta)
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

    const id = (win.localStorage.getItem(ak) ?? "").trim()

    if (!id) {
      return
    }

    show(id)
  }

  const onStorage = (ev: StorageEvent) => {
    const e = ev as StorageEvent
    const k = e.key ?? ""

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
    const want0 = win.localStorage.getItem(ak) ?? ""
    const want = want0.trim()
    const cur0 = ww.__ms_ds_id ?? ""
    const cur = cur0.trim()

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
