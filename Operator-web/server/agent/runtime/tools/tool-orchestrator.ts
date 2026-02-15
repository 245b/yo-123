type ApprovalPolicy = "on-request" | "untrusted" | "never"

type CacheKeyInput = {
  tool: string
  command?: string
  cwd?: string
}

type RequestApproval = (input: {
  callId: string
  tool: string
  command?: string
  cwd?: string
  reason?: string
  details?: Record<string, unknown>
}) => Promise<boolean>

type CacheRow = {
  at: number
}

const cache = new Map<string, Map<string, CacheRow>>()

const clean = (raw: unknown) => {
  const t0 = typeof raw === "string" ? raw : ""
  return t0.trim()
}

const normWs = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text1 = text0.replace(/\s+/g, " ").trim()
  return text1
}

const ttlMs = () => {
  const raw0 = clean(process.env.OPERATOR_TOOL_APPROVAL_CACHE_TTL_MS ?? "")
  const raw = raw0 || "600000"
  const n0 = Number.parseInt(raw, 10)
  const n1 = Number.isFinite(n0) ? Math.floor(n0) : 600000
  return Math.max(0, Math.min(24 * 60 * 60 * 1000, n1))
}

export const approvalCacheKey = (input: CacheKeyInput) => {
  const tool = clean(input.tool)
  const cmd0 = clean(input.command)
  const cmd = normWs(cmd0)

  if (!tool || !cmd) {
    return ""
  }

  const cwd = clean(input.cwd)
  const key = `${tool}:${cwd}:${cmd}`
  return key.length <= 900 ? key : key.slice(0, 900)
}

const getSession = (sessionId: string) => {
  const sid = clean(sessionId) || "operator"
  const existing = cache.get(sid)

  if (existing) {
    return existing
  }

  const created = new Map<string, CacheRow>()
  cache.set(sid, created)
  return created
}

const isFresh = (row: CacheRow, now: number, ttl: number) => {
  if (ttl <= 0) {
    return false
  }

  const age = now - row.at
  return age >= 0 && age <= ttl
}

export const getCachedApproval = (sessionId: string, key: string) => {
  const k = clean(key)

  if (!k) {
    return false
  }

  const now = Date.now()
  const ttl = ttlMs()

  if (ttl <= 0) {
    return false
  }

  const ses = getSession(sessionId)
  const row = ses.get(k)

  if (!row) {
    return false
  }

  if (isFresh(row, now, ttl)) {
    return true
  }

  ses.delete(k)
  return false
}

export const setCachedApproval = (sessionId: string, key: string) => {
  const k = clean(key)

  if (!k) {
    return false
  }

  const ttl = ttlMs()

  if (ttl <= 0) {
    return false
  }

  const ses = getSession(sessionId)
  ses.set(k, { at: Date.now() })
  return true
}

export const approveWithCache = async (input: {
  chatId: string
  sessionId: string
  policy: ApprovalPolicy
  requestApproval: RequestApproval | null
  callId: string
  tool: string
  reason: string
  details?: Record<string, unknown>
  command?: string
  cwd?: string
  cacheKey?: string
}) => {
  if (input.policy === "never") {
    return { approved: true, auto: true }
  }

  if (!input.requestApproval) {
    return { approved: false, auto: false, unavailable: true }
  }

  const key = clean(input.cacheKey)

  if (key && getCachedApproval(input.sessionId, key)) {
    return { approved: true, auto: true, cached: true }
  }

  const approved = await input.requestApproval({
    callId: input.callId,
    tool: input.tool,
    reason: input.reason,
    details: input.details,
    command: input.command,
    cwd: input.cwd,
  })

  if (approved === true && key) {
    setCachedApproval(input.sessionId, key)
  }

  return { approved: approved === true, auto: false }
}

