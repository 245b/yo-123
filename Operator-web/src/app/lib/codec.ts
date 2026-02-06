export const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\r/g, "\\r").replace(/\n/g, "\\n")

export const un = (s: string) => {
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

