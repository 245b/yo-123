import { useEffect, useRef, useState } from "react"
import * as ms from "../ms"
import { loadOpen, saveOpen } from "./lib/store"
import { createBoot } from "./boot"
import { useRouteSync } from "./useRouteSync"
import Frames from "./ui/Frames"
import Attachments from "./ui/Attachments"

type StopWin = Window & {
  __ms_ds_busy?: boolean
  __ms_ds_abort?: AbortController | null
  __ms_ds_run?: unknown
  __ms_ds_stop?: ((why?: string) => void) | null
}

const App = () => {
  const dur = 200
  const pad = 12
  const collapsed = 52

  const s1 = useState<boolean>(loadOpen)
  const open = s1[0]
  const setOpen = s1[1]

  const s2 = useState<number>(0)
  const x = s2[0]
  const setX = s2[1]

  const s3 = useState<number>(300)
  const w = s3[0]
  const setW = s3[1]

  const s4 = useState<boolean>(true)
  const live = s4[0]
  const setLive = s4[1]

  const ia = useRef<HTMLIFrameElement | null>(null)
  const ib = useRef<HTMLIFrameElement | null>(null)
  const ca = useRef<(() => void) | null>(null)
  const cb = useRef<(() => void) | null>(null)
  const shift = useRef<number>(0)
  const sd = useRef<Document | null>(null)
  const vr = useRef<string>("")

  if (!vr.current) {
    const id0 = window.crypto?.randomUUID?.() ?? ""
    vr.current = id0 || `${Date.now()}`
  }

  useRouteSync()

  useEffect(() => {
    return () => {
      const a = ca.current
      ca.current = null
      a?.()

      const b = cb.current
      cb.current = null
      b?.()
    }
  }, [])

  useEffect(() => {
    setLive(true)
  }, [open])

  useEffect(() => {
    const doc = ib.current?.contentDocument ?? null

    if (!doc) {
      return
    }

    if (open) {
      doc.documentElement.removeAttribute("data-ms-collapsed")
      return
    }

    doc.documentElement.setAttribute("data-ms-collapsed", "1")
  }, [open])

  useEffect(() => saveOpen(open), [open])

  useEffect(() => {
    const fn = (ev: Event) => {
      const k0 = (ev as KeyboardEvent).key ?? ""
      const k1 = k0 || ((ev as KeyboardEvent).code ?? "")
      const k = k1.toLowerCase()

      if (k !== "escape" && k !== "esc") {
        return
      }

      const el = ia.current
      const w0 = el?.contentWindow ?? null
      const w = w0 as StopWin | null

      if (!w) {
        return
      }

      const stop = w.__ms_ds_stop

      if (typeof stop !== "function") {
        return
      }

      const busy = w.__ms_ds_busy === true
      const ac = w.__ms_ds_abort ?? null
      const run = w.__ms_ds_run ?? null
      const ok = busy || ac || run

      if (!ok) {
        return
      }

      stop("Stopped")
      ev.preventDefault()
      ev.stopPropagation()
    }

    window.addEventListener("keydown", fn, true)
    return () => window.removeEventListener("keydown", fn, true)
  }, [])

  useEffect(() => {
    const el = ia.current
    const doc = el?.contentDocument
    const win = el?.contentWindow

    if (!el || !doc || !win) {
      return
    }

    const sideW = open ? w : collapsed
    const cfg = { open, w: sideW, dur, pad, shift }
    win.requestAnimationFrame(() => ms.mid(doc, win, cfg))
  }, [open, w])

  const sideW = open ? w : collapsed
  const boot = createBoot({
    pad,
    dur,
    open,
    w: sideW,
    shift,
    setOpen,
    setX,
    setW,
    ia,
    ca,
    cb,
    sd,
    vr,
  })

  useEffect(() => {
    var rid = 0
    var n = 0

    const step = () => {
      rid = 0
      n++

      const a = boot(ia.current)
      const b = boot(ib.current)

      if (a && b) {
        return
      }

      if (n > 900) {
        return
      }

      rid = window.requestAnimationFrame(step)
    }

    step()

    return () => {
      if (!rid) {
        return
      }

      window.cancelAnimationFrame(rid)
    }
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-50">
      <div className="relative h-full w-full overflow-hidden bg-zinc-950">
        <Frames open={open} w={sideW} x={x} dur={dur} live={live} ia={ia} ib={ib} boot={boot} />
      </div>
      <Attachments ia={ia} />
    </div>
  )
}

export default App
