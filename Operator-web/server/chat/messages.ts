import type { Msg } from "../types"
export const parseMessages = (v: unknown) => {
  if (!Array.isArray(v)) {
    return [] as Msg[]
  }

  const out: Msg[] = []

  for (var i = 0; i < v.length; i++) {
    const it = v[i]
    const m = (it && typeof it === "object" ? it : null) as { role?: unknown; content?: unknown } | null

    if (!m) {
      continue
    }

    const r0 = typeof m.role === "string" ? m.role : ""
    const r = r0.trim()
    const ok = r === "system" || r === "user" || r === "assistant"

    if (!ok) {
      continue
    }

    const c0 = typeof m.content === "string" ? m.content : ""
    const c1 = c0.slice(0, 8000)
    const c = c1.trim()

    if (!c) {
      continue
    }

    out.push({ role: r as "system" | "user" | "assistant", content: c })

    if (out.length >= 40) {
      break
    }
  }

  return out
}
