type TokenizeOk = { ok: true; tokens: string[] }
type TokenizeErr = { ok: false; error: string }

export type TokenizeResult = TokenizeOk | TokenizeErr

// Shlex-ish tokenizer: quotes + backslash escapes, minimal POSIX-ish behavior.
export const tokenizeCommand = (raw: string): TokenizeResult => {
  const text0 = typeof raw === "string" ? raw : ""

  if (!text0.trim()) {
    return { ok: true, tokens: [] }
  }

  const out: string[] = []
  var cur = ""
  var mode: "none" | "single" | "double" = "none"

  for (var i = 0; i < text0.length; i++) {
    const ch = text0[i] ?? ""

    if (mode === "none") {
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        if (cur) {
          out.push(cur)
          cur = ""
        }
        continue
      }

      if (ch === "'") {
        mode = "single"
        continue
      }

      if (ch === '"') {
        mode = "double"
        continue
      }

      if (ch === "\\") {
        const next = text0[i + 1] ?? ""

        if (!next) {
          return { ok: false, error: "Invalid shell syntax: trailing backslash" }
        }

        cur += next
        i += 1
        continue
      }

      cur += ch
      continue
    }

    if (mode === "single") {
      if (ch === "'") {
        mode = "none"
        continue
      }

      cur += ch
      continue
    }

    if (ch === '"') {
      mode = "none"
      continue
    }

    if (ch === "\\") {
      const next = text0[i + 1] ?? ""

      if (!next) {
        return { ok: false, error: "Invalid shell syntax: trailing backslash" }
      }

      cur += next
      i += 1
      continue
    }

    cur += ch
  }

  if (mode !== "none") {
    return { ok: false, error: "Invalid shell syntax: unclosed quote" }
  }

  if (cur) {
    out.push(cur)
  }

  return { ok: true, tokens: out }
}

