import type { DsWin } from "./types"

export type EventsInput = {
  isChat: (ta: HTMLTextAreaElement) => boolean
  send: (box: Element, ta: HTMLTextAreaElement) => HTMLButtonElement | null
  hasAtt: () => boolean
  set: (ta: HTMLTextAreaElement) => void
  load: (ta: HTMLTextAreaElement) => void
}

export type EventsFlow = {
  go: (ta: HTMLTextAreaElement) => void
  halt: (why?: string) => void
}

export type EventsMessages = {
  handleCopyEvent: (ev: Event) => void
}

export const setupEvents = (
  doc: Document,
  win: Window,
  sr: ShadowRoot | null,
  input: EventsInput,
  flow: EventsFlow,
  messages: EventsMessages,
) => {
  const isChat = input.isChat
  const send = input.send
  const hasAtt = input.hasAtt
  const set = input.set
  const load = input.load
  const go = flow.go
  const halt = flow.halt
  const cpy = messages.handleCopyEvent
  type Aw = Window & { __ms_att_pick?: (() => void) | null }
  var lp = 0

  const openAtt = () => {
    const w1 = (win.top ?? win) as Aw
    const fn1 = w1.__ms_att_pick

    if (typeof fn1 === "function") {
      fn1()
      return
    }

    const w0 = win as Aw
    const fn0 = w0.__ms_att_pick

    if (typeof fn0 === "function") {
      fn0()
    }
  }

  const stop = (ev: Event) => {
    ev.preventDefault()
    ev.stopPropagation()
    const e0 = ev as { stopImmediatePropagation?: () => void } | null
    e0?.stopImmediatePropagation?.()
  }

  const kd = (ev: Event) => {
    const kev = ev as KeyboardEvent
    const k0 = kev.key ?? ""
    const k1 = k0 || (kev.code ?? "")
    const k = k1.toLowerCase()

    if (k === "escape" || k === "esc") {
      const ww = win as DsWin
      const busy = ww.__ms_ds_busy === true
      const ac = ww.__ms_ds_abort ?? null
      const run = ww.__ms_ds_run ?? null
      const ok = busy || ac || run

      if (!ok) {
        return
      }

      halt("Stopped")
      ev.preventDefault()
      ev.stopPropagation()
      return
    }

    if (k !== "enter") {
      return
    }

    const sh = kev.shiftKey

    if (sh) {
      return
    }

    const path = kev.composedPath?.() ?? []
    var ta: HTMLTextAreaElement | null = null

    for (var i = 0; i < path.length; i++) {
      const n = path[i] as { tagName?: string } | null

      if (n?.tagName !== "TEXTAREA") {
        continue
      }

      ta = n as unknown as HTMLTextAreaElement
      break
    }

    if (!ta) {
      const t0 = kev.target as { tagName?: string } | null
      ta = t0?.tagName === "TEXTAREA" ? (t0 as unknown as HTMLTextAreaElement) : null
    }

    if (!ta) {
      const t = kev.target as { closest?: (s: string) => Element | null } | null
      const tb0 = t?.closest?.("textarea") ?? null
      ta = tb0?.tagName === "TEXTAREA" ? (tb0 as HTMLTextAreaElement) : null
    }

    if (!ta) {
      return
    }

    const t = ta
    const ok = isChat(t)

    if (!ok) {
      win.requestAnimationFrame(() => set(t))
      return
    }

    ev.preventDefault()
    ev.stopPropagation()
    go(t)
    win.requestAnimationFrame(() => set(t))
  }

  const clk = (ev: Event) => {
    const tp0 = (ev as { type?: string } | null)?.type ?? ""
    const tp = tp0.toLowerCase()
    const pd = tp === "pointerdown"
    const ck = tp === "click"
    const b = (ev as PointerEvent).button
    const okb = typeof b !== "number" || b === 0

    if (!okb) {
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

    const box =
      btn.closest('[data-ms-chatbox="1"]') ??
      btn.closest("form") ??
      btn.closest("div.rounded-\\[22px\\]") ??
      btn.closest("div.rounded-\\[24px\\]") ??
      null

    if (!box) {
      return
    }

    const ta0 = box.querySelector("textarea") ?? null
    const ta = ta0?.tagName === "TEXTAREA" ? (ta0 as HTMLTextAreaElement) : null

    if (!ta) {
      return
    }

    if (!isChat(ta)) {
      return
    }

    const att0 = (btn.getAttribute("data-ms-att-x") ?? "").trim() === "1"
    const att1 = btn.closest("#__ms_att") ?? null
    const att2 = btn.closest("#__ms_view") ?? null
    const att = att0 || Boolean(att1) || Boolean(att2)

    if (att) {
      return
    }

    const isSearch = (btn.getAttribute("data-ms-search-pill") ?? "").trim() === "1"

    if (isSearch) {
      if (!ck) {
        return
      }

      const on = (box.getAttribute("data-ms-search") ?? "").trim() === "1"

      if (on) {
        box.removeAttribute("data-ms-search")
      } else {
        box.setAttribute("data-ms-search", "1")
      }

      const next = !on
      const label = next ? "Search, click to remove" : "Search"
      const btns = Array.from(box.querySelectorAll<HTMLButtonElement>('button[data-ms-search-pill="1"]'))

      for (var i = 0; i < btns.length; i++) {
        const b = btns[i]

        if (next) {
          b.setAttribute("data-active", "1")
          b.setAttribute("aria-pressed", "true")
        } else {
          b.removeAttribute("data-active")
          b.setAttribute("aria-pressed", "false")
        }

        b.setAttribute("aria-label", label)
        b.setAttribute("title", label)
      }

      ev.preventDefault()
      ev.stopPropagation()
      return
    }

    const mk = (btn.getAttribute("data-ms-plus") ?? "").trim() === "1"
    const dt = (btn.getAttribute("data-testid") ?? "").trim()
    const isModel = dt === "model-selector-dropdown"
    const t0 = (btn.getAttribute("type") ?? "").toLowerCase()
    const a0 = (btn.getAttribute("aria-label") ?? "").toLowerCase()
    const c0 = btn.getAttribute("class") ?? ""
    const ok0 = c0.includes("bg-[var(--Button-primary-black)]") && c0.includes("rounded-full")
    const ok1 = c0.includes("w-8") || c0.includes("h-8")
    const sendish = t0 === "submit" || a0.includes("send") || (ok0 && ok1)
    const plus = mk || (!isModel && !sendish)

    if (plus) {
      if (pd) {
        lp = Date.now()
        stop(ev)
        openAtt()
        return
      }

      if (!ck) {
        return
      }

      stop(ev)
      const now = Date.now()
      const dt = now - lp
      if (lp > 0 && dt < 800) {
        return
      }

      lp = now
      openAtt()
      return
    }

    const sb = send(box, ta)

    if (!sb || sb !== btn) {
      return
    }

    const ww = win as DsWin
    const busy = ww.__ms_ds_busy === true

    if (!busy && !ck) {
      return
    }

    if (busy && !pd) {
      return
    }

    if (busy) {
      ev.preventDefault()
      ev.stopPropagation()
      halt("Stopped")
      return
    }

    const v0 = ta.value ?? ""
    const v = v0.trim()

    if (!v && !hasAtt()) {
      return
    }

    ev.preventDefault()
    ev.stopPropagation()
    go(ta)
  }

  const fn = (ev: Event) => {
    const path = (ev as PointerEvent).composedPath?.() ?? []

    for (var i = 0; i < path.length; i++) {
      const ta0 = path[i] as { tagName?: string } | null

      if (ta0?.tagName !== "TEXTAREA") {
        continue
      }

      set(ta0 as unknown as HTMLTextAreaElement)
      return
    }

    const t = ev.target as { closest?: (s: string) => Element | null } | null
    const tb0 = t?.closest?.("textarea") ?? null
    const tb = tb0?.tagName === "TEXTAREA" ? (tb0 as HTMLTextAreaElement) : null

    if (!tb) {
      return
    }

    set(tb)
  }

  win.addEventListener("keydown", kd, true)
  doc.addEventListener("keydown", kd, true)
  sr?.addEventListener("keydown", kd, true)
  win.addEventListener("pointerdown", cpy, true)
  doc.addEventListener("pointerdown", cpy, true)
  sr?.addEventListener("pointerdown", cpy, true)
  win.addEventListener("click", cpy, true)
  doc.addEventListener("click", cpy, true)
  sr?.addEventListener("click", cpy, true)
  win.addEventListener("pointerdown", clk, true)
  doc.addEventListener("pointerdown", clk, true)
  sr?.addEventListener("pointerdown", clk, true)
  win.addEventListener("click", clk, true)
  doc.addEventListener("click", clk, true)
  sr?.addEventListener("click", clk, true)
  doc.addEventListener("input", fn, true)
  sr?.addEventListener("input", fn, true)
  doc.addEventListener("change", fn, true)
  sr?.addEventListener("change", fn, true)

  const hook = (root: ParentNode | null) => {
    if (!root) {
      return
    }

    const ts = root.querySelectorAll<HTMLTextAreaElement>("textarea")

    for (var i = 0; i < ts.length; i++) {
      const ta = ts[i]

      if (ta.getAttribute("data-ms-ta") === "1") {
        load(ta)
        set(ta)
        continue
      }

      ta.setAttribute("data-ms-ta", "1")
      load(ta)
      set(ta)
    }
  }

  const att = () => {
    hook(doc)
    hook(sr)
  }

  doc.addEventListener("ms-att", att, true)
  sr?.addEventListener("ms-att", att, true)

  const g = win as unknown as typeof globalThis
  const MO = g.MutationObserver
  const mo = MO
    ? new MO((ms) => {
        for (var i = 0; i < ms.length; i++) {
          const m = ms[i]
          const added = m?.addedNodes ?? []

          if (!added.length) {
            continue
          }

          hook(doc)
          hook(sr)
          break
        }
      })
    : null

  if (mo) {
    mo.observe(doc.documentElement, { childList: true, subtree: true })
    sr && mo.observe(sr, { childList: true, subtree: true })
  }

  hook(doc)
  hook(sr)

  win.requestAnimationFrame(() => {
    hook(doc)
    hook(sr)
  })

  win.setTimeout(() => {
    hook(doc)
    hook(sr)
  }, 250)

  win.setTimeout(() => {
    hook(doc)
    hook(sr)
  }, 1000)
}
