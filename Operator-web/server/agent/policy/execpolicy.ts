import path from "node:path"
import { mergePolicies } from "@operator/execution/execpolicy"
import { parsePolicy } from "@operator/execution/execpolicy-parse"
import type { ExecPolicy, PrefixRule } from "@operator/execution/execpolicy-types"
import { fsRead } from "../../terminal/client"
import type { AgentWsServerEvent } from "../types"

type CacheRow = {
  loadedAt: number
  policy: ExecPolicy
  operatorPath: string
  workspacePath: string
  lastError: string
  lastWarnOperatorMissingAt: number
  lastWarnWorkspaceMissingAt: number
  lastWarnParseAt: number
}

const cache = new Map<string, CacheRow>()

const clean = (raw: unknown) => {
  const t0 = typeof raw === "string" ? raw : ""
  return t0.trim()
}

const numFromEnv = (key: string, fallback: number, min: number, max: number) => {
  const raw = clean(process.env[key] ?? "")
  const n0 = Number.parseInt(raw, 10)
  const n1 = Number.isFinite(n0) ? Math.floor(n0) : fallback

  if (n1 < min) {
    return min
  }

  if (n1 > max) {
    return max
  }

  return n1
}

const sessionTag = (raw: string) => {
  const t0 = clean(raw)
  const t1 = t0.replace(/[^a-zA-Z0-9_.-]+/g, "_")
  const t = clean(t1)
  return t || "operator"
}

const operatorRoot = () => {
  return path.resolve(import.meta.dir, "../../..")
}

const operatorDataDir = () => {
  const root = operatorRoot()
  const env = clean(process.env.OPERATOR_DATA_DIR ?? "")

  if (env) {
    return env
  }

  return path.join(root, "data")
}

const operatorPolicyPath = () => {
  const env = clean(process.env.OPERATOR_EXEC_POLICY_OPERATOR_PATH ?? "")

  if (env) {
    return env
  }

  return path.join(operatorDataDir(), "rules", "policy.rules")
}

const workspacePolicyPath = () => {
  const env = clean(process.env.OPERATOR_EXEC_POLICY_WORKSPACE_PATH ?? "")
  return env || ".operator/policy.rules"
}

const policyTtlMs = () => {
  return numFromEnv("OPERATOR_EXEC_POLICY_TTL_MS", 2000, 0, 600000)
}

const workspaceReadTimeoutMs = () => {
  return numFromEnv("OPERATOR_EXEC_POLICY_WORKSPACE_TIMEOUT_MS", 1500, 200, 20000)
}

const policyMsg = (message: string) => {
  const msg = clean(message) || "execpolicy warning"
  return msg
}

const shouldWarn = (lastAt: number, now: number) => {
  const ttl = policyTtlMs()

  if (ttl <= 0) {
    return true
  }

  return now - lastAt >= ttl
}

const policyFromRules = (rules: PrefixRule[]) => {
  return mergePolicies([{ rules }])
}

const readOperatorPolicyText = async (fp: string) => {
  const file = Bun.file(fp)
  const exists = await file.exists()

  if (!exists) {
    return { ok: true, missing: true, text: "" }
  }

  const text0 = await file.text().catch(() => "")
  const text = typeof text0 === "string" ? text0 : ""
  return { ok: true, missing: false, text }
}

const readWorkspacePolicyText = async (sessionId: string, fp: string) => {
  const sid = sessionTag(sessionId)
  const timeoutMs = workspaceReadTimeoutMs()
  const out = await fsRead({ sessionId: sid, path: fp, maxBytes: 256000, timeoutMs, requestId: `execpolicy:${sid}` })

  if (!out.ok) {
    const err0 = typeof out.error === "string" ? out.error : ""
    const err = clean(err0) || "workspace policy read failed"
    const missing = err.toLowerCase().includes("not found")
    return { ok: true, missing, text: "", error: err }
  }

  const row = out.result && typeof out.result === "object" ? (out.result as { content?: unknown } | null) : null
  const text0 = typeof row?.content === "string" ? row.content : ""
  const text = text0
  return { ok: true, missing: false, text }
}

