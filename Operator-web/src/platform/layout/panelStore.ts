const loadFlag = (key: string) => {
  const ok = typeof window !== "undefined"

  if (!ok) {
    return false
  }

  const v = window.localStorage.getItem(key) ?? ""
  return v === "1"
}

const saveFlag = (key: string, open: boolean) => {
  const ok = typeof window !== "undefined"

  if (!ok) {
    return
  }

  window.localStorage.setItem(key, open ? "1" : "0")
}

export const clampRightWidth = (raw: number) => {
  const ok = typeof window !== "undefined"
  const vw = ok ? window.innerWidth : 1280
  const min = vw < 920 ? 320 : 520
  const max0 = Math.floor(vw * 0.94)
  const max = Math.max(min, max0)
  const n0 = Number.isFinite(raw) ? raw : min
  const n = Math.round(n0)

  if (n < min) {
    return min
  }

  if (n > max) {
    return max
  }

  return n
}

export const loadOpen = () => loadFlag("ms_open")

export const saveOpen = (open: boolean) => {
  saveFlag("ms_open", open)
}

export const loadRightOpen = () => loadFlag("ms_open_right")

export const saveRightOpen = (open: boolean) => {
  saveFlag("ms_open_right", open)
}

export const loadRightWidth = () => {
  const ok = typeof window !== "undefined"

  if (!ok) {
    return 0
  }

  const raw = window.localStorage.getItem("ms_right_w") ?? ""
  const n = Number.parseInt(raw, 10)

  if (!Number.isFinite(n)) {
    return 0
  }

  if (n <= 0) {
    return 0
  }

  return n
}

export const saveRightWidth = (w: number) => {
  const ok = typeof window !== "undefined"

  if (!ok) {
    return
  }

  const n0 = Number.isFinite(w) ? w : 0
  const n = Math.round(n0)

  if (n <= 0) {
    return
  }

  window.localStorage.setItem("ms_right_w", `${n}`)
}
