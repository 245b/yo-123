import { useEffect, useRef, useState } from "react"
import { loadDraftFiles, saveDraftFiles, type DraftFile } from "../../lib/store"
import { useAttachmentView } from "./useAttachmentView"

type Set<T> = (v: T | ((p: T) => T)) => void

type At = DraftFile
type W = Window & typeof globalThis
type Aw = Window & { __ms_att_get?: (() => At[]) | null; __ms_att_clear?: (() => void) | null }

type AttachDeps = {
  ia: { current: HTMLIFrameElement | null }
}

const filePng = new URL("../../../../file.png", import.meta.url).href

export const useAttachments = (d: AttachDeps) => {
  const s0 = useState<At[]>([])
  const at = s0[0]
  const setAt = s0[1] as Set<At[]>

  const s1 = useState<boolean>(false)
  const dr = s1[0]
  const setDr = s1[1]

  const ar = useRef<At[]>([])
  const ur = useRef<Record<string, string>>({})
  const lr = useRef<boolean>(false)
  const wr = useRef<W | null>(null)
  const dc = useRef<number>(0)
  const dh = useRef<number>(0)
  const dd = useRef<Document | null>(null)
  const dw = useRef<W | null>(null)
  const dx = useRef<(() => void) | null>(null)

  ar.current = at

  const push = (fs: File[]) => {
    if (!fs.length) {
      return
    }

    const out = fs.map((f, i) => {
      const id0 = window.crypto?.randomUUID?.() ?? ""
      const id = id0 || `${Date.now()}_${i}`
      return { id, name: f.name ?? "", type: f.type ?? "", file: f }
    })

    setAt((xs) => [...xs, ...out])
  }

  useEffect(() => {
    var on = true

    loadDraftFiles().then((fs) => {
      if (!on) {
        return
      }

      if (!fs) {
        return
      }

      lr.current = true

      if (!fs.length) {
        return
      }

      setAt(fs)
    })

    return () => {
      on = false
    }
  }, [])

  useEffect(() => {
    if (!lr.current) {
      return
    }

    void saveDraftFiles(at)
  }, [at])

  useEffect(() => {
    const w = window as Aw
    const get = () => ar.current
    const clear = () => setAt([])

    w.__ms_att_get = get
    w.__ms_att_clear = clear

    var fw: Aw | null = null
    var rid = 0
    var n = 0

    const bind = () => {
      const w0 = d.ia.current?.contentWindow ?? null
      const w1 = w0 as Aw | null

      if (!w1) {
        return false
      }

      if (fw === w1) {
        return true
      }

      fw = w1
      fw.__ms_att_get = get
      fw.__ms_att_clear = clear
      return true
    }

    const step = () => {
      rid = 0
      n++

      const ok = bind()

      if (ok) {
        return
      }

      if (n > 900) {
        return
      }

      rid = window.requestAnimationFrame(step)
    }

    step()

    return () => {
      if (w.__ms_att_get === get) {
        w.__ms_att_get = null
      }

      if (w.__ms_att_clear === clear) {
        w.__ms_att_clear = null
      }

      if (fw?.__ms_att_get === get) {
        fw.__ms_att_get = null
      }

      if (fw?.__ms_att_clear === clear) {
        fw.__ms_att_clear = null
      }

      if (!rid) {
        return
      }

      window.cancelAnimationFrame(rid)
    }
  }, [d.ia])

  useEffect(() => {
    const doc = d.ia.current?.contentDocument ?? null

    if (!doc) {
      return
    }

    doc.dispatchEvent(new Event("ms-att", { bubbles: true }))

    const sr = doc.querySelector("browser-mcp-container")?.shadowRoot ?? null

    if (!sr) {
      return
    }

    sr.dispatchEvent(new Event("ms-att", { bubbles: true }))
  }, [at, d.ia])

  useEffect(() => {
    return () => {
      const w = wr.current
      const m = ur.current
      wr.current = null
      ur.current = {}

      if (!w) {
        return
      }

      const ks = Object.keys(m)

      for (var i = 0; i < ks.length; i++) {
        const k = ks[i] ?? ""
        const u = m[k] ?? ""

        if (!u) {
          continue
        }

        w.URL.revokeObjectURL(u)
      }
    }
  }, [])

  useEffect(() => {
    const ok = (e: DragEvent) => {
      const dt = e.dataTransfer

      if (!dt) {
        return false
      }

      const items0 = dt.items
      const items = items0 ? Array.from(items0) : []
      const hit = items.some((it) => it.kind === "file")

      if (hit) {
        return true
      }

      const fs0 = dt.files
      const fs = fs0 ? Array.from(fs0) : []

      if (fs.length) {
        return true
      }

      const ts0 = dt.types
      const ts = ts0 ? Array.from(ts0) : []
      const ok0 = ts.includes("Files")

      if (ok0) {
        return true
      }

      return ts.includes("application/x-moz-file")
    }

    const clear = () => {
      const t = dh.current

      if (!t) {
        return
      }

      dh.current = 0
      window.clearTimeout(t)
    }

    const enter = (ev: Event) => {
      const e = ev as DragEvent

      if (!ok(e)) {
        return
      }

      clear()
      dc.current += 1
      setDr(true)
    }

    const over = (ev: Event) => {
      const e = ev as DragEvent

      if (!ok(e)) {
        return
      }

      clear()
      ev.preventDefault()

      const dt = e.dataTransfer

      if (dt) {
        dt.dropEffect = "copy"
      }

      setDr(true)
    }

    const leave = () => {
      if (!dc.current) {
        return
      }

      dc.current -= 1

      if (dc.current) {
        return
      }

      clear()
      dh.current = window.setTimeout(() => {
        dh.current = 0
        setDr(false)
      }, 60)
    }

    const drop = (ev: Event) => {
      const e = ev as DragEvent

      if (!ok(e)) {
        return
      }

      ev.preventDefault()
      ev.stopPropagation()

      clear()
      dc.current = 0
      setDr(false)

      const fs0 = e.dataTransfer?.files
      const fs = fs0 && fs0.length ? Array.from(fs0) : []

      if (!fs.length) {
        return
      }

      push(fs)
    }

    const add = (t: EventTarget | null) => {
      if (!t) {
        return () => {}
      }

      t.addEventListener("dragenter", enter, true)
      t.addEventListener("dragover", over, true)
      t.addEventListener("dragleave", leave, true)
      t.addEventListener("drop", drop, true)
      return () => {
        t.removeEventListener("dragenter", enter, true)
        t.removeEventListener("dragover", over, true)
        t.removeEventListener("dragleave", leave, true)
        t.removeEventListener("drop", drop, true)
      }
    }

    const base = [add(window), add(document)]

    var rid = 0
    var n = 0

    const bind = () => {
      const fr0 = d.ia.current ?? window.document.querySelector('iframe[data-kind="snapshot"]') ?? null
      const fr = fr0 instanceof HTMLIFrameElement ? fr0 : null
      const doc = fr?.contentDocument ?? null
      const win0 = doc?.defaultView ?? null
      const win = win0 as W | null

      if (!doc) {
        return false
      }

      if (dd.current === doc && dw.current === win) {
        return true
      }

      dx.current?.()
      dx.current = null
      dd.current = doc
      dw.current = win

      const offs: Array<() => void> = [add(doc), add(win)]
      dx.current = () => offs.forEach((fn) => fn())
      return true
    }

    const step = () => {
      rid = 0
      n++

      const ok = bind()

      if (ok) {
        return
      }

      if (n > 900) {
        return
      }

      rid = window.requestAnimationFrame(step)
    }

    step()

    return () => {
      base.forEach((fn) => fn())
      dx.current?.()
      dx.current = null
      dd.current = null
      dw.current = null

      if (!rid) {
        return
      }

      window.cancelAnimationFrame(rid)
    }
  }, [d.ia])

  useEffect(() => {
    const set = () => {
      const fr0 = d.ia.current ?? window.document.querySelector('iframe[data-kind="snapshot"]') ?? null
      const fr = fr0 instanceof HTMLIFrameElement ? fr0 : null
      const doc = fr?.contentDocument ?? null

      if (!doc) {
        return false
      }

      const sr = doc.querySelector("browser-mcp-container")?.shadowRoot ?? null
      const root = sr ?? doc
      const id = "__ms_drop"
      const cur = root.querySelector(`#${id}`) ?? null
      const el = cur && cur.nodeType === 1 ? (cur as HTMLDivElement) : null

      if (!dr) {
        el?.remove()
        return true
      }

      const host = el ?? doc.createElement("div")
      host.id = id
      host.setAttribute("aria-hidden", "true")
      host.style.position = "fixed"
      host.style.inset = "0"
      host.style.zIndex = "2147483646"
      host.style.display = "flex"
      host.style.alignItems = "center"
      host.style.justifyContent = "center"
      host.style.background = "rgba(0,0,0,0.3)"
      host.style.backdropFilter = "blur(6px)"
      ;(host.style as { webkitBackdropFilter?: string }).webkitBackdropFilter = "blur(6px)"
      host.style.pointerEvents = "none"
      host.textContent = ""

      const img = doc.createElement("img")
      img.src = filePng
      img.alt = "file"
      img.draggable = false
      img.style.width = "144px"
      img.style.height = "144px"
      img.style.objectFit = "contain"
      img.style.filter = "drop-shadow(0 20px 50px rgba(0,0,0,0.4))"
      host.appendChild(img)

      if (!el) {
        const mount = sr ?? doc.body

        if (!mount) {
          return true
        }

        mount.appendChild(host)
      }

      return true
    }

    const ok = set()

    if (ok) {
      return
    }

    var rid = 0
    var n = 0

    const step = () => {
      rid = 0
      n++

      const ok = set()

      if (ok) {
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
  }, [dr, d.ia])

  useAttachmentView({
    ia: d.ia,
    at,
    setAt,
    ur,
    wr,
  })
  return { push }
}
