import { useEffect, useMemo, useRef, useState } from "react"
import * as ms from "../ms"
import { useShellLayoutController } from "../features/layout/useShellLayoutController"
import { createBoot } from "./boot"
import { useRouteSync } from "./useRouteSync"
import Frames from "./ui/Frames"
import Attachments from "./ui/Attachments"
import RightPanel from "./ui/RightPanel"
import { useCreatedArtifacts } from "./ui/useCreatedArtifacts"
import { openBrowserPreview } from "./bridge/browser"
import { uiTokens } from "../../../packages/ui/src"

const App = () => {
  const dur = 200
  const pad = 12
  const collapsed = 52

  const created = useCreatedArtifacts()
  const ia = useRef<HTMLIFrameElement | null>(null)
  const ib = useRef<HTMLIFrameElement | null>(null)
  const ca = useRef<(() => void) | null>(null)
  const cb = useRef<(() => void) | null>(null)
  const shift = useRef<number>(0)
  const sd = useRef<Document | null>(null)
  const vr = useRef<string>("")
  const layout = useShellLayoutController({
    artifactSignal: created.hasNewArtifact,
    mainFrameRef: ia,
  })
  const open = layout.open
  const setOpen = layout.setOpen
  const x = layout.x
  const setX = layout.setX
  const w = layout.w
  const setW = layout.setW
  const live = layout.live
  const rightOpen = layout.rightOpen
  const setRightOpen = layout.setRightOpen
  const rightW = layout.rightW
  const vw = layout.vw
  const s1 = useState<"code" | "preview">("code")
  const rightView = s1[0]
  const setRightView = s1[1]
  const s2 = useState<string>("")
  const previewUrl = s2[0]
  const setPreviewUrl = s2[1]

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

  useEffect(() => {
    const signal = created.previewSignal
    const url = created.previewUrl.trim()

    if (!signal || !url) {
      return
    }

    setPreviewUrl(url)
    setRightOpen(true)
    setRightView("preview")
    void openBrowserPreview(url)
  }, [created.previewSignal, created.previewUrl, setRightOpen])

  const previewVncSrc = useMemo(() => {
    const q = new URLSearchParams()
    q.set("autoconnect", "1")
    q.set("resize", "remote")
    q.set("reconnect", "1")
    const latest = previewUrl.trim()

    if (latest) {
      q.set("ms_preview_url", latest)
    }

    const win = typeof window === "undefined" ? null : window
    const qs = win ? new URLSearchParams(win.location.search) : null
    const over0 = (qs?.get("vncBase") ?? "").trim()
    const over = over0.replace(/\/+$/, "")

    if (over) {
      return `${over}/vnc.html?${q.toString()}`
    }

    const host = (win?.location?.hostname ?? "").trim().toLowerCase()

    if (host === "localhost" || host === "127.0.0.1") {
      return `http://localhost:6080/vnc.html?${q.toString()}`
    }

    return `https://startnew-workspace-exykvj.fly.dev:8443/vnc.html?${q.toString()}`
  }, [previewUrl])

  const sideW = open ? w : collapsed
  const maxRight = Math.max(320, Math.floor(vw * 0.94))
  const rightPx0 = Math.min(rightW, maxRight)
  const rightPx = rightOpen ? rightPx0 : 0
  const chatW = rightOpen ? `calc(100% - ${rightPx}px)` : "100%"
  const fillW = `${rightPx}px`
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
        <div
          data-ms-right-fill={rightOpen ? "1" : "0"}
          className="pointer-events-none absolute inset-y-0 right-0 z-40"
          style={{
            width: fillW,
            background: uiTokens.panelBackground,
            borderLeft: `1px solid ${uiTokens.borderColor}`,
            transitionProperty: "width",
            transitionDuration: `${dur}ms`,
            transitionTimingFunction: "ease-in-out",
          }}
        />
        <div
          data-ms-chat-shell="1"
          className="relative h-full"
          style={{
            width: chatW,
            transitionProperty: "width",
            transitionDuration: `${dur}ms`,
            transitionTimingFunction: "ease-in-out",
          }}
        >
          <Frames open={open} w={sideW} x={x} dur={dur} live={live} ia={ia} ib={ib} boot={boot} />
        </div>
        <RightPanel
          open={rightOpen}
          w={rightW}
          dur={dur}
          tree={created.tree}
          artifacts={created.artifacts}
          selectedPath={created.selectedPath}
          selectedContent={created.selectedContent}
          view={rightView}
          previewVncSrc={previewVncSrc}
          onSelectPath={created.setSelectedPath}
          onSetView={setRightView}
          onResize={layout.onRightResize}
          onSetOpen={setRightOpen}
        />
      </div>
      <Attachments ia={ia} />
    </div>
  )
}

export default App
