import path from "node:path"
import { runExecCommand } from "../tool-orchestrator"

export type VerificationClaimKind = "path" | "runtime_state" | "identity_metadata"

export type VerificationClaimScope = "host" | "session" | "both"

export type VerificationClaimSource = "user" | "draft"

export type VerificationClaim = {
  kind: VerificationClaimKind
  scope: VerificationClaimScope
  source: VerificationClaimSource
  value: string
}

export type VerificationToolEvidence = {
  id: string
  detail: string
}

export type SessionCheckInput = {
  sessionId: string
  command: string
  timeoutMs: number
  maxChars: number
}

export type SessionCheckOutput = {
  output: string
  exitCode?: number
}

export type AutoVerificationInput = {
  userText: string
  draftAnswer: string
  root: string
  sessionId: string
  allowTerminalExec: boolean
  maxProbes: number
  timeoutMs: number
  signal?: AbortSignal
}

export type AutoVerificationDeps = {
  runSessionCheck?: (input: SessionCheckInput) => Promise<SessionCheckOutput>
  hostExists?: (target: string) => Promise<boolean>
  hostKind?: (target: string) => Promise<"file" | "directory" | "other" | "unknown">
  now?: () => number
}

export type AutoVerificationResult = {
  claims: VerificationClaim[]
  toolEvidence: VerificationToolEvidence[]
  summary: string
  attempted: boolean
  identityMetadataDetected: boolean
}

const clean = (raw: unknown) => {
  const text0 = typeof raw === "string" ? raw : ""
  return text0.trim()
}

const clip = (raw: string, max: number) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text1 = text0.replace(/\s+/g, " ").trim()

  if (!text1) {
    return ""
  }

  if (text1.length <= max) {
    return text1
  }

  return `${text1.slice(0, max)}...`
}

const isWindowsAbs = (raw: string) => {
  const text = clean(raw)

  if (!text) {
    return false
  }

  return /^[A-Za-z]:\\/.test(text)
}

const isPosixAbs = (raw: string) => {
  const text = clean(raw)

  if (!text) {
    return false
  }

  return text.startsWith("/")
}

