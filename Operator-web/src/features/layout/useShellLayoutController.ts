import { useEffect, useRef, useState, type RefObject } from "react"
import { subscribeRightPanelOpenRequest } from "../../platform/events/rightPanelOpen"
import { clampRightWidth, loadOpen, loadRightOpen, loadRightWidth, saveOpen, saveRightOpen, saveRightWidth } from "../../platform/layout/panelStore"

type StopWin = Window & {
  __ms_ds_busy?: boolean
  __ms_ds_abort?: AbortController | null
  __ms_ds_run?: unknown
  __ms_ds_stop?: ((why?: string) => void) | null
}

type LayoutInput = {
  artifactSignal: number
  mainFrameRef: RefObject<HTMLIFrameElement | null>
}

export const useShellLayoutController = (input: LayoutInput) => {
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

  const s5 = useState<boolean>(loadRightOpen)
  const rightOpen = s5[0]
  const setRightOpen = s5[1]

  const s6 = useState<number>(() => {
    const saved = loadRightWidth()

    if (saved > 0) {
      return clampRightWidth(saved)
    }

    const ok = typeof window !== "undefined"
    const ww = ok ? window.innerWidth : 1200
    const n = Math.round(ww * 0.432)
    return clampRightWidth(n)
  })
  const rightW = s6[0]
  const setRightW = s6[1]

  const s7 = useState<number>(() => {
    const ok = typeof window !== "undefined"

    if (!ok) {
      return 1280
    }

    return window.innerWidth
  })
  const vw = s7[0]
  const setVw = s7[1]

  const seen = useRef<number>(0)

  useEffect(() => {
    setLive(true)
  }, [open])

  useEffect(() => saveOpen(open), [open])
  useEffect(() => saveRightOpen(rightOpen), [rightOpen])
  useEffect(() => saveRightWidth(rightW), [rightW])

  useEffect(() => {
    const fn = () => {
      setVw(window.innerWidth)
      setRightW((cur) => clampRightWidth(cur))
    }

    window.addEventListener("resize", fn)
    return () => window.removeEventListener("resize", fn)
  }, [])

  useEffect(() => {
    const n = input.artifactSignal

    if (n <= seen.current) {
      return
    }

    seen.current = n
    setRightOpen(true)
  }, [input.artifactSignal])

  useEffect(() => {
    return subscribeRightPanelOpenRequest(() => {
      setRightOpen(true)
    })
  }, [])

  useEffect(() => {
    const fn = (ev: Event) => {
      const k0 = (ev as KeyboardEvent).key ?? ""
      const k1 = k0 || ((ev as KeyboardEvent).code ?? "")
      const k = k1.toLowerCase()

      if (k !== "escape" && k !== "esc") {
        return
      }

      const el = input.mainFrameRef.current
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
  }, [input.mainFrameRef])

  const onRightResize = (next: number) => {
    const w = clampRightWidth(next)

    setRightW((cur) => {
      if (cur === w) {
        return cur
      }

      return w
    })
  }

  return {
    open,
    setOpen,
    x,
    setX,
    w,
    setW,
    live,
    rightOpen,
    setRightOpen,
    rightW,
    vw,
    onRightResize,
  }
}
