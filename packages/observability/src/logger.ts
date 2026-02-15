export type LogLevel = "info" | "warn" | "error"

const redactPatterns = [
  /sk-[a-zA-Z0-9]{16,}/g,
  /("?api[_-]?key"?\s*[:=]\s*")([^"\n]+)(")/gi,
  /(Authorization\s*:\s*Bearer\s+)([^\s]+)/gi,
]

const flagOn = (raw: unknown) => {
  const v0 = typeof raw === "string" ? raw : ""
  const v = v0.trim().toLowerCase()

  if (!v) {
    return false
  }

  if (v === "1" || v === "true" || v === "on" || v === "yes") {
    return true
  }

  return false
}

export const redactSecrets = (raw: string) => {
  var out = raw

  for (var i = 0; i < redactPatterns.length; i++) {
    const re = redactPatterns[i]

    if (!re) {
      continue
    }

    if (i === 1) {
      out = out.replace(re, "$1***$3")
      continue
    }

    if (i === 2) {
      out = out.replace(re, "$1***")
      continue
    }

    out = out.replace(re, "***")
  }

  return out
}

export const logEvent = (input: {
  level: LogLevel
  event: string
  requestId?: string
  chatId?: string
  sessionId?: string
  hostRole?: string
  channel?: string
  details?: unknown
}) => {
  const row = {
    level: input.level,
    event: input.event,
    requestId: input.requestId,
    chatId: input.chatId,
    sessionId: input.sessionId,
    hostRole: input.hostRole,
    channel: input.channel,
    ts: new Date().toISOString(),
    details: input.details,
  }

  const raw = JSON.stringify(row)
  const text = redactSecrets(raw)
  const forceStderr = flagOn(process.env.OPERATOR_OBSERVABILITY_STDERR ?? "")

  if (forceStderr) {
    process.stderr.write(`${text}\n`)
    return
  }

  if (input.level === "error") {
    console.error(text)
    return
  }

  if (input.level === "warn") {
    console.warn(text)
    return
  }

  console.log(text)
}
