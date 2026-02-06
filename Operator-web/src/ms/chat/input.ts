import type { DraftFile } from "../../app/lib/store"
import { stopSvg } from "./constants"
import type { DsWin } from "./types"

export type InputApi = {
  isChat: (ta: HTMLTextAreaElement) => boolean
  shine: (b: HTMLButtonElement, on: boolean) => void
  load: (ta: HTMLTextAreaElement) => void
  save: (ta: HTMLTextAreaElement) => void
  pickAtt: () => DraftFile[]
  hasAtt: () => boolean
  clearAtt: () => void
  send: (box: Element, ta: HTMLTextAreaElement) => HTMLButtonElement | null
  set: (ta: HTMLTextAreaElement) => void
}

export const setupInput = (doc: Document, win: Window, sr: ShadowRoot | null, fit: (ta: HTMLTextAreaElement) => void): InputApi => {
  const dk = "__ms_chat_draft"
  const lim = 200000

  const isChat = (ta: HTMLTextAreaElement): boolean => {
    const r0 =
      doc.getElementById("chat-home-view-container") ??
      doc.querySelector("browser-mcp-container")?.shadowRoot?.querySelector("#chat-home-view-container") ??
      null
    const r = r0 && (r0 as Node).nodeType === 1 ? (r0 as HTMLElement) : null

    if (r && r.contains(ta)) {
      return true
    }

    const box0 = ta.closest?.('[data-ms-chatbox="1"]') ?? null
    const box = box0 && (box0 as Node).nodeType === 1 ? (box0 as HTMLElement) : null

    if (box) {
      return true
    }

    const ph0 = ta.getAttribute("placeholder") ?? ""
    const ph = ph0.trim().toLowerCase()

    if (ph.includes("assign a task") && ph.includes("ask")) {
      return true
    }

    if (ph.includes("ask anything")) {
      return true
    }

    if (ph.includes("send message")) {
      return true
    }

    if (ph.includes("message deepseek")) {
      return true
    }

    return false
  }

  const load = (ta: HTMLTextAreaElement) => {
    if (!isChat(ta)) {
      return
    }

    const cur = ta.value ?? ""

    if (cur) {
      return
    }

    const v = win.localStorage.getItem(dk) ?? ""

    if (!v) {
      return
    }

    ta.value = v
    const g = win as unknown as typeof globalThis
    const E = g.Event
    ta.dispatchEvent(new E("input", { bubbles: true }))
  }

  const save = (ta: HTMLTextAreaElement) => {
    if (!isChat(ta)) {
      return
    }

    const v0 = ta.value ?? ""
    const v = v0.length > lim ? v0.slice(0, lim) : v0
    win.localStorage.setItem(dk, v)
  }

  type Aw = Window & {
    __ms_att_get?: (() => DraftFile[]) | null
    __ms_att_clear?: (() => void) | null
  }

  const pull = () => {
    const w0 = win as Aw
    const fn0 = w0.__ms_att_get

    if (typeof fn0 === "function") {
      return fn0()
    }

    const w1 = (win.top ?? win) as Aw
    const fn1 = w1.__ms_att_get
    return typeof fn1 === "function" ? fn1() : []
  }

  const pickAtt = () => pull()
  const hasAtt = () => pull().length > 0
  const clearAtt = () => {
    const w0 = win as Aw
    const fn0 = w0.__ms_att_clear

    if (typeof fn0 === "function") {
      fn0()
      return
    }

    const w1 = (win.top ?? win) as Aw
    const fn1 = w1.__ms_att_clear

    if (typeof fn1 === "function") {
      fn1()
    }
  }

  const send = (box: Element, ta: HTMLTextAreaElement): HTMLButtonElement | null => {
    const pick = (root: Document | ShadowRoot | Element | null): HTMLButtonElement | null => {
      if (!root) {
        return null
      }

      const b0 = root.querySelector<HTMLButtonElement>('button[type="submit"]') ?? null

      if (b0) {
        return b0
      }

      const bs = Array.from(root.querySelectorAll<HTMLButtonElement>("button"))
      const b1 =
        bs.find((b) => {
          const c = b.getAttribute("class") ?? ""
          return c.includes("bg-[var(--Button-primary-black)]") && c.includes("rounded-full") && c.includes("w-8")
        }) ?? null

      if (b1) {
        return b1
      }

      for (var i = 0; i < bs.length; i++) {
        const b = bs[i]
        const a0 = b?.getAttribute("aria-label") ?? ""
        const a = a0.toLowerCase()

        if (!a.includes("send")) {
          continue
        }

        return b
      }

      const out = bs.filter((b) => {
        if (b.id === "__ms_chat_more") {
          return false
        }

        if (b.getAttribute("data-testid") === "model-selector-dropdown") {
          return false
        }

        if ((b.getAttribute("data-ms-search-pill") ?? "").trim() === "1") {
          return false
        }

        const plus = b.querySelector("svg.lucide-plus")

        if (plus) {
          return false
        }

        return true
      })

      return out[out.length - 1] ?? null
    }

    const fm = ta.closest("form") ?? null
    const root = fm ?? box
    const b0 = pick(root)

    if (b0) {
      return b0
    }

    const p0 = (root as Element | null)?.parentElement ?? null
    const b1 = pick(p0)

    if (b1) {
      return b1
    }

    const p1 = p0?.parentElement ?? null
    const b2 = pick(p1)

    if (b2) {
      return b2
    }

    const body = doc.body
    const b3 = pick(body)

    if (b3) {
      return b3
    }

    return null
  }

  const swap = (b: HTMLButtonElement, on: boolean) => {
    if (on) {
      const h0 = b.getAttribute("data-ms-send-html") ?? ""

      if (!h0) {
        b.setAttribute("data-ms-send-html", b.innerHTML)
      }

      const a0 = b.getAttribute("aria-label") ?? ""
      const a1 = b.getAttribute("data-ms-send-label") ?? ""

      if (!a1 && a0) {
        b.setAttribute("data-ms-send-label", a0)
      }

      const t0 = b.getAttribute("title") ?? ""
      const t1 = b.getAttribute("data-ms-send-title") ?? ""

      if (!t1 && t0) {
        b.setAttribute("data-ms-send-title", t0)
      }

      b.innerHTML = stopSvg
      b.setAttribute("aria-label", "Stop generating")
      b.setAttribute("title", "Stop generating")
      b.setAttribute("data-ms-stop", "1")
      return
    }

    const h = b.getAttribute("data-ms-send-html") ?? ""

    if (h) {
      b.innerHTML = h
      b.removeAttribute("data-ms-send-html")
    }

    const a = b.getAttribute("data-ms-send-label") ?? ""

    if (a) {
      b.setAttribute("aria-label", a)
      b.removeAttribute("data-ms-send-label")
    }

    if (!a) {
      b.removeAttribute("aria-label")
      b.removeAttribute("data-ms-send-label")
    }

    const t = b.getAttribute("data-ms-send-title") ?? ""

    if (t) {
      b.setAttribute("title", t)
      b.removeAttribute("data-ms-send-title")
    }

    if (!t) {
      b.removeAttribute("title")
      b.removeAttribute("data-ms-send-title")
    }

    b.removeAttribute("data-ms-stop")
  }

  const shine = (b: HTMLButtonElement, on: boolean) => {
    b.setAttribute("data-ms-send", "1")
    const ww = win as DsWin
    const busy = ww.__ms_ds_busy === true
    swap(b, busy)

    if (busy) {
      b.removeAttribute("disabled")
      b.setAttribute("aria-disabled", "false")
      b.style.setProperty("opacity", "1", "important")
      b.style.setProperty("cursor", "pointer", "important")
      b.style.removeProperty("background")
      b.style.removeProperty("box-shadow")
      b.style.removeProperty("filter")
      return
    }

    if (on) {
      b.removeAttribute("disabled")
      b.setAttribute("aria-disabled", "false")
      b.style.setProperty("opacity", "1", "important")
      b.style.setProperty("cursor", "pointer", "important")
      b.style.removeProperty("background")
      b.style.removeProperty("box-shadow")
      b.style.removeProperty("filter")

      const ps = Array.from(b.querySelectorAll<SVGPathElement>("svg path"))

      for (var i = 0; i < ps.length; i++) {
        ps[i]?.style.setProperty("fill", "var(--icon-onblack, var(--text-onblack, #fff))", "important")
        ps[i]?.style.setProperty("stroke", "var(--icon-onblack, var(--text-onblack, #fff))", "important")
      }

      return
    }

    b.setAttribute("disabled", "")
    b.setAttribute("aria-disabled", "true")
    b.style.removeProperty("opacity")
    b.style.removeProperty("cursor")
    b.style.removeProperty("background")
    b.style.removeProperty("box-shadow")
    b.style.removeProperty("filter")

    const ps = Array.from(b.querySelectorAll<SVGPathElement>("svg path"))

    for (var i = 0; i < ps.length; i++) {
      ps[i]?.style.removeProperty("fill")
      ps[i]?.style.removeProperty("stroke")
    }
  }

  const set = (ta: HTMLTextAreaElement) => {
    ;(win as unknown as { __ms_ds_ta?: HTMLTextAreaElement | null }).__ms_ds_ta = ta

    const v0 = ta.value ?? ""
    const v = v0.trim()
    const ok = v.length > 0
    const ha = hasAtt()
    const on = ok || ha
    const hk = "data-ms-h0"

    if (!ok) {
      const okc = isChat(ta)

      if (okc) {
        ta.rows = 1
      }

      const hv0 = ta.getAttribute(hk) ?? ""

      if (!hv0) {
        const h1 = Math.round(ta.getBoundingClientRect().height)

        if (h1 > 0) {
          ta.setAttribute(hk, `${h1}`)
        }
      }
    }

    fit(ta)
    save(ta)

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

    if (box.getAttribute("data-ms-chatbox") !== "1") {
      box.setAttribute("data-ms-chatbox", "1")
    }

    if (on) {
      box.setAttribute("data-ms-typed", "1")
    }

    if (!on) {
      box.removeAttribute("data-ms-typed")
    }

    win.requestAnimationFrame(() => {
      const b = send(box, ta)

      if (!b) {
        return
      }

      shine(b, on)
    })
  }

  const boot = (root: ParentNode | null) => {
    if (!root) {
      return
    }

    const ts = root.querySelectorAll<HTMLTextAreaElement>("textarea")

    for (var i = 0; i < ts.length; i++) {
      const ta = ts[i]

      if (!isChat(ta)) {
        continue
      }

      if (ta.getAttribute("data-ms-ta") !== "1") {
        ta.setAttribute("data-ms-ta", "1")
      }

      load(ta)
      set(ta)
    }
  }

  const run = () => {
    boot(doc)
    boot(sr)
  }

  win.requestAnimationFrame(run)
  win.setTimeout(run, 250)
  win.setTimeout(run, 1000)

  return { isChat, shine, load, save, pickAtt, hasAtt, clearAtt, send, set }
}

