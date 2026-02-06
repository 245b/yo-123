export type ChatItem = { id: string; name: string; at: number }

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

export const loadChats = (win: Window, key: string) => {
  const raw0 = win.localStorage.getItem(key) ?? ""
  const raw = raw0.trim()

  if (!raw) {
    return [] as ChatItem[]
  }

  const ls = raw
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const out: ChatItem[] = []

  for (var i = 0; i < ls.length; i++) {
    const s = ls[i] ?? ""
    const p = s.split("\t")
    const cid = (p[0] ?? "").trim()

    if (!cid) {
      continue
    }

    const name = un((p[1] ?? "").trim())
    const at0 = Number.parseInt((p[2] ?? "").trim(), 10)
    const at = Number.isFinite(at0) ? at0 : 0

    if (!name) {
      continue
    }

    out.push({ id: cid, name, at })
  }

  out.sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
  return out
}

export const saveChats = (win: Window, key: string, cs: ChatItem[]) => {
  const raw = cs
    .map((c) => {
      const id = (c.id ?? "").trim()
      const name0 = (c.name ?? "").replace(/[\t\r\n]+/g, " ").trim()
      const name = esc(name0)
      const at0 = c.at ?? 0
      const at = Number.isFinite(at0) ? Math.round(at0) : 0

      if (!id || !name0) {
        return ""
      }

      return `${id}\t${name}\t${at}`
    })
    .filter((s) => s.length > 0)
    .join("\n")

  win.localStorage.setItem(key, raw)
}
