import { chats } from "./bridge/chats"
import { toBase } from "../lib/route"
import type { BootDeps, MsWin } from "./bootTypes"

export const bootSidebar = (d: BootDeps, doc: Document, win: Window) => {
  d.sd.current = doc
  const ww = win as MsWin
  const key = "data-ms-app-side"
  const cur = doc.documentElement.getAttribute(key) ?? ""
  const ok = cur === d.vr.current && ww.__ms_app_side
  if (ok) {
    return true
  }
  const old0 = ww.__ms_app_side
  ww.__ms_app_side = null
  old0?.()
  const old = d.cb.current
  d.cb.current = null
  old?.()
  doc.documentElement.setAttribute(key, d.vr.current)
  if (d.open) {
    doc.documentElement.removeAttribute("data-ms-collapsed")
  } else {
    doc.documentElement.setAttribute("data-ms-collapsed", "1")
  }
  const head = doc.head
  if (head) {
    const id = "__fix"
    const st0 = doc.getElementById(id)
    const st = st0?.tagName === "STYLE" ? (st0 as HTMLStyleElement) : doc.createElement("style")
    if (!(st0?.tagName === "STYLE")) {
      st.id = id
      head.appendChild(st)
    }
    st.textContent =
      "html,body{background:var(--background-gray-main, rgb(24,24,27))!important;overflow-y:auto!important;overflow-x:hidden!important;}nav{box-shadow:none!important;border-right:0!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}nav::before,nav::after{box-shadow:none!important;border-right:0!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}html[data-ms-collapsed=\"1\"] nav{overflow:hidden!important;}html[data-ms-collapsed=\"1\"] nav > div:nth-child(2) > div:nth-child(4){display:none!important;}html[data-ms-collapsed=\"1\"] nav > div:nth-child(2) > div.clickable > div.flex-1{display:none!important;}html[data-ms-collapsed=\"1\"] nav > div:last-child > button{display:none!important;}"
  }
  const ts: number[] = []
  const rs: number[] = []
  const calc = () => {
    const nav =
      doc.querySelector("nav") ??
      doc.querySelector("browser-mcp-container")?.shadowRoot?.querySelector("nav") ??
      null
    const r = nav?.getBoundingClientRect()
    if (!r) {
      return
    }
    const n0 = nav && (nav as Node).nodeType === 1 ? (nav as HTMLElement) : null
    const sw0 = n0?.style?.width ?? ""
    const sw1 = Number.parseFloat(sw0)
    const sw = Number.isFinite(sw1) && sw1 > 0 ? sw1 : NaN
    const w0 = Number.isFinite(sw) ? sw : r.width
    const rw = Math.round(w0)
    const min = rw >= 320 ? 320 : 260
    const max = Math.max(min, Math.round(Math.min(520, win.innerWidth)))
    d.setX(0)
    d.setW(Math.min(max, Math.max(min, rw)))
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => calc()) : null
  const nav0 =
    doc.querySelector("nav") ??
    doc.querySelector("browser-mcp-container")?.shadowRoot?.querySelector("nav") ??
    null
  const nav = nav0 && (nav0 as Node).nodeType === 1 ? (nav0 as HTMLElement) : null

  if (ro && nav) {
    ro.observe(nav)
  }

  win.addEventListener("resize", calc)

  var down = false
  var x0 = 0
  var w0 = 0

  const isInt = (path: readonly (EventTarget | undefined)[]) => {
    for (var i = 0; i < path.length; i++) {
      const el = path[i] as Element | null

      if (!el || (el as Node).nodeType !== 1) {
        continue
      }

      const tag = el.tagName
      const role = (el.getAttribute?.("role") ?? "").toLowerCase()

      if (
        tag === "BUTTON" ||
        tag === "A" ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "LABEL"
      ) {
        return true
      }

      if (role === "button" || role === "link" || role === "menuitem" || role === "tab") {
        return true
      }

      const cls = el.classList

      if (cls?.contains?.("clickable") || cls?.contains?.("cursor-pointer")) {
        return true
      }
    }

    return false
  }

  const rd = (ev: Event) => {
    if (!nav) {
      return
    }

    const e = ev as PointerEvent
    const path = e.composedPath?.() ?? []
    const interactive = isInt(path)

    if (e.button !== 0) {
      return
    }

    const r = nav.getBoundingClientRect()
    const edge = Math.round(r.right - e.clientX)

    if (edge > 12) {
      return
    }

    if (interactive) {
      return
    }

    down = true
    x0 = e.clientX
    w0 = r.width
    nav.setPointerCapture?.(e.pointerId)
    doc.body?.style.setProperty("user-select", "none", "important")
    doc.documentElement.style.setProperty("cursor", "col-resize", "important")
    ev.preventDefault()
    ev.stopPropagation()
  }

  const rm = (ev: Event) => {
    if (!nav || !down) {
      return
    }

    const e = ev as PointerEvent
    const dx = e.clientX - x0
    const max = Math.max(260, Math.round(Math.min(520, win.innerWidth)))
    const w1 = Math.min(max, Math.max(260, Math.round(w0 + dx)))
    nav.style.width = `${w1}px`
    ev.preventDefault()
    ev.stopPropagation()
  }

  const ru = (ev: Event) => {
    if (!nav || !down) {
      return
    }

    const e = ev as PointerEvent
    down = false
    nav.releasePointerCapture?.(e.pointerId)
    doc.body?.style.removeProperty("user-select")
    doc.documentElement.style.removeProperty("cursor")
    ev.preventDefault()
    ev.stopPropagation()
  }

  nav?.addEventListener("pointerdown", rd, true)
  win.addEventListener("pointermove", rm, true)
  win.addEventListener("pointerup", ru, true)
  win.addEventListener("pointercancel", ru, true)

  const sel = "div.cursor-pointer.size-\\[32px\\]"
  const fn = (ev: Event) => {
    const path = ev.composedPath()
    const ok0 = path.some((n) => {
      const el = n as { classList?: { contains?: (s: string) => boolean } }
      return el.classList?.contains?.("lucide-panel-left") ?? false
    })

    const t = ev.target as { closest?: (s: string) => Element | null } | null
    const btn = t?.closest?.(sel) ?? null
    const ok1 = btn?.querySelector?.("svg.lucide-panel-left")

    if (ok0 || ok1) {
      ev.preventDefault()
      ev.stopPropagation()
      const cur = (win.localStorage.getItem("ms_open") ?? "") === "1"
      const next = !cur

      if (next) {
        doc.documentElement.removeAttribute("data-ms-collapsed")
      }

      if (!next) {
        doc.documentElement.setAttribute("data-ms-collapsed", "1")
      }

      d.setOpen(next)
      return
    }

    const closed = doc.documentElement.getAttribute("data-ms-collapsed") === "1"

    if (!closed) {
      return
    }

    const t0 = ev.target as Node | null
    const hit = Boolean(nav && t0 && nav.contains(t0))

    if (!hit) {
      return
    }

    if (isInt(path)) {
      return
    }

    ev.preventDefault()
    ev.stopPropagation()
    doc.documentElement.removeAttribute("data-ms-collapsed")
    d.setOpen(true)
  }

  const root = doc.querySelector("browser-mcp-container")?.shadowRoot ?? null

  win.addEventListener("click", fn, true)
  root?.addEventListener("click", fn, true)

  const home = () => {
    const sw = d.ia.current?.contentWindow as unknown as { __ms_ds_reset?: ((keep?: boolean) => void) | null } | null
    sw?.__ms_ds_reset?.()
    window.localStorage.removeItem("ms_chat_active")
    window.history.replaceState(null, "", toBase("/"))
  }

  const fresh = () => {
    home()
  }

  const lg = (ev: Event) => {
    const path = (ev as PointerEvent).composedPath?.() ?? []
    const skip = path.some((n) => {
      const el = n as { tagName?: string; getAttribute?: (s: string) => string | null; textContent?: string | null }
      const title = (el.getAttribute?.("title") ?? "").trim()
      const txt = (el.textContent ?? "").trim()
      return (el.tagName === "SPAN" || el.tagName === "DIV") && (title === "New task" || txt === "New task")
    })

    if (skip) {
      return
    }

    var nav: Element | null = null

    for (var i = 0; i < path.length; i++) {
      const n = path[i] as { tagName?: string } | null

      if (n?.tagName !== "NAV") {
        continue
      }

      nav = n as unknown as Element
      break
    }

    if (!nav) {
      return
    }

    const img0 = nav.querySelector?.('img[width="35"][height="35"]') ?? null
    const img1 = img0 && (img0 as Node).nodeType === 1 ? (img0 as Element) : null
    const box = img1?.parentElement ?? null
    const t = ev.target as unknown as Node | null
    const ok = Boolean(box && t && box.contains(t))

    if (!ok) {
      return
    }

    const tp = (ev as { type?: string } | null)?.type ?? ""

    ev.preventDefault()
    ev.stopPropagation()
    ev.stopImmediatePropagation()

    if (tp !== "click") {
      return
    }

    home()
    return
  }

  win.addEventListener("pointerdown", lg, true)
  root?.addEventListener("pointerdown", lg, true)
  win.addEventListener("click", lg, true)
  root?.addEventListener("click", lg, true)

  const nt = (ev: Event) => {
    const path = (ev as PointerEvent).composedPath?.() ?? []
    const hit = path.some((n) => {
      const el = n as { tagName?: string; getAttribute?: (s: string) => string | null; textContent?: string | null }
      const title = (el.getAttribute?.("title") ?? "").trim()
      const txt = (el.textContent ?? "").trim()
      return (el.tagName === "SPAN" || el.tagName === "DIV") && (title === "New task" || txt === "New task")
    })

    if (!hit) {
      return
    }

    const tp = (ev as { type?: string } | null)?.type ?? ""

    ev.preventDefault()
    ev.stopPropagation()
    ev.stopImmediatePropagation()

    if (tp !== "click") {
      return
    }

    fresh()
  }

  win.addEventListener("pointerdown", nt, true)
  root?.addEventListener("pointerdown", nt, true)
  win.addEventListener("click", nt, true)
  root?.addEventListener("click", nt, true)

  const st = (ev: Event) => {
    const e = ev as StorageEvent
    const k = e.key ?? ""

    if (k !== "ms_chats" && k !== "ms_chat_active") {
      return
    }

    chats(doc)
  }

  win.addEventListener("storage", st)
  d.cb.current = () => {
    for (var i = 0; i < ts.length; i++) {
      win.clearTimeout(ts[i] ?? 0)
    }

    for (var i = 0; i < rs.length; i++) {
      win.cancelAnimationFrame(rs[i] ?? 0)
    }

    win.removeEventListener("resize", calc)
    ro?.disconnect()
    nav?.removeEventListener("pointerdown", rd, true)
    win.removeEventListener("pointermove", rm, true)
    win.removeEventListener("pointerup", ru, true)
    win.removeEventListener("pointercancel", ru, true)
    win.removeEventListener("click", fn, true)
    root?.removeEventListener("click", fn, true)
    win.removeEventListener("pointerdown", lg, true)
    root?.removeEventListener("pointerdown", lg, true)
    win.removeEventListener("click", lg, true)
    root?.removeEventListener("click", lg, true)
    win.removeEventListener("pointerdown", nt, true)
    root?.removeEventListener("pointerdown", nt, true)
    win.removeEventListener("click", nt, true)
    root?.removeEventListener("click", nt, true)
    win.removeEventListener("storage", st)
  }
  ww.__ms_app_side = d.cb.current

  rs.push(win.requestAnimationFrame(calc))
  ts.push(win.setTimeout(calc, 250))

  var okc = false
  var cn = 0

  const cs = () => {
    if (okc) {
      return
    }

    cn++

    const ok = chats(doc)

    if (ok) {
      okc = true
      return
    }

    if (cn > 20) {
      return
    }

    ts.push(win.setTimeout(cs, 250))
  }

  rs.push(win.requestAnimationFrame(cs))
  ts.push(win.setTimeout(cs, 1000))
  return true
}
