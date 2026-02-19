export const safeTrim = (v: unknown) => {
  const t0 = typeof v === "string" ? v : ""
  return t0.trim()
}

export const normalizeTermOutput = (raw: unknown) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim()

  if (!text) {
    return ""
  }

  if (text === "running...") {
    return ""
  }

  return text0
}

const previewUrlPattern = /https?:\/\/[^\s"'`<>]+/gi

const trimPreviewCandidate = (raw: string) => {
  var out = raw.trim()

  while (out) {
    const last = out[out.length - 1] ?? ""

    if (last === "." || last === "," || last === ";" || last === "!" || last === "?") {
      out = out.slice(0, -1)
      continue
    }

    if (last === ")") {
      const opens = (out.match(/\(/g) ?? []).length
      const closes = (out.match(/\)/g) ?? []).length

      if (closes > opens) {
        out = out.slice(0, -1)
        continue
      }
    }

    if (last === "]") {
      const opens = (out.match(/\[/g) ?? []).length
      const closes = (out.match(/\]/g) ?? []).length

      if (closes > opens) {
        out = out.slice(0, -1)
        continue
      }
    }

    break
  }

  return out
}

const canParseUrl = (raw: string) => {
  const api = URL as typeof URL & {
    canParse?: (url: string) => boolean
  }
  const fn = api.canParse

  if (typeof fn !== "function") {
    return false
  }

  return fn(raw)
}

const loopbackHost = (raw: string) => {
  const host0 = typeof raw === "string" ? raw : ""
  const host = host0.trim().toLowerCase()

  if (!host) {
    return false
  }

  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
    return true
  }

  if (host === "::1" || host === "[::1]") {
    return true
  }

  return false
}

const normalizeLocalPreviewUrl = (raw: string) => {
  const t = trimPreviewCandidate(raw)

  if (!t) {
    return ""
  }

  if (!canParseUrl(t)) {
    return ""
  }

  const parsed = new URL(t)
  const protocol = parsed.protocol.toLowerCase()

  if (protocol !== "http:" && protocol !== "https:") {
    return ""
  }

  const host = parsed.hostname.toLowerCase()

  if (!loopbackHost(host)) {
    return ""
  }

  if (host === "0.0.0.0") {
    parsed.hostname = "localhost"
  }

  return parsed.toString()
}

export const extractLocalPreviewUrls = (raw: unknown) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim()

  if (!text) {
    return [] as string[]
  }

  const matches = text.match(previewUrlPattern) ?? []
  const out: string[] = []

  for (var i = 0; i < matches.length; i++) {
    const row = matches[i] ?? ""
    const next = normalizeLocalPreviewUrl(row)

    if (!next) {
      continue
    }

    if (out.includes(next)) {
      continue
    }

    out.push(next)
  }

  return out
}

export const extractLatestLocalPreviewUrl = (raw: unknown) => {
  const list = extractLocalPreviewUrls(raw)

  if (!list.length) {
    return ""
  }

  return list[list.length - 1] ?? ""
}

export const resolveExecCommandEndOutput = (input: {
  output: unknown
  previous: unknown
}) => {
  const out0 = typeof input.output === "string" ? input.output : ""
  const out = out0

  if (out) {
    return out
  }

  const prev0 = typeof input.previous === "string" ? input.previous : ""
  const prev = prev0.trim()

  if (!prev) {
    return "done"
  }

  if (prev === "running...") {
    return "done"
  }

  return prev0
}

export const resolveExecCommandEndStatus = (input: {
  exitCode: unknown
  processId: unknown
}) => {
  const rawCode = input.exitCode
  const n0 = typeof rawCode === "number" ? rawCode : Number.parseInt(safeTrim(rawCode), 10)
  const code = Number.isFinite(n0) ? Math.floor(n0) : undefined
  const processId0 = typeof input.processId === "string" ? input.processId : ""
  const processId = processId0.trim()

  if (typeof code !== "number" && processId) {
    return "running" as const
  }

  if (typeof code === "number" && code !== 0) {
    return "failed" as const
  }

  return "done" as const
}

export const buildNoTextCompletionDiagnostic = (input: {
  status: unknown
  detail: unknown
  latestOutput: unknown
}) => {
  const status0 = typeof input.status === "string" ? input.status : ""
  const status = status0.trim()
  var head = "Turn completed without a final assistant message."

  if (status === "interrupted") {
    head = "Turn was interrupted before a final assistant message was produced."
  }

  if (status === "failed") {
    head = "Turn failed before a final assistant message was produced."
  }

  const detail0 = typeof input.detail === "string" ? input.detail : ""
  const detail = detail0.trim()
  var text = head

  if (detail) {
    text = `${text}\n${detail}`
  }

  const latest = normalizeTermOutput(input.latestOutput)

  if (!latest) {
    return text
  }

  return `${text}\nLatest command output:\n${latest}`
}
