const base0 = import.meta.env.BASE_URL ?? "/"
const base = base0.endsWith("/") ? base0 : `${base0}/`
const baseNo = base.endsWith("/") && base.length > 1 ? base.slice(0, -1) : base

export const fromBase = (raw?: string | null): string => {
  const p0 = (raw ?? "/").trim()
  const p = p0 || "/"
  const hit = p.startsWith(base)
  const hit2 = !hit && baseNo !== "/" && p.startsWith(baseNo)
  const cut = hit ? p.slice(base.length - 1) : hit2 ? p.slice(baseNo.length) : p
  const out0 = cut.trim()
  return out0 || "/"
}

export const toBase = (raw: string): string => {
  const p0 = raw.trim()
  const p = p0 || "/"

  if (p.startsWith(base)) {
    return p
  }

  if (p === "/") {
    return base
  }

  const strip = p.startsWith("/") ? p.slice(1) : p
  return `${base}${strip}`
}
