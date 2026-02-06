import { useEffect } from "react"
import { fromBase, toBase } from "../lib/route"

export const useRouteSync = () => {
  useEffect(() => {
    const ak = "ms_chat_active"
    const base = "/t/"

    const id = () => {
      const p = fromBase(window.location.pathname)

      if (!p.startsWith(base)) {
        return ""
      }

      const rest = p.slice(base.length)
      const idx = rest.indexOf("/")
      const raw = idx >= 0 ? rest.slice(0, idx) : rest
      return raw.trim()
    }

    const to = (id0: string) => {
      const cid = id0.trim()
      return cid ? `${base}${encodeURIComponent(cid)}` : "/"
    }

    const ok = () => {
      const p = fromBase(window.location.pathname)
      return p === "/" || p.startsWith(base)
    }

    const set = (id0: string) => {
      const cur = ok()

      if (!cur) {
        return
      }

      const cid = id0.trim()
      const next = to(cid)
      const p = fromBase(window.location.pathname)

      if (p === next) {
        return
      }

      window.history.replaceState(null, "", toBase(next))
    }

    const init = () => {
      const cur = ok()

      if (!cur) {
        return
      }

      const cid = id()
      const raw0 = window.localStorage.getItem(ak) ?? ""
      const raw = raw0.trim()

      if (cid) {
        if (raw !== cid) {
          window.localStorage.setItem(ak, cid)
        }

        return
      }

      if (!raw) {
        return
      }

      set(raw)
    }

    const st = (ev: Event) => {
      const e = ev as StorageEvent
      const k = e.key ?? ""

      if (k !== ak) {
        return
      }

      const cid = (e.newValue ?? "").trim()
      set(cid)
    }

    const ps = () => {
      const cur = ok()

      if (!cur) {
        return
      }

      const cid = id()

      if (cid) {
        const raw0 = window.localStorage.getItem(ak) ?? ""
        const raw = raw0.trim()

        if (raw !== cid) {
          window.localStorage.setItem(ak, cid)
        }

        return
      }

      window.localStorage.removeItem(ak)
    }

    init()
    window.addEventListener("storage", st)
    window.addEventListener("popstate", ps)
    return () => {
      window.removeEventListener("storage", st)
      window.removeEventListener("popstate", ps)
    }
  }, [])
}
