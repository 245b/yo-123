import path from "node:path"

export const safe = (p: string) => p.replace(/\\/g, "/")

const normPosix = (p: string) => {
  const raw = safe(p)
  return path.posix.normalize(raw)
}

const normWin = (p: string) => {
  const raw = p.replace(/\//g, "\\")
  const out = path.win32.normalize(raw)
  return safe(out)
}

export const norm = (p: string, win?: boolean) => {
  const raw0 = typeof p === "string" ? p : ""
  const raw = raw0.trim()

  if (!raw) {
    return ""
  }

  const useWin = win === true
  const out = useWin ? normWin(raw) : normPosix(raw)
  return out
}

export const inside = (base: string, target: string, win?: boolean) => {
  const useWin = win === true
  const b0 = norm(base, useWin)
  const t0 = norm(target, useWin)

  if (!b0 || !t0) {
    return false
  }

  const b1 = b0.replace(/\/+$/, "")
  var b = b1

  if (!b) {
    b = useWin ? b0 : "/"
  }

  var bb = b
  var tt = t0

  if (useWin) {
    bb = bb.toLowerCase()
    tt = tt.toLowerCase()
  }

  if (tt === bb) {
    return true
  }

  if (bb === "/") {
    return tt.startsWith("/")
  }

  return tt.startsWith(`${bb}/`)
}