const parseRules = (file: string, text: string) => {
  const parsed = parsePolicy(file, text)

  if (!parsed.ok) {
    return { ok: false as const, error: policyMsg(parsed.error.message) }
  }

  return { ok: true as const, rules: parsed.rules }
}

export const loadExecPolicyForSession = async (input: {
  chatId: string
  sessionId: string
  emit?: (payload: AgentWsServerEvent) => void
}): Promise<{ policy: ExecPolicy; operatorPath: string; workspacePath: string; error?: string }> => {
  const chatId = sessionTag(input.chatId || "operator")
  const sessionId = sessionTag(input.sessionId || chatId)
  const emit = typeof input.emit === "function" ? input.emit : null
  const now = Date.now()
  const cached = cache.get(sessionId)
  const ttl = policyTtlMs()

  if (cached && ttl > 0 && now - cached.loadedAt < ttl) {
    return {
      policy: cached.policy,
      operatorPath: cached.operatorPath,
      workspacePath: cached.workspacePath,
      error: cached.lastError || undefined,
    }
  }

  const opPath = operatorPolicyPath()
  const wsPath = workspacePolicyPath()
  const nextRules: PrefixRule[] = []
  var lastError = ""

  const op = await readOperatorPolicyText(opPath)

  if (op.ok && op.missing) {
    if (emit) {
      const lastAt = cached?.lastWarnOperatorMissingAt ?? 0

      if (shouldWarn(lastAt, now)) {
        emit({
          type: "warning",
          chat_id: chatId,
          message: `execpolicy: operator policy missing (${opPath}); continuing with empty operator policy.`,
        })
      }
    }
  }

  if (op.ok && !op.missing) {
    const parsed = parseRules(opPath, op.text)

    if (parsed.ok) {
      nextRules.push(...parsed.rules)
    }

    if (!parsed.ok) {
      lastError = parsed.error

      if (emit) {
        const lastAt = cached?.lastWarnParseAt ?? 0

        if (shouldWarn(lastAt, now)) {
          emit({
            type: "warning",
            chat_id: chatId,
            message: `execpolicy: failed to parse operator policy (${opPath}): ${parsed.error}`,
          })
        }
      }
    }
  }

  const ws = await readWorkspacePolicyText(sessionId, wsPath)

  if (ws.ok && ws.missing) {
    if (emit) {
      const lastAt = cached?.lastWarnWorkspaceMissingAt ?? 0

      if (shouldWarn(lastAt, now)) {
        emit({
          type: "warning",
          chat_id: chatId,
          message: `execpolicy: workspace policy missing (${wsPath}); continuing with empty workspace policy.`,
        })
      }
    }
  }

  if (ws.ok && !ws.missing) {
    const parsed = parseRules(wsPath, ws.text)

    if (parsed.ok) {
      nextRules.push(...parsed.rules)
    }

    if (!parsed.ok) {
      lastError = lastError || parsed.error

      if (emit) {
        const lastAt = cached?.lastWarnParseAt ?? 0

        if (shouldWarn(lastAt, now)) {
          emit({
            type: "warning",
            chat_id: chatId,
            message: `execpolicy: failed to parse workspace policy (${wsPath}): ${parsed.error}`,
          })
        }
      }
    }
  }

  if (ws.ok && ws.error) {
    lastError = lastError || ws.error
  }

  const policy = policyFromRules(nextRules)
  cache.set(sessionId, {
    loadedAt: now,
    policy,
    operatorPath: opPath,
    workspacePath: wsPath,
    lastError,
    lastWarnOperatorMissingAt: op.ok && op.missing ? now : cached?.lastWarnOperatorMissingAt ?? 0,
    lastWarnWorkspaceMissingAt: ws.ok && ws.missing ? now : cached?.lastWarnWorkspaceMissingAt ?? 0,
    lastWarnParseAt: lastError ? now : cached?.lastWarnParseAt ?? 0,
  })

  return {
    policy,
    operatorPath: opPath,
    workspacePath: wsPath,
    error: lastError || undefined,
  }
}