const stripEdge = (raw: string) => {
  const text0 = clean(raw)

  if (!text0) {
    return ""
  }

  var text = text0
  text = text.replace(/^[("'`]+/, "")
  text = text.replace(/[)"'`.,;:!?]+$/g, "")
  return text.trim()
}

const collectRegex = (raw: string, re: RegExp, captureIndex?: number) => {
  const text = typeof raw === "string" ? raw : ""
  const out: string[] = []
  var match: RegExpExecArray | null = null
  var idx = typeof captureIndex === "number" ? captureIndex : 0

  for (;;) {
    match = re.exec(text)

    if (!match) {
      return out
    }

    const token0 = match[idx] ?? ""
    const token = stripEdge(token0)

    if (!token) {
      continue
    }

    if (token.includes("://")) {
      continue
    }

    out.push(token)
  }
}

const normalizeRelative = (raw: string) => {
  const token = stripEdge(raw)

  if (!token) {
    return ""
  }

  return token.replace(/\\/g, "/")
}

const claimScopeForPath = (raw: string): VerificationClaimScope => {
  if (isWindowsAbs(raw)) {
    return "host"
  }

  if (isPosixAbs(raw)) {
    return "session"
  }

  return "both"
}

const pathTokensFromText = (raw: string) => {
  const text = typeof raw === "string" ? raw : ""
  const out: string[] = []
  const win = collectRegex(text, /\b[A-Za-z]:\\[^\s"'<>|]+/g)
  const posix = collectRegex(text, /(^|[\s("'`])(\/[^\s"'`<>]+)/g, 2)
  const rel = collectRegex(text, /(^|[\s("'`])(\.{1,2}[\\/][^\s"'`<>]+)/g, 2)
  const slash = collectRegex(text, /\b[A-Za-z0-9._-]+[\\/][A-Za-z0-9._\\/-]*[A-Za-z0-9._-]\b/g)

  for (var i = 0; i < win.length; i++) {
    const row = win[i] ?? ""

    if (row) {
      out.push(row)
    }
  }

  for (var i = 0; i < posix.length; i++) {
    const row = posix[i] ?? ""

    if (row) {
      out.push(row)
    }
  }

  for (var i = 0; i < rel.length; i++) {
    const row = rel[i] ?? ""

    if (row) {
      out.push(row)
    }
  }

  for (var i = 0; i < slash.length; i++) {
    const row = slash[i] ?? ""

    if (!row) {
      continue
    }

    if (row.includes("://")) {
      continue
    }

    out.push(row)
  }

  return out
}

const hasRuntimeStatePhrase = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.toLowerCase()

  if (!text) {
    return false
  }

  const patterns = [
    "current directory",
    "working directory",
    "workspace root",
    "runtime state",
    "session folder",
    "cwd",
  ]

  for (var i = 0; i < patterns.length; i++) {
    const row = patterns[i] ?? ""

    if (!row) {
      continue
    }

    if (text.includes(row)) {
      return true
    }
  }

  return false
}

const hasIdentityMetadataPhrase = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.toLowerCase()

  if (!text) {
    return false
  }

  const identity = [
    "user identity",
    "user's identity",
    "username",
    "user name",
    "identity as",
    "name is",
  ]
  const metadata = [
    "\\users\\",
    "/home/",
    "session id",
    "session_id",
    "path",
    "directory",
    "cwd",
    "workspace",
    "metadata",
  ]
  var hasIdentity = false
  var hasMetadata = false

  for (var i = 0; i < identity.length; i++) {
    const row = identity[i] ?? ""

    if (!row) {
      continue
    }

    if (text.includes(row)) {
      hasIdentity = true
      break
    }
  }

  for (var i = 0; i < metadata.length; i++) {
    const row = metadata[i] ?? ""

    if (!row) {
      continue
    }

    if (text.includes(row)) {
      hasMetadata = true
      break
    }
  }

  if (hasIdentity && hasMetadata) {
    return true
  }

  return /\basserts?\s+the\s+user(?:'s)?\s+identity\b/i.test(text0)
}

const pushClaim = (out: VerificationClaim[], seen: Set<string>, row: VerificationClaim, cap: number) => {
  const key = `${row.kind}:${row.scope}:${row.value.toLowerCase()}`

  if (seen.has(key)) {
    return
  }

  if (out.length >= cap) {
    return
  }

  seen.add(key)
  out.push(row)
}

const pathClaimsFromText = (out: VerificationClaim[], seen: Set<string>, raw: string, source: VerificationClaimSource, cap: number) => {
  const list = pathTokensFromText(raw)
  const abs: string[] = []

  for (var i = 0; i < list.length; i++) {
    const row = list[i] ?? ""

    if (!row) {
      continue
    }

    if (!isWindowsAbs(row) && !isPosixAbs(row)) {
      continue
    }

    abs.push(row)
  }

  for (var i = 0; i < list.length; i++) {
    const token0 = list[i] ?? ""
    const token = stripEdge(token0)

    if (!token) {
      continue
    }

    if (!isWindowsAbs(token) && !isPosixAbs(token)) {
      var shadowed = false

      for (var ai = 0; ai < abs.length; ai++) {
        const absRow = abs[ai] ?? ""

        if (!absRow) {
          continue
        }

        if (absRow.endsWith(`\\${token}`) || absRow.endsWith(`/${token}`)) {
          shadowed = true
          break
        }
      }

      if (shadowed) {
        continue
      }
    }

    const scope = claimScopeForPath(token)
    pushClaim(
      out,
      seen,
      {
        kind: "path",
        scope,
        source,
        value: token,
      },
      cap,
    )
  }
}

export const extractCheckableClaims = (userText: string, draftAnswer: string, root: string) => {
  const out: VerificationClaim[] = []
  const seen = new Set<string>()
  const cap = 24
  pathClaimsFromText(out, seen, userText, "user", cap)
  pathClaimsFromText(out, seen, draftAnswer, "draft", cap)

  if (hasRuntimeStatePhrase(userText) || hasRuntimeStatePhrase(draftAnswer)) {
    pushClaim(
      out,
      seen,
      {
        kind: "runtime_state",
        scope: "both",
        source: "draft",
        value: clean(root) || ".",
      },
      cap,
    )
  }

  if (hasIdentityMetadataPhrase(userText) || hasIdentityMetadataPhrase(draftAnswer)) {
    pushClaim(
      out,
      seen,
      {
        kind: "identity_metadata",
        scope: "both",
        source: "draft",
        value: "identity_metadata_inference",
      },
      cap,
    )
  }

  return out
}

const defaultHostExists = async (target: string) => {
  const fp = clean(target)

  if (!fp) {
    return false
  }

  const file = Bun.file(fp)
  const fileExists = await file.exists()

  if (fileExists) {
    return true
  }

  const mod = await import("node:fs/promises").catch(() => null)

  if (!mod) {
    return false
  }

  const stat = await mod.stat(fp).catch(() => null)
  return !!stat
}

const defaultHostKind = async (target: string): Promise<"file" | "directory" | "other" | "unknown"> => {
  const fp = clean(target)

  if (!fp) {
    return "unknown"
  }

  const mod = await import("node:fs/promises").catch(() => null)

  if (!mod) {
    return "unknown"
  }

  const stat = await mod.stat(fp).catch(() => null)

  if (!stat) {
    return "unknown"
  }

  if (stat.isFile()) {
    return "file"
  }

  if (stat.isDirectory()) {
    return "directory"
  }

  return "other"
}

const quoteSingle = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.replace(/'/g, `'\"'\"'`)
  return `'${text}'`
}

const defaultRunSessionCheck = async (input: SessionCheckInput) => {
  const out = await runExecCommand({
    sessionId: input.sessionId,
    command: input.command,
    workdir: ".",
    timeoutMs: input.timeoutMs,
    maxChars: input.maxChars,
    tty: false,
  })
  return {
    output: typeof out.output === "string" ? out.output : "",
    exitCode: typeof out.exitCode === "number" ? out.exitCode : undefined,
  }
}

const parseSessionPathOutput = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text1 = text0.split(/\r?\n/)[0] ?? ""
  const text = clean(text1)

  if (!text) {
    return { exists: false, kind: "unknown" as "file" | "directory" | "other" | "unknown" }
  }

  if (text === "missing") {
    return { exists: false, kind: "unknown" as "file" | "directory" | "other" | "unknown" }
  }

  if (!text.startsWith("exists:")) {
    return { exists: false, kind: "unknown" as "file" | "directory" | "other" | "unknown" }
  }

  const kind0 = clean(text.slice("exists:".length).toLowerCase())

  if (kind0 === "file") {
    return { exists: true, kind: "file" as "file" | "directory" | "other" | "unknown" }
  }

  if (kind0 === "directory") {
    return { exists: true, kind: "directory" as "file" | "directory" | "other" | "unknown" }
  }

  if (kind0 === "other") {
    return { exists: true, kind: "other" as "file" | "directory" | "other" | "unknown" }
  }

  return { exists: true, kind: "unknown" as "file" | "directory" | "other" | "unknown" }
}

const resultText = (row: Record<string, unknown>) => {
  const raw0 = JSON.stringify(row)
  const raw = typeof raw0 === "string" ? raw0 : "{}"
  return clip(raw, 360) || "{}"
}

const argsText = (row: Record<string, unknown>) => {
  const raw0 = JSON.stringify(row)
  const raw = typeof raw0 === "string" ? raw0 : "{}"
  return clip(raw, 240) || "{}"
}

const makeEvidence = (id: string, tool: string, args: Record<string, unknown>, result: Record<string, unknown>): VerificationToolEvidence => {
  return {
    id,
    detail: `tool=${tool}; args=${argsText(args)}; result=${resultText(result)}`,
  }
}

const hostLabel = (exists: boolean, kind: "file" | "directory" | "other" | "unknown") => {
  if (!exists) {
    return "missing"
  }

  if (kind === "directory") {
    return "exists (directory)"
  }

  if (kind === "file") {
    return "exists (file)"
  }

  if (kind === "other") {
    return "exists (other)"
  }

  return "exists"
}

const sessionPathCommand = (raw: string) => {
  const path0 = normalizeRelative(raw)
  const target = path0 || "."
  const q = quoteSingle(target)
  return `p=${q}; if [ -e "$p" ]; then if [ -d "$p" ]; then echo "exists:directory"; elif [ -f "$p" ]; then echo "exists:file"; else echo "exists:other"; fi; else echo "missing"; fi`
}

const shouldAbort = (signal?: AbortSignal) => {
  if (!signal) {
    return false
  }

  return signal.aborted
}

const remaining = (deadline: number, now: () => number) => {
  const left = deadline - now()

  if (left > 0) {
    return left
  }

  return 0
}

export const runAutoVerification = async (input: AutoVerificationInput, deps?: AutoVerificationDeps): Promise<AutoVerificationResult> => {
  const claims = extractCheckableClaims(input.userText, input.draftAnswer, input.root)
  const toolEvidence: VerificationToolEvidence[] = []
  const notes: string[] = []
  const runSessionCheck = deps?.runSessionCheck || defaultRunSessionCheck
  const hostExists = deps?.hostExists || defaultHostExists
  const hostKind = deps?.hostKind || defaultHostKind
  const now = deps?.now || (() => Date.now())
  const maxProbes = Math.max(0, Math.floor(input.maxProbes))
  const timeoutMs = Math.max(1000, Math.floor(input.timeoutMs))
  const deadline = now() + timeoutMs
  var attempted = false
  var identityMetadataDetected = false
  var probes = 0

  for (var i = 0; i < claims.length; i++) {
    const claim = claims[i]

    if (!claim) {
      continue
    }

    if (shouldAbort(input.signal)) {
      break
    }

    if (remaining(deadline, now) < 1) {
      break
    }

    if (claim.kind === "identity_metadata") {
      identityMetadataDetected = true
      notes.push("Identity inference from path or session metadata was detected and treated as unverified.")
      continue
    }

    if (probes >= maxProbes) {
      break
    }

    probes += 1
    attempted = true

    if (claim.kind === "runtime_state") {
      const root0 = clean(input.root)
      const root = root0 || "."
      const exists = await hostExists(root)
      const kind = exists ? await hostKind(root) : "unknown"
      const label = hostLabel(exists, kind)
      notes.push(`Host runtime root check "${root}" => ${label}.`)
      toolEvidence.push(
        makeEvidence(
          `tool:auto_verify_host_runtime_${probes}`,
          "auto_verify_host_runtime",
          { root },
          { scope: "host", exists, kind },
        ),
      )

      if (!input.allowTerminalExec) {
        continue
      }

      if (remaining(deadline, now) < 1) {
        continue
      }

      const remain = Math.max(1000, Math.min(remaining(deadline, now), timeoutMs))
      const out = await runSessionCheck({
        sessionId: input.sessionId,
        command: "pwd",
        timeoutMs: remain,
        maxChars: 1024,
      })
      const line0 = (out.output || "").split(/\r?\n/)[0] ?? ""
      const line = clean(line0)
      notes.push(`Session cwd check => ${line || "no output"}.`)
      toolEvidence.push(
        makeEvidence(
          `tool:auto_verify_session_runtime_${probes}`,
          "auto_verify_session_runtime",
          { command: "pwd" },
          { scope: "session", output: line || "", exitCode: out.exitCode },
        ),
      )
      continue
    }

    const value0 = clean(claim.value)
    const value = value0 || "."
    const scope = claim.scope
    const winAbs = isWindowsAbs(value)
    const posixAbs = isPosixAbs(value)
    const hostTarget = !winAbs && !posixAbs ? path.resolve(input.root, value) : value
    const doHost = scope === "host" || scope === "both"
    const doSession = input.allowTerminalExec && (scope === "session" || scope === "both")

    if (doHost) {
      const exists = await hostExists(hostTarget)
      const kind = exists ? await hostKind(hostTarget) : "unknown"
      const label = hostLabel(exists, kind)
      notes.push(`Host path check "${value}" => ${label}.`)
      toolEvidence.push(
        makeEvidence(
          `tool:auto_verify_host_path_${probes}`,
          "auto_verify_host_path",
          { path: hostTarget },
          { scope: "host", exists, kind, input: value },
        ),
      )
    }

    if (!doSession) {
      continue
    }

    if (remaining(deadline, now) < 1) {
      continue
    }

    const remain = Math.max(1000, Math.min(remaining(deadline, now), timeoutMs))
    const cmd = sessionPathCommand(value)
    const out = await runSessionCheck({
      sessionId: input.sessionId,
      command: cmd,
      timeoutMs: remain,
      maxChars: 1024,
    })
    const parsed = parseSessionPathOutput(out.output)
    const label = hostLabel(parsed.exists, parsed.kind)
    notes.push(`Session path check "${normalizeRelative(value)}" => ${label}.`)
    toolEvidence.push(
      makeEvidence(
        `tool:auto_verify_session_path_${probes}`,
        "auto_verify_session_path",
        { path: normalizeRelative(value) || "." },
        {
          scope: "session",
          exists: parsed.exists,
          kind: parsed.kind,
          exitCode: out.exitCode,
        },
      ),
    )
  }

  const summary0 = notes.join(" ")
  const summary = summary0 ? clip(`Local verification attempts: ${summary0}`, 560) : ""
  return {
    claims,
    toolEvidence,
    summary,
    attempted,
    identityMetadataDetected,
  }
}
