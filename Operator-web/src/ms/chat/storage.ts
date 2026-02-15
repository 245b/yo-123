import { fromBase, toBase } from "../../lib/route"
import { activeChatKey, writeActiveChat } from "../../lib/activeChat"
import type { Att, Ch, Msg, TermEntry } from "./types"

export const activeKey = activeChatKey

export type StoreApi = {
  loadChats: () => Ch[]
  saveChats: (cs: Ch[]) => void
  loadMsgs: (id: string) => Msg[]
  saveMsgs: (id: string, ms: Msg[]) => void
  loadTerms: (id: string) => Record<string, TermEntry[]>
  saveTerms: (id: string, terms: Record<string, TermEntry[]>) => void
  setCur: (id: string) => void
  next: (cs: Ch[]) => string
  touch: (id: string, name?: string) => void
}

export const setupStore = (win: Window): StoreApi => {
  const ck = "ms_chats"
  const pk = "ms_chat_"
  const ap = "ms_chat_att_"
  const tk = "ms_chat_term_"

  const esc = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\t/g, "\\t")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")

  const un = (s: string) => {
    var out = ""

    for (var i = 0; i < s.length; i++) {
      const c = s[i] ?? ""

      if (c !== "\\") {
        out += c
        continue
      }

      const n = s[i + 1] ?? ""

      if (!n) {
        out += c
        continue
      }

      if (n === "n") {
        out += "\n"
        i++
        continue
      }

      if (n === "r") {
        out += "\r"
        i++
        continue
      }

      if (n === "t") {
        out += "\t"
        i++
        continue
      }

      if (n === "\\") {
        out += "\\"
        i++
        continue
      }

      out += c
    }

    return out
  }

  const loadChats = (): Ch[] => {
    const raw0 = win.localStorage.getItem(ck) ?? ""
    const raw = raw0.trim()

    if (!raw) {
      return [] as Ch[]
    }

    const ls = raw
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    const out: Ch[] = []

    for (var i = 0; i < ls.length; i++) {
      const s = ls[i] ?? ""
      const p = s.split("\t")
      const id = (p[0] ?? "").trim()

      if (!id) {
        continue
      }

      const name = un((p[1] ?? "").trim())
      const at0 = Number.parseInt((p[2] ?? "").trim(), 10)
      const at = Number.isFinite(at0) ? at0 : 0

      if (!name) {
        continue
      }

      out.push({ id, name, at })
    }

    out.sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    return out
  }

  const saveChats = (cs: Ch[]) => {
    const raw = cs
      .map((c) => {
        const id = (c.id ?? "").trim()
        const name = (c.name ?? "").replace(/[\t\r\n]+/g, " ").trim()
        const at0 = c.at ?? 0
        const at = Number.isFinite(at0) ? Math.round(at0) : 0

        if (!id || !name) {
          return ""
        }

        return `${id}\t${esc(name)}\t${at}`
      })
      .filter((s) => s.length > 0)
      .join("\n")

    win.localStorage.setItem(ck, raw)
  }

  const loadMsgs = (id: string): Msg[] => {
    const cid = id.trim()

    if (!cid) {
      return [] as Msg[]
    }

    const raw0 = win.localStorage.getItem(`${pk}${cid}`) ?? ""
    const raw = raw0.trim()

    if (!raw) {
      return [] as Msg[]
    }

    const ls = raw
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    const out: Msg[] = []

    for (var i = 0; i < ls.length; i++) {
      const s = ls[i] ?? ""
      const p = s.split("\t")
      const r0 = (p[0] ?? "").trim()
      const ok = r0 === "user" || r0 === "assistant"

      if (!ok) {
        continue
      }

      const txt = un(p.slice(1).join("\t"))

      if (!txt) {
        continue
      }

      out.push({ role: r0 as "user" | "assistant", content: txt })
    }

    const rawA0 = win.localStorage.getItem(`${ap}${cid}`) ?? ""
    const rawA = rawA0.trim()

    if (!rawA) {
      return out
    }

    const ls2 = rawA
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    for (var i = 0; i < ls2.length; i++) {
      const s = ls2[i] ?? ""
      const p = s.split("\t")
      const i0 = Number.parseInt((p[0] ?? "").trim(), 10)
      const idx = Number.isFinite(i0) ? i0 : -1

      if (idx < 0) {
        continue
      }

      const m = out[idx]

      if (!m) {
        continue
      }

      const n0 = un((p[1] ?? "").trim())
      const u0 = un(p.slice(2).join("\t"))
      const url = u0.trim()

      if (!url) {
        continue
      }

      const name = n0 || "image"
      var list = m.atts

      if (!list) {
        list = [] as Att[]
        m.atts = list
      }

      list.push({ name, url })
    }

    return out
  }

  const saveMsgs = (id: string, ms: Msg[]) => {
    const cid = id.trim()

    if (!cid) {
      return
    }

    const raw = ms
      .map((m) => {
        const r = m.role
        const ok = r === "user" || r === "assistant"

        if (!ok) {
          return ""
        }

        const txt = m.content ?? ""

        if (!txt) {
          return ""
        }

        return `${r}\t${esc(txt)}`
      })
      .filter((s) => s.length > 0)
      .join("\n")

    win.localStorage.setItem(`${pk}${cid}`, raw)

    const rawA = ms
      .map((m, i) => {
        const at0 = m.atts ?? []

        if (!at0.length) {
          return ""
        }

        const rows = at0
          .map((a) => {
            const u0 = (a?.url ?? "").trim()

            if (!u0) {
              return ""
            }

            if (u0.startsWith("blob:")) {
              return ""
            }

            const n0 = (a?.name ?? "").replace(/[\t\r\n]+/g, " ").trim()
            const name = n0 || "image"
            return `${i}\t${esc(name)}\t${esc(u0)}`
          })
          .filter((s) => s.length > 0)
          .join("\n")

        return rows
      })
      .filter((s) => s.length > 0)
      .join("\n")

    if (rawA) {
      win.localStorage.setItem(`${ap}${cid}`, rawA)
    }

    if (!rawA) {
      win.localStorage.removeItem(`${ap}${cid}`)
    }
  }

  const loadTerms = (id: string) => {
    const cid = id.trim()

    if (!cid) {
      return {}
    }

    const raw0 = win.localStorage.getItem(`${tk}${cid}`) ?? ""
    const raw = raw0.trim()

    if (!raw) {
      return {}
    }

    const ls = raw
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    const out: Record<string, TermEntry[]> = {}

    for (var i = 0; i < ls.length; i++) {
      const s = ls[i] ?? ""
      const p = s.split("\t")
      const i0 = Number.parseInt((p[0] ?? "").trim(), 10)
      const idx = Number.isFinite(i0) ? i0 : -1

      if (idx < 0) {
        continue
      }

      const id0 = un((p[1] ?? "").trim())
      const tool0 = un((p[2] ?? "").trim())
      const status0 = un((p[3] ?? "").trim())
      const input0 = un((p[4] ?? "").trim())
      const output0 = un(p.slice(5).join("\t"))
      const status = status0 === "running" || status0 === "done" || status0 === "failed" ? status0 : "done"
      const entry: TermEntry = {
        id: id0 || "tool",
        tool: tool0 || "terminal",
        input: input0,
        output: output0,
        status: status as "running" | "done" | "failed",
      }

      var list = out[`${idx}`]

      if (!list) {
        list = []
        out[`${idx}`] = list
      }

      list.push(entry)
    }

    return out
  }

  const saveTerms = (id: string, terms: Record<string, TermEntry[]>) => {
    const cid = id.trim()

    if (!cid) {
      return
    }

    const keys = Object.keys(terms)
    const rows: string[] = []

    for (var i = 0; i < keys.length; i++) {
      const k = keys[i] ?? ""
      const i0 = Number.parseInt(k, 10)
      const idx = Number.isFinite(i0) ? i0 : -1

      if (idx < 0) {
        continue
      }

      const list = Array.isArray(terms[k]) ? terms[k] : []

      for (var j = 0; j < list.length; j++) {
        const it = list[j]

        if (!it) {
          continue
        }

        const id0 = (it.id ?? "").trim()
        const tool0 = (it.tool ?? "").trim()
        const status0 = (it.status ?? "").trim()
        const input0 = it.input ?? ""
        const output0 = it.output ?? ""
        const status = status0 === "running" || status0 === "done" || status0 === "failed" ? status0 : "done"
        rows.push(
          `${idx}\t${esc(id0)}\t${esc(tool0)}\t${esc(status)}\t${esc(input0)}\t${esc(output0)}`,
        )
      }
    }

    const raw = rows.filter((s) => s.length > 0).join("\n")

    if (raw) {
      win.localStorage.setItem(`${tk}${cid}`, raw)
      return
    }

    win.localStorage.removeItem(`${tk}${cid}`)
  }

  const setCur = (id: string) => {
    const cid = id.trim()
    const html = win.document?.documentElement ?? null

    if (cid) {
      writeActiveChat(win, cid)
      html?.setAttribute("data-ms-chat-active", "1")
      const tw = win.parent && win.parent !== win ? win.parent : win
      const base = "/t/"
      const p = fromBase(tw.location?.pathname ?? "")
      const ok = p === "/" || p.startsWith(base)

      if (ok) {
        const next = `${base}${encodeURIComponent(cid)}`

        if (p !== next) {
          tw.history.replaceState(null, "", toBase(next))
        }
      }
      return
    }

    writeActiveChat(win, "")
    html?.removeAttribute("data-ms-chat-active")
    const tw = win.parent && win.parent !== win ? win.parent : win
    const p = fromBase(tw.location?.pathname ?? "")

    if (p !== "/") {
      tw.history.replaceState(null, "", toBase("/"))
    }
  }

  const next = (cs: Ch[]) => {
    const base = "New chat"
    const used = cs.map((c) => c.name)

    if (!used.includes(base)) {
      return base
    }

    for (var i = 1; ; i++) {
      const nm = `${base} (${i})`

      if (!used.includes(nm)) {
        return nm
      }
    }
  }

  const touch = (id: string, name?: string) => {
    const cid = id.trim()

    if (!cid) {
      return
    }

    const cs = loadChats()
    const nm0 = (name ?? "").replace(/[\t\r\n]+/g, " ").trim()
    const at = Date.now()

    for (var i = 0; i < cs.length; i++) {
      const c = cs[i]

      if (c.id !== cid) {
        continue
      }

      const nm = nm0 || c.name
      cs.splice(i, 1)
      cs.unshift({ id: cid, name: nm, at })
      saveChats(cs)
      return
    }

    const nm = nm0 || next(cs)
    cs.unshift({ id: cid, name: nm, at })
    saveChats(cs)
  }

  return { loadChats, saveChats, loadMsgs, saveMsgs, loadTerms, saveTerms, setCur, next, touch }
}

