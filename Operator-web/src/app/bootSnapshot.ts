import * as ms from "../ms"
import { toBase } from "../lib/route"
import type { BootDeps, MsWin } from "./bootTypes"

export const bootSnapshot = (d: BootDeps, doc: Document, win: Window) => {
  const ww = win as MsWin
  const key = "data-ms-app-snap"
  const cur = doc.documentElement.getAttribute(key) ?? ""
  const ok0 = cur === d.vr.current && ww.__ms_app_snap

  if (ok0) {
    return true
  }

  const old0 = ww.__ms_app_snap
  ww.__ms_app_snap = null
  old0?.()

  doc.documentElement.setAttribute(key, d.vr.current)
  const old = d.ca.current
  d.ca.current = null
  old?.()
  d.shift.current = 0

  const sel = "div.cursor-pointer.size-\\[32px\\]"
  const home = () => {
    const sw = win as unknown as { __ms_ds_reset?: ((keep?: boolean) => void) | null } | null
    sw?.__ms_ds_reset?.()
    window.localStorage.removeItem("ms_chat_active")
    window.history.replaceState(null, "", toBase("/"))
  }

  const fresh = () => {
    home()
  }
  const fn = (ev: Event) => {
    const path = ev.composedPath()
    const tp = (ev as { type?: string } | null)?.type ?? ""

    const pen = path.some((n) => {
      const el = n as { classList?: { contains?: (s: string) => boolean } }
      return el.classList?.contains?.("lucide-square-pen") ?? false
    })

    if (pen) {
      fresh()
      ev.preventDefault()
      ev.stopPropagation()
      return
    }

    var img: { tagName?: string; getAttribute?: (s: string) => string | null } | null = null

    for (var i = 0; i < path.length; i++) {
      const n = path[i] as { tagName?: string; getAttribute?: (s: string) => string | null } | null

      if (n?.tagName !== "IMG") {
        continue
      }

      img = n
      break
    }

    const w0 = img?.getAttribute?.("width") ?? ""
    const h0 = img?.getAttribute?.("height") ?? ""
    const w1 = Number.parseInt(w0.trim(), 10)
    const h1 = Number.parseInt(h0.trim(), 10)
    var logo = w1 === 35 && h1 === 35

    if (!logo) {
      var nav: Element | null = null

      for (var i = 0; i < path.length; i++) {
        const n = path[i] as { tagName?: string } | null

        if (n?.tagName !== "NAV") {
          continue
        }

        nav = n as unknown as Element
        break
      }

      const img0 = nav?.querySelector?.('img[width="35"][height="35"]') ?? null
      const img1 = img0 && (img0 as Node).nodeType === 1 ? (img0 as Element) : null
      const box = img1?.parentElement ?? null
      const t = ev.target as unknown as Node | null
      logo = Boolean(box && t && box.contains(t))
    }

    if (logo) {
      ev.preventDefault()
      ev.stopPropagation()
      ;(ev as unknown as { stopImmediatePropagation?: () => void } | null)?.stopImmediatePropagation?.()

      if (tp !== "click") {
        return
      }

      home()
      return
    }

    const x = (ev as PointerEvent).clientX
    const edge = Math.max(8, Math.round(d.pad))
    const ok0 = x <= edge
    const ok1 = path.some((n) => {
      const el = n as { classList?: { contains?: (s: string) => boolean } }
      return el.classList?.contains?.("lucide-panel-left") ?? false
    })

    const t = ev.target as { closest?: (s: string) => Element | null } | null
    const svg0 = t?.closest?.("svg.lucide-plus") ?? null
    const svg = svg0 instanceof SVGElement ? svg0 : null

    if (svg) {
      const btn0 = svg.closest("button") ?? null
      const btn = btn0 instanceof HTMLElement ? btn0 : null
      const row =
        btn?.closest("div.px-3.flex.gap-2.item-center") ?? btn?.closest("div.px-3.flex.gap-2.items-center") ?? null
      const box = row?.closest("div.rounded-\\[22px\\]") ?? null

      if (box) {
        return
      }
    }

    const btn = t?.closest?.(sel) ?? null
    const ok2 = btn?.querySelector?.("svg.lucide-panel-left")

    if (!ok0 && !ok1 && !ok2) {
      return
    }

    if (tp !== "click") {
      return
    }

    d.setOpen(true)
  }

  const root = doc.querySelector("browser-mcp-container")?.shadowRoot ?? null

  win.addEventListener("pointerdown", fn, true)
  root?.addEventListener("pointerdown", fn, true)
  win.addEventListener("click", fn, true)
  root?.addEventListener("click", fn, true)
  d.ca.current = () => {
    win.removeEventListener("pointerdown", fn, true)
    root?.removeEventListener("pointerdown", fn, true)
    win.removeEventListener("click", fn, true)
    root?.removeEventListener("click", fn, true)
  }
  ww.__ms_app_snap = d.ca.current
  const cfg = {
    open: d.open,
    w: d.w,
    dur: d.dur,
    pad: d.pad,
    shift: d.shift,
  }
  ms.mid(doc, win, cfg)
  return true
}
