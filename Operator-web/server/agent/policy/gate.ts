import { checkPolicy, summarizeMatches } from "@operator/execution/execpolicy"
import { tokenizeCommand } from "@operator/execution/execpolicy-tokenize"
import type { Decision, Evaluation } from "@operator/execution/execpolicy-types"
import { loadExecPolicyForSession } from "./execpolicy"
import type { AgentWsServerEvent } from "../types"

export type ApprovalPolicy = "on-request" | "untrusted" | "never"
export type SandboxMode = "workspace-write" | "read-only"

const clean = (raw: unknown) => {
  const t0 = typeof raw === "string" ? raw : ""
  return t0.trim()
}

const lower = (raw: unknown) => {
  return clean(raw).toLowerCase()
}

const decisionRank = (d: Decision) => {
  if (d === "forbidden") {
    return 2
  }

  if (d === "prompt") {
    return 1
  }

  return 0
}

const strictest = (a: Decision, b: Decision) => {
  return decisionRank(a) >= decisionRank(b) ? a : b
}

export const approvalPolicyFrom = (raw?: unknown): ApprovalPolicy => {
  const v0 = typeof raw === "string" ? raw : ""
  const v = v0.trim()
  const env0 = clean(process.env.OPERATOR_APPROVAL_POLICY ?? "")
  const env = env0 || "on-request"
  const want = (v || env).toLowerCase()

  if (want === "never") {
    return "never"
  }

  if (want === "untrusted") {
    return "untrusted"
  }

  return "on-request"
}

export const sandboxModeFrom = (raw?: unknown): SandboxMode => {
  const v0 = typeof raw === "string" ? raw : ""
  const v = v0.trim()
  const env0 = clean(process.env.OPERATOR_SANDBOX_MODE ?? "")
  const env = env0 || "workspace-write"
  const want = (v || env).toLowerCase()

  if (want === "read-only" || want === "readonly") {
    return "read-only"
  }

  return "workspace-write"
}

export const shouldPromptCommand = (approvalPolicy: ApprovalPolicy, decision: Decision) => {
  if (approvalPolicy === "never") {
    return false
  }

  if (approvalPolicy === "untrusted") {
    return true
  }

  return decision === "prompt"
}

const firstNonEmptyLine = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""

  if (!text0.trim()) {
    return ""
  }

  const lines = text0.split(/\r?\n/g)

  for (var i = 0; i < lines.length; i++) {
    const line0 = lines[i] ?? ""
    const line = line0.trim()

    if (!line) {
      continue
    }

    return line0
  }

  return ""
}

export const evalExecPolicyForCommand = async (input: {
  chatId: string
  sessionId: string
  command: string
  emit?: (payload: AgentWsServerEvent) => void
}): Promise<{
  ok: true
  decision: Decision
  tokens: string[]
  evaluation: Evaluation
  details: Record<string, unknown>
}> => {
  const chatId = clean(input.chatId) || "operator"
  const sessionId = clean(input.sessionId) || chatId
  const command0 = typeof input.command === "string" ? input.command : ""
  const command = command0.trim()
  const emit = typeof input.emit === "function" ? input.emit : undefined

  const tok = tokenizeCommand(command)

  if (!tok.ok) {
    return {
      ok: true,
      decision: "prompt",
      tokens: [],
      evaluation: { decision: "prompt", matchedRules: [] },
      details: {
        kind: "execpolicy",
        decision: "prompt",
        reason: "command tokenization failed",
        tokenize_error: tok.error,
      },
    }
  }

  const tokens = tok.tokens

  if (!tokens.length) {
    return {
      ok: true,
      decision: "allow",
      tokens,
      evaluation: { decision: "allow", matchedRules: [] },
      details: { kind: "execpolicy", decision: "allow", reason: "empty command" },
    }
  }

  const loaded = await loadExecPolicyForSession({ chatId, sessionId, emit })
  const evaluation = checkPolicy(loaded.policy, tokens)
  const matched = summarizeMatches(evaluation.matchedRules)

  const justification0 = matched.find((row) => typeof row.justification === "string" && row.justification.trim())
  const justification = typeof justification0?.justification === "string" ? justification0.justification : ""

  const details: Record<string, unknown> = {
    kind: "execpolicy",
    decision: evaluation.decision,
    command_tokens: tokens,
    matched_rules: matched,
    operator_policy_path: loaded.operatorPath,
    workspace_policy_path: loaded.workspacePath,
  }

  if (justification) {
    details.justification = justification
  }

  if (loaded.error) {
    details.policy_load_error = loaded.error
  }

  return {
    ok: true,
    decision: evaluation.decision,
    tokens,
    evaluation,
    details,
  }
}

