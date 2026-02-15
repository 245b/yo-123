import { apiUrl } from "../../lib/api"
import type { Msg } from "./types"

type TitleStep = "user" | "assistant"

type TitleDeps = {
  win: Window
  touch: (id: string, name?: string) => void
  chatsKey: string
  chatPrefix: string
  titleKey: string
  titleNameKey: string
}

export const createTitleUpdater = (deps: TitleDeps) => {
  const win = deps.win
  const touch = deps.touch
  const ck = deps.chatsKey
  const pk = deps.chatPrefix
  const tk = deps.titleKey
  const nk = deps.titleNameKey

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

  const meta = (id: string) => {
    const raw0 = win.localStorage.getItem(`${tk}${id}`) ?? ""
    const raw = raw0.trim()

    if (!raw) {
      return { g: 0, l: false, p: false }
    }

    const parts = raw.split("|")
    const g0 = Number.parseInt((parts[0] ?? "").trim(), 10)
    const g = Number.isFinite(g0) ? g0 : 0
    const l = (parts[1] ?? "").trim() === "1"
    const p = (parts[2] ?? "").trim() === "1"
    return { g, l, p }
  }

  const saveMeta = (id: string, g: number, l: boolean, p: boolean) => {
    const g0 = Number.isFinite(g) ? Math.max(0, Math.floor(g)) : 0
    const v = `${g0}|${l ? 1 : 0}|${p ? 1 : 0}`
    win.localStorage.setItem(`${tk}${id}`, v)
  }

  const auto = (id: string) => (win.localStorage.getItem(`${nk}${id}`) ?? "").trim()

  const name = (id: string) => {
    const raw0 = win.localStorage.getItem(ck) ?? ""
    const raw = raw0.trim()

    if (!raw) {
      return ""
    }

    const ls = raw
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    for (var i = 0; i < ls.length; i++) {
      const s = ls[i] ?? ""
      const p = s.split("\t")
      const cid = (p[0] ?? "").trim()

      if (cid !== id) {
        continue
      }

      const nm = un((p[1] ?? "").trim())
      return nm
    }

    return ""
  }

  const def = (v: string) => {
    const t = v.trim()

    if (!t) {
      return true
    }

    return /^New chat( \(\d+\))?$/i.test(t)
  }

  const pick = (ms: Msg[]) => {
    var u = ""
    var a = ""

    for (var i = 0; i < ms.length; i++) {
      const m = ms[i]
      const r = m?.role ?? ""

      if (r === "user" && !u) {
        const c0 = typeof m?.content === "string" ? m.content : ""
        u = c0.trim()
      }

      if (r === "assistant" && !a) {
        const c0 = typeof m?.content === "string" ? m.content : ""
        a = c0.trim()
      }

      if (u && a) {
        break
      }
    }

    return { u, a }
  }

  const title = (id: string, ms: Msg[], step: TitleStep) => {
    return
    const cid = id.trim()

    if (!cid) {
      return
    }

    const m0 = meta(cid)

    if (m0.l || m0.p) {
      return
    }

    if (step === "user" && m0.g > 0) {
      return
    }

    if (step === "assistant" && m0.g > 1) {
      return
    }

    const cur = name(cid).trim()
    const a0 = auto(cid)
    const d0 = def(cur)
    const raw0 = win.localStorage.getItem(`${pk}${cid}`) ?? ""
    const raw = raw0.trim()

    if (!cur || !raw) {
      return
    }

    if (!d0) {
      if (a0 && cur !== a0) {
        saveMeta(cid, m0.g, true, false)
        return
      }

      if (!a0) {
        saveMeta(cid, m0.g, true, false)
        return
      }
    }

    const pick0 = pick(ms)
    const u0 = pick0.u
    const a1 = pick0.a

    if (!u0) {
      return
    }

    const list: { role: "user" | "assistant"; content: string }[] = []
    const u1 = u0.slice(0, 1200).trim()

    if (!u1) {
      return
    }

    list.push({ role: "user", content: u1 })

    if (step === "assistant") {
      const a2 = a1.slice(0, 1200).trim()

      if (a2) {
        list.push({ role: "assistant", content: a2 })
      }
    }

    if (!list.length) {
      return
    }

    saveMeta(cid, m0.g, m0.l, true)

    win
      .fetch(apiUrl("/api/title"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId: cid, messages: list }),
      })
      .then((r) =>
        r
          .json()
          .then((j) => ({ ok: r.ok, j }))
          .catch(() => ({ ok: false, j: null })),
      )
      .then((x) => {
        const m1 = meta(cid)

        if (!x.ok) {
          saveMeta(cid, m1.g, m1.l, false)
          return
        }

        const o = (x.j && typeof x.j === "object" ? x.j : null) as { title?: unknown } | null
        const t0 = typeof o?.title === "string" ? o.title : ""
        const t = t0.trim()

        if (!t) {
          saveMeta(cid, m1.g, m1.l, false)
          return
        }

        const cur0 = name(cid).trim()
        const a2 = auto(cid)
        const d1 = def(cur0)
        const raw0 = win.localStorage.getItem(`${pk}${cid}`) ?? ""
        const raw = raw0.trim()

        if (!cur0 || !raw) {
          saveMeta(cid, m1.g, true, false)
          return
        }

        if (!d1) {
          if (a2 && cur0 !== a2) {
            saveMeta(cid, m1.g, true, false)
            return
          }

          if (!a2) {
            saveMeta(cid, m1.g, true, false)
            return
          }
        }

        touch(cid, t)
        win.localStorage.setItem(`${nk}${cid}`, t)
        const g1 = m1.g + 1
        const lock = step === "assistant" || g1 >= 2
        saveMeta(cid, g1, lock, false)
      })
      .catch(() => {
        const m1 = meta(cid)
        saveMeta(cid, m1.g, m1.l, false)
      })
  }

  return title
}
