import path from "node:path"

const isPlaceholder = (raw: string) => {
  const t = raw.trim().toLowerCase()

  if (!t) {
    return true
  }

  if (t === "replace_me" || t === "replaceme") {
    return true
  }

  if (t === "sk-replace_me" || t === "sk_replace_me") {
    return true
  }

  if (t === "disabled" || t === "none") {
    return true
  }

  if (t === "unset" || t === "null") {
    return true
  }

  return false
}

export const loadEnv = async (root: string) => {
  const envp = path.join(root, ".env")
  const envf = Bun.file(envp)
  const envx = await envf.exists()

  if (!envx) {
    return
  }

  const txt = await envf.text()
  const ls = txt.split(/\r?\n/g)

  for (var i = 0; i < ls.length; i++) {
    const raw0 = ls[i] ?? ""
    const raw = raw0.trim()

    if (!raw) {
      continue
    }

    if (raw.startsWith("#")) {
      continue
    }

    const eq = raw.indexOf("=")

    if (eq <= 0) {
      continue
    }

    const k0 = raw.slice(0, eq)
    const k = k0.trim()

    if (!k) {
      continue
    }

    const cur = (process.env[k] ?? "").trim()

    if (cur && !isPlaceholder(cur)) {
      continue
    }

    var v0 = raw.slice(eq + 1).trim()

    if (v0.length >= 2) {
      const q = v0[0] ?? ""
      const qe = v0[v0.length - 1] ?? ""

      if ((q === '"' || q === "'") && qe === q) {
        v0 = v0.slice(1, -1)
      }
    }

    process.env[k] = v0
  }
}
