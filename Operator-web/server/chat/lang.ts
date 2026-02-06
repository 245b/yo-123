import type { Msg } from "../types"

export const pickLang = (s: string) => {
  const t0 = typeof s === "string" ? s : ""
  const t = t0.trim()
  var ar = 0
  var zh = 0
  var en = 0

  if (t) {
    for (var i = 0; i < t.length; i++) {
      const n = t.charCodeAt(i)

      if (
        (n >= 0x0600 && n <= 0x06ff) ||
        (n >= 0x0750 && n <= 0x077f) ||
        (n >= 0x08a0 && n <= 0x08ff) ||
        (n >= 0xfb50 && n <= 0xfdff) ||
        (n >= 0xfe70 && n <= 0xfeff)
      ) {
        ar++
        continue
      }

      if (
        (n >= 0x3400 && n <= 0x4dbf) ||
        (n >= 0x4e00 && n <= 0x9fff) ||
        (n >= 0xf900 && n <= 0xfaff) ||
        (n >= 0x3040 && n <= 0x30ff) ||
        (n >= 0x31f0 && n <= 0x31ff)
      ) {
        zh++
        continue
      }

      if ((n >= 0x41 && n <= 0x5a) || (n >= 0x61 && n <= 0x7a)) {
        en++
        continue
      }
    }
  }

  var lang = "English"

  if (ar > 0 && ar >= zh && ar >= en) {
    lang = "Arabic"
  }

  if (zh > 0 && zh > ar && zh >= en) {
    lang = "Chinese"
  }

  return lang
}

export const lastUserText = (msgs: Msg[]) => {
  var last = ""

  for (var i = msgs.length - 1; i >= 0; i--) {
    const it = msgs[i]
    const r0 = it?.role ?? ""

    if (r0 !== "user") {
      continue
    }

    const c0 = it?.content ?? ""
    const c1 = typeof c0 === "string" ? c0 : ""
    const c = c1.trim()

    if (!c) {
      continue
    }

    last = c
    break
  }

  return last
}

export const translate = async (text: string, target: string) => {
  const t0 = typeof text === "string" ? text : ""
  const t = t0.trim()

  if (!t) {
    return ""
  }

  var tl = ""

  if (target === "Arabic") {
    tl = "ar"
  }

  if (target === "Chinese") {
    tl = "zh-CN"
  }

  if (target === "English") {
    tl = "en"
  }

  if (!tl) {
    return ""
  }

  const qp = encodeURIComponent(t)
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(tl)}&dt=t&q=${qp}`
  const sig = AbortSignal.timeout(8000)
  const r = await fetch(url, { signal: sig }).catch(() => null)

  if (!r) {
    return ""
  }

  const out = (await r.json().catch(() => null)) as unknown

  if (!out) {
    return ""
  }

  const a0 = Array.isArray(out) ? out : []
  const a1 = Array.isArray(a0[0]) ? a0[0] : []
  var txt = ""

  for (var i = 0; i < a1.length; i++) {
    const seg = a1[i]
    const row = Array.isArray(seg) ? seg : []
    const s0 = typeof row[0] === "string" ? row[0] : ""

    if (!s0) {
      continue
    }

    txt += s0
  }

  return txt.trim()
}

export const translateMessages = async (msgs: Msg[], target: string) => {
  if (target === "English") {
    return msgs
  }

  const out: Msg[] = []

  for (var i = 0; i < msgs.length; i++) {
    const it = msgs[i]
    const r0 = it?.role ?? ""
    const r = r0 === "system" || r0 === "user" || r0 === "assistant" ? r0 : ""

    if (!r) {
      continue
    }

    const c0 = it?.content ?? ""
    const c1 = typeof c0 === "string" ? c0 : ""
    var c = c1.trim()

    if (!c) {
      continue
    }

    if (r !== "system") {
      const t0 = await translate(c, "English")

      if (t0) {
        c = t0
      }
    }

    out.push({ role: r as "system" | "user" | "assistant", content: c })
  }

  return out
}