export const evalExecPolicyForTokens = async (input: {
  chatId: string
  sessionId: string
  tokens: string[]
  emit?: (payload: AgentWsServerEvent) => void
}): Promise<{
  ok: true
  decision: Decision
  tokens: string[]
  evaluation: Evaluation
  details: Record<string, unknown>
}> => {
  const chatId = clean(input.chatId) || "operator"
  const sessionId = clean(input.sessionId) || chatId
  const emit = typeof input.emit === "function" ? input.emit : undefined
  const tokens0 = Array.isArray(input.tokens) ? input.tokens : []
  const tokens: string[] = []

  for (var i = 0; i < tokens0.length; i++) {
    const row = tokens0[i]
    const t = typeof row === "string" ? row.trim() : ""

    if (!t) {
      continue
    }

    tokens.push(row)
  }

  if (!tokens.length) {
    return {
      ok: true,
      decision: "allow",
      tokens: [],
      evaluation: { decision: "allow", matchedRules: [] },
      details: { kind: "execpolicy", decision: "allow", reason: "empty command" },
    }
  }

  const loaded = await loadExecPolicyForSession({ chatId, sessionId, emit })
  const evaluation = checkPolicy(loaded.policy, tokens)
  const matched = summarizeMatches(evaluation.matchedRules)

  const justification0 = matched.find((row) => typeof row.justification === "string" && row.justification.trim())
  const justification = typeof justification0?.justification === "string" ? justification0.justification : ""

  const details: Record<string, unknown> = {
    kind: "execpolicy",
    decision: evaluation.decision,
    command_tokens: tokens,
    matched_rules: matched,
    operator_policy_path: loaded.operatorPath,
    workspace_policy_path: loaded.workspacePath,
  }

  if (justification) {
    details.justification = justification
  }

  if (loaded.error) {
    details.policy_load_error = loaded.error
  }

  return {
    ok: true,
    decision: evaluation.decision,
    tokens,
    evaluation,
    details,
  }
}

const normPath = (raw: string) => {
  const p0 = typeof raw === "string" ? raw : ""
  const p1 = p0.replace(/\\/g, "/")
  return clean(p1)
}

const isSensitivePath = (raw: string) => {
  const p0 = normPath(raw)
  const p = p0.toLowerCase()

  if (!p) {
    return false
  }

  if (p === ".env" || p.endsWith("/.env")) {
    return true
  }

  if (p.startsWith(".env.") || p.includes("/.env.")) {
    return true
  }

  if (p === ".git" || p.startsWith(".git/") || p.includes("/.git/")) {
    return true
  }

  if (p.includes("/secrets/") || p.includes("/secret/")) {
    return true
  }

  return false
}

export const gateMutationTool = (input: {
  tool: string
  paths: string[]
  approvalPolicy: ApprovalPolicy
  sandboxMode: SandboxMode
}): { decision: Decision; reason: string; errorCode?: string; details: Record<string, unknown> } => {
  const tool0 = typeof input.tool === "string" ? input.tool : ""
  const tool = tool0.trim()
  const paths0 = Array.isArray(input.paths) ? input.paths : []
  const paths: string[] = []

  for (var i = 0; i < paths0.length; i++) {
    const row = paths0[i]
    const p = typeof row === "string" ? row.trim() : ""

    if (!p) {
      continue
    }

    paths.push(p)
  }

  if (input.sandboxMode === "read-only") {
    return {
      decision: "forbidden",
      reason: "Sandbox is read-only",
      errorCode: "SANDBOX_READ_ONLY",
      details: { kind: "sandbox", sandbox_mode: "read-only", tool, paths },
    }
  }

  var decision: Decision = "allow"
  var sensitive = false

  for (var i = 0; i < paths.length; i++) {
    if (isSensitivePath(paths[i] ?? "")) {
      sensitive = true
      break
    }
  }

  if (tool === "fs_delete" || tool === "fs_purge") {
    decision = strictest(decision, "prompt")
  }

  if (sensitive) {
    decision = strictest(decision, "prompt")
  }

  if (input.approvalPolicy === "untrusted") {
    decision = strictest(decision, "prompt")
  }

  return {
    decision,
    reason: decision === "prompt" ? (sensitive ? "Sensitive path" : "Mutation tool") : "",
    details: {
      kind: "mutation",
      tool,
      paths,
      sensitive_paths: sensitive,
    },
  }
}

export const gateTerminalSend = async (input: {
  chatId: string
  sessionId: string
  chars: string
  approvalPolicy: ApprovalPolicy
  emit?: (payload: AgentWsServerEvent) => void
}): Promise<{ decision: Decision; reason: string; errorCode?: string; details: Record<string, unknown> }> => {
  const chars0 = typeof input.chars === "string" ? input.chars : ""
  const chars = chars0
  const trimmed = chars.trim()

  if (!trimmed) {
    return { decision: "allow", reason: "", details: { kind: "terminal_send", note: "empty stdin" } }
  }

  const approval = input.approvalPolicy

  if (approval === "never") {
    return { decision: "allow", reason: "", details: { kind: "terminal_send", approval_policy: "never" } }
  }

  const multiLine = chars.includes("\n")

  if (approval === "untrusted" && multiLine) {
    return { decision: "prompt", reason: "untrusted terminal_send", details: { kind: "terminal_send", approval_policy: "untrusted" } }
  }

  if (!multiLine) {
    return { decision: "allow", reason: "", details: { kind: "terminal_send", note: "no newline" } }
  }

  const line = firstNonEmptyLine(chars)

  if (!line.trim()) {
    return { decision: "allow", reason: "", details: { kind: "terminal_send", note: "no command line" } }
  }

  const evaluated = await evalExecPolicyForCommand({
    chatId: input.chatId,
    sessionId: input.sessionId,
    command: line,
    emit: input.emit,
  })

  if (evaluated.decision === "forbidden") {
    return {
      decision: "forbidden",
      reason: "Policy forbids terminal_send command",
      errorCode: "POLICY_FORBIDDEN",
      details: { kind: "terminal_send", line, execpolicy: evaluated.details },
    }
  }

  if (approval === "untrusted") {
    return { decision: "prompt", reason: "untrusted terminal_send", details: { kind: "terminal_send", line, execpolicy: evaluated.details } }
  }

  if (evaluated.decision === "prompt") {
    return { decision: "prompt", reason: "terminal_send requires approval", details: { kind: "terminal_send", line, execpolicy: evaluated.details } }
  }

  return { decision: "allow", reason: "", details: { kind: "terminal_send", line, execpolicy: evaluated.details } }
}
