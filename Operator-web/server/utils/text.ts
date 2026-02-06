export const clip = (v: string, n: number) => {
  const t0 = typeof v === "string" ? v : ""

  if (t0.length <= n) {
    return t0
  }

  return t0.slice(0, n)
}

export const clean = (v: string) => {
  const t0 = typeof v === "string" ? v : ""
  return t0.replace(/\s+/g, " ").trim()
}

export const tail = (v: string, n: number) => {
  const t0 = typeof v === "string" ? v : ""

  if (t0.length <= n) {
    return t0
  }

  return t0.slice(t0.length - n)
}

export const tailLines = (v: string, n: number) => {
  const t0 = typeof v === "string" ? v : ""
  const t1 = t0.replace(/\r/g, "")

  if (!t1) {
    return ""
  }

  const ls = t1.split("\n")

  if (ls.length <= n) {
    return t1
  }

  return ls.slice(ls.length - n).join("\n")
}

export const unq = (v: string) => {
  const t0 = typeof v === "string" ? v : ""
  const t = t0.trim()

  if (t.length < 2) {
    return t
  }

  const q0 = t[0] ?? ""
  const q1 = t[t.length - 1] ?? ""

  if ((q0 === "\"" || q0 === "'") && q1 === q0) {
    return t.slice(1, -1)
  }

  return t
}

const ansi = /\x1b\[[0-9;?]*[A-Za-z]/g
const osc = /\x1b\][^\x07]*\x07/g

export const stripAnsi = (v: string) => {
  const t0 = typeof v === "string" ? v : ""
  const t1 = t0.replace(osc, "")
  return t1.replace(ansi, "")
}

export const errText = (e: unknown) => {
  if (typeof e === "string") {
    return e
  }

  if (e instanceof Error) {
    return e.message
  }

  if (!e || typeof e !== "object") {
    return ""
  }

  const o = e as { message?: unknown }
  const msg = typeof o.message === "string" ? o.message : ""
  return msg
}
