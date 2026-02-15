import { useEffect } from "react"
import { activeChatKey, readActiveChat, writeActiveChat } from "../lib/activeChat"
import { fromBase, toBase } from "../lib/route"

export const useRouteSync = () => {
  useEffect(() => {
    const ak = activeChatKey
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
      const raw = readActiveChat(window)

      if (cid) {
        if (raw !== cid) {
          writeActiveChat(window, cid)
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
      const a = e.storageArea ?? null

      if (a && a !== window.sessionStorage) {
        return
      }

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
        const raw = readActiveChat(window)

        if (raw !== cid) {
          writeActiveChat(window, cid)
        }

        return
      }

      writeActiveChat(window, "")
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
