import type { Msg } from "../../types"

export type TruthStance = "supported" | "unsupported" | "unknown"

export type TruthEvidenceType = "given_context" | "tool_check" | "derivation" | "citation"

export type TruthEvidenceSourceKind = "message" | "tool"

export type TruthEvidenceSource = {
  kind: TruthEvidenceSourceKind
  id: string
}

export type TruthEvidence = {
  type: TruthEvidenceType
  source: TruthEvidenceSource
  detail: string
}

export type TruthResult = {
  stance: TruthStance
  answer: string
  evidence: TruthEvidence[]
  what_would_change_my_mind: string[]
}

export type TruthContextSource = {
  id: string
  text: string
}

export type TruthToolSource = {
  id: string
  detail: string
}

export type TruthAuditInput = {
  userText: string
  draftAnswer: string
  recentContext: TruthContextSource[]
  toolEvidence: TruthToolSource[]
}

export type TruthModelCall = (
  messages: Msg[],
  temp?: number,
  max?: number,
  signal?: AbortSignal,
  opt?: { tool_choice?: string; response_format?: Record<string, unknown> },
) => Promise<{ ok: boolean; text?: string; error?: string }>

export type TruthAuditDeps = {
  primaryCall: TruthModelCall
  fallbackCall?: TruthModelCall | null
  rewriteCall?: TruthModelCall | null
  signal?: AbortSignal
}

type SourceSet = {
  messageIds: Set<string>
  toolIds: Set<string>
  toolDetail: Map<string, string>
}

type AutoVerifyLevel = "none" | "host" | "session"

const mindFallback = "Provide verifiable evidence from available context, reproducible checks, or explicit citations."
const unsupportedEvidenceFallback =
  "cannot verify this claim from available information. A source-bound check is needed to confirm it."
const unknownFallback = "cannot verify from available information. A source-bound check is needed to confirm this claim."
const evidenceMindFallback = "Provide source-bound logic, search evidence, or terminal output evidence."
const unknownAfterHostChecksFallback =
  "cannot verify from available information. Host-side checks alone were not enough; I still need explicit command output or an exact path to confirm this claim."
const unknownAfterSessionChecksFallback =
  "cannot verify after local command checks. I still need explicit command output or an exact path to confirm this claim."

const evidenceTypes: TruthEvidenceType[] = ["given_context", "tool_check", "derivation", "citation"]
const toolFailurePatterns = [
  /\bresult=empty result\b/i,
  /\bresult=\{[^}]*"ok"\s*:\s*false/i,
  /\bresult=\{[^}]*"error"\s*:/i,
]

const bannedPatterns = [
  /\byou(?:'|\u2019)?re absolutely right\b/i,
  /\byou(?:'|\u2019)?re right\b/i,
  /\byou are absolutely right\b/i,
  /\byou are right\b/i,
  /\byou are correct\b/i,
  /\byou(?:'|\u2019)?re correct\b/i,
  /\bcorrect\b/i,
  /\bexactly\b/i,
  /\bi don(?:'|\u2019)?t need to prove it\b/i,
  /\bi apologize(?: for (?:the )?confusion)?\b/i,
]

const hardDenialPatterns = [
  /\bno evidence supports\b/i,
  /\bthere (?:is|are) no\b.*\bevidence\b/i,
  /\bthere (?:is|are) no\b.*\bproof\b/i,
  /\bno source\b.*\bbound\b.*\bevidence\b/i,
  /\bdoes not exist\b/i,
  /\bthe claim is false\b/i,
]

const auditMetaPatterns = [
  /\bassistant draft\b/i,
  /\bavailable information in (?:the )?conversation\b/i,
  /\bavailable information provided\b/i,
  /\bthe conversation does not include\b/i,
  /\bno evidence supports these details\b/i,
  /\basserts the user(?:'s)? identity\b/i,
]

const identityMetadataInferencePatterns = [
  /\buser(?:'s)? identity\b.*\b(path|directory|session|metadata|cwd|\\users\\|\/home\/)\b/i,
  /\bname\b.*\b(from|based on)\b.*\b(path|directory|session|metadata|cwd|\\users\\|\/home\/)\b/i,
  /\busername\b.*\b(from|based on|in)\b.*\b(path|directory|session|metadata|cwd|\\users\\|\/home\/)\b/i,
]

export const TRUTHFULNESS_POLICY_TEXT = [
  "Truthfulness policy (higher priority than being agreeable):",
  "",
  "- The assistant must not validate or agree with user statements unless it can justify them with evidence available in the conversation, a reproducible check, or a formal derivation.",
  '- If the user asserts something that cannot be verified from available information, the assistant must say "cannot verify" and explain what would be needed to verify it.',
  '- If a claim is local (for example, environment path, file path, identity, or runtime state) and cannot be verified from available sources, treat it as unknown and request verification instead of asserting that the claim is false.',
  '- Do not use blanket validation phrases such as: "You\'re absolutely right", "You\'re right", "Correct", "Exactly", "I don\'t need to prove it".',
  "- Treat user assertions as unsupported by default until valid source-bound evidence proves support.",
  "- When disagreeing, be direct and specific. When uncertain, say uncertain.",
  '- Use third-person wording when evaluating user claims (e.g., "the claim is unsupported because...").',
  "- Evidence typing must match source kind: tool_check must cite a tool source, while given_context/citation/derivation must cite message sources.",
  "- Do not claim access to files, directories, runtime state, tools, or system context unless those outputs were actually provided.",
  "- Never infer a user's identity from usernames in file paths, session metadata, cwd values, or similar local metadata.",
  '- For simple greetings or small talk with no factual claim (for example: "hi", "hello"), respond naturally and do not force a verification disclaimer.',
  "- If the assistant changes its stance, it must state what new evidence caused the change.",
].join("\n")

export const TRUTHFULNESS_POLICY_SYSTEM_MESSAGE =
  `${TRUTHFULNESS_POLICY_TEXT}\n` + "Output must follow the required JSON schema described by the developer message."

export const TRUTHFULNESS_POLICY_RUNTIME_MESSAGE = TRUTHFULNESS_POLICY_TEXT

export const TRUTHFULNESS_JSON_SCHEMA =
  '{"stance":"supported|unsupported|unknown","answer":"string","evidence":[{"type":"given_context|tool_check|derivation|citation","source":{"kind":"message|tool","id":"message:12|tool:call_abc123"},"detail":"string"}],"what_would_change_my_mind":["string"]}'

export const TRUTHFULNESS_JSON_EXAMPLE =
  '{"stance":"unknown","answer":"cannot verify from available information.","evidence":[{"type":"given_context","source":{"kind":"message","id":"message:1"},"detail":"The provided context does not include a verifiable check."}],"what_would_change_my_mind":["A reproducible check output linked to tool:call_abc123."]}'

export const TRUTHFULNESS_AUDITOR_SYSTEM_MESSAGE = [
  "You are a strict auditor. Task: rewrite the assistant draft to comply with the truthfulness policy.",
  "Rules:",
  "- Remove any blanket agreement/validation.",
  "- Any claim not supported by given context must be labeled unknown or rewritten as a conditional.",
  "- If the claim is checkable but unverified, keep stance unknown and ask for verification instead of asserting falsity.",
  "- If the user statement is unverified, do NOT accept it as true.",
  "- No claims of tool access unless shown.",
  "- Evidence must bind to provided source IDs.",
  "- Evidence typing must match source kind.",
  "- Only treat tool evidence as supportive when the linked tool result is successful.",
  '- For simple greetings or small talk with no factual claim, keep the response conversational and avoid "cannot verify" disclaimers.',
  '- If local checks were attempted, summarize what was checked before stating what remains unverified.',
  '- Never mention internal audit process terms (for example: "assistant draft", "available information in the conversation").',
  "- Never infer user identity from path/session metadata alone.",
  "Return the same JSON schema.",
].join("\n")

export const TRUTHFULNESS_REWRITE_MESSAGE =
  "Revise: you must mark stance as unknown/unsupported or provide valid source-bound evidence."

const clean = (raw: unknown) => {
  const text0 = typeof raw === "string" ? raw : ""
  return text0.trim()
}

const collapse = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text1 = text0.replace(/\s+/g, " ")
  return text1.trim()
}

const sanitizeReasoningField = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text1 = text0.trim()

  if (!text1) {
    return ""
  }

  if (!text1.includes("reasoning_content")) {
    return text1
  }

  return text1.replace(/\breasoning_content\b/g, "reasoning_content_omitted")
}

const clip = (raw: string, max: number) => {
  const text = collapse(sanitizeReasoningField(raw))

  if (!text) {
    return ""
  }

  if (text.length <= max) {
    return text
  }

  return `${text.slice(0, max)}...`
}

const parseJson = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

const hasBannedValidationPhrase = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim()

  if (!text) {
    return false
  }

  for (var i = 0; i < bannedPatterns.length; i++) {
    const re = bannedPatterns[i]

    if (!re) {
      continue
    }

    if (re.test(text)) {
      return true
    }
  }

  return false
}

const hasHardDenialPhrase = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim().toLowerCase()

  if (!text) {
    return false
  }

  for (var i = 0; i < hardDenialPatterns.length; i++) {
    const re = hardDenialPatterns[i]

    if (!re) {
      continue
    }

    if (re.test(text)) {
      return true
    }
  }

  return false
}

const hasAuditMetaPhrase = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim()

  if (!text) {
    return false
  }

  for (var i = 0; i < auditMetaPatterns.length; i++) {
    const re = auditMetaPatterns[i]

    if (!re) {
      continue
    }

    if (re.test(text)) {
      return true
    }
  }

  return false
}

const hasIdentityMetadataInference = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim()

  if (!text) {
    return false
  }

  for (var i = 0; i < identityMetadataInferencePatterns.length; i++) {
    const re = identityMetadataInferencePatterns[i]

    if (!re) {
      continue
    }

    if (re.test(text)) {
      return true
    }
  }

  return false
}

const withUnknownVerificationLanguage = (raw: string) => {
  const text = clean(raw)

  if (!text) {
    return unknownFallback
  }

  const lower = text.toLowerCase()

  if (lower.includes("cannot verify")) {
    return text
  }

  if (!hasHardDenialPhrase(text) && !hasBannedValidationPhrase(text)) {
    return text
  }

  return unknownFallback
}

export const enforceNoMirroringOutput = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim()

  if (!text) {
    return "cannot verify from available information."
  }

  if (!hasBannedValidationPhrase(text)) {
    if (!hasAuditMetaPhrase(text)) {
      return text
    }

    return unknownFallback
  }

  return "the claim is unsupported because no valid source-bound evidence was provided."
}

const autoVerifyLevelFromEvidence = (rows: TruthEvidence[]): AutoVerifyLevel => {
  const list = Array.isArray(rows) ? rows : []
  var sawHost = false

  for (var i = 0; i < list.length; i++) {
    const row = list[i]
    const source = row?.source
    const id0 = typeof source?.id === "string" ? source.id : ""
    const id = id0.trim()

    if (!id) {
      continue
    }

    if (!id.startsWith("tool:auto_verify_")) {
      continue
    }

    if (id.startsWith("tool:auto_verify_session_")) {
      return "session"
    }

    if (id.startsWith("tool:auto_verify_host_")) {
      sawHost = true
      continue
    }

    sawHost = true
  }

  if (sawHost) {
    return "host"
  }

  return "none"
}

const autoVerifyLevelFromToolInput = (rows: TruthToolSource[]): AutoVerifyLevel => {
  const list = Array.isArray(rows) ? rows : []
  var sawHost = false

  for (var i = 0; i < list.length; i++) {
    const row = list[i]
    const id0 = typeof row?.id === "string" ? row.id : ""
    const id = id0.trim()

    if (!id) {
      continue
    }

    if (!id.startsWith("tool:auto_verify_")) {
      continue
    }

    if (id.startsWith("tool:auto_verify_session_")) {
      return "session"
    }

    if (id.startsWith("tool:auto_verify_host_")) {
      sawHost = true
      continue
    }

    sawHost = true
  }

  if (sawHost) {
    return "host"
  }

  return "none"
}

const withAttemptedChecksLanguage = (raw: string, level: AutoVerifyLevel) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim()

  if (level === "none") {
    if (!text) {
      return unknownFallback
    }

    return withUnknownVerificationLanguage(text)
  }

  const low = text.toLowerCase()

  if (level === "session") {
    if (!text) {
      return unknownAfterSessionChecksFallback
    }

    if (low.includes("cannot verify") && low.includes("command")) {
      return text
    }

    if (low.includes("cannot verify") && low.includes("checked")) {
      return text
    }

    if (low.includes("cannot verify")) {
      return `${text} I ran local command checks, but I still need explicit command output or an exact path to confirm this claim.`
    }

    return unknownAfterSessionChecksFallback
  }

  if (!text) {
    return unknownAfterHostChecksFallback
  }

  if (low.includes("cannot verify") && low.includes("checked local path")) {
    return unknownAfterHostChecksFallback
  }

  if (low.includes("cannot verify") && low.includes("runtime context")) {
    return unknownAfterHostChecksFallback
  }

  if (low.includes("cannot verify")) {
    return `${text} Host-side checks alone were not enough; I still need explicit command output or an exact path to confirm this claim.`
  }

  return unknownAfterHostChecksFallback
}

const applyAttemptedCheckFallback = (row: TruthResult, autoVerifyLevel: AutoVerifyLevel): TruthResult => {
  if (autoVerifyLevel === "none") {
    return row
  }

  if (row.stance === "supported") {
    return row
  }

  return {
    stance: "unknown" as TruthStance,
    answer: withAttemptedChecksLanguage(row.answer, autoVerifyLevel),
    evidence: normalizeEvidence(row.evidence),
    what_would_change_my_mind: normalizeMind(row.what_would_change_my_mind),
  }
}

const safeFallbackAnswer = (draft: string) => {
  const text = clip(draft, 1200)

  if (text && !hasBannedValidationPhrase(text) && !hasHardDenialPhrase(text)) {
    return text
  }

  return unknownFallback
}

const capContext = (rows: TruthContextSource[], maxRows: number, maxChars: number) => {
  const list = Array.isArray(rows) ? rows : []
  const out: TruthContextSource[] = []

  for (var i = 0; i < list.length; i++) {
    const row = list[i]
    const id0 = clean(row?.id)
    const text0 = clip(row?.text ?? "", maxChars)

    if (!id0 || !text0) {
      continue
    }

    out.push({ id: id0, text: text0 })

    if (out.length >= maxRows) {
      return out
    }
  }

  return out
}

const capTools = (rows: TruthToolSource[], maxRows: number, maxChars: number) => {
  const list = Array.isArray(rows) ? rows : []
  const out: TruthToolSource[] = []

  for (var i = 0; i < list.length; i++) {
    const row = list[i]
    const id0 = clean(row?.id)
    const detail0 = clip(row?.detail ?? "", maxChars)

    if (!id0 || !detail0) {
      continue
    }

    out.push({ id: id0, detail: detail0 })

    if (out.length >= maxRows) {
      return out
    }
  }

  return out
}

const isValidSourceId = (raw: string) => {
  const id = clean(raw)

  if (!id) {
    return false
  }

  return /^(message|tool):[A-Za-z0-9._:-]+$/.test(id)
}

const sourceSetFromInput = (contextRows: TruthContextSource[], toolRows: TruthToolSource[]): SourceSet => {
  const messageIds = new Set<string>()
  const toolIds = new Set<string>()
  const toolDetail = new Map<string, string>()
  const cList = Array.isArray(contextRows) ? contextRows : []

  for (var i = 0; i < cList.length; i++) {
    const id = clean(cList[i]?.id)

    if (!id.startsWith("message:")) {
      continue
    }

    if (!isValidSourceId(id)) {
      continue
    }

    messageIds.add(id)
  }

  const tList = Array.isArray(toolRows) ? toolRows : []

  for (var i = 0; i < tList.length; i++) {
    const id = clean(tList[i]?.id)
    const detail = clean(tList[i]?.detail)

    if (!id.startsWith("tool:")) {
      continue
    }

    if (!isValidSourceId(id)) {
      continue
    }

    toolIds.add(id)
    toolDetail.set(id, detail)
  }

  return { messageIds, toolIds, toolDetail }
}

const pickStance = (raw: unknown): TruthStance => {
  const text = clean(raw).toLowerCase()

  if (text === "supported") {
    return "supported"
  }

  if (text === "unsupported") {
    return "unsupported"
  }

  return "unknown"
}

const pickEvidenceType = (raw: unknown): TruthEvidenceType => {
  const text0 = clean(raw).toLowerCase()
  const text = text0 === "check" ? "tool_check" : text0

  for (var i = 0; i < evidenceTypes.length; i++) {
    const row = evidenceTypes[i] ?? ""

    if (row && row === text) {
      return row
    }
  }

  return "given_context"
}

const pickSourceKind = (raw: unknown): TruthEvidenceSourceKind => {
  const text = clean(raw).toLowerCase()

  if (text === "tool") {
    return "tool"
  }

  return "message"
}

const normalizeSource = (raw: unknown): TruthEvidenceSource => {
  const row = (raw && typeof raw === "object" ? raw : null) as { kind?: unknown; id?: unknown } | null

  if (!row) {
    return { kind: "message", id: "" }
  }

  const kind = pickSourceKind(row.kind)
  const id = clean(row.id)
  return { kind, id }
}

const normalizeEvidence = (raw: unknown) => {
  const list = Array.isArray(raw) ? raw : []
  const out: TruthEvidence[] = []

  for (var i = 0; i < list.length; i++) {
    const row0 = list[i]
    const row = (row0 && typeof row0 === "object" ? row0 : null) as {
      type?: unknown
      source?: unknown
      detail?: unknown
    } | null

    if (!row) {
      continue
    }

    const detail0 = typeof row.detail === "string" ? row.detail : ""
    const detail = clip(detail0, 560)

    if (!detail) {
      continue
    }

    out.push({
      type: pickEvidenceType(row.type),
      source: normalizeSource(row.source),
      detail,
    })
  }

  return out
}

const normalizeMind = (raw: unknown) => {
  const list = Array.isArray(raw) ? raw : []
  const out: string[] = []

  for (var i = 0; i < list.length; i++) {
    const row = clip(list[i] ?? "", 320)

    if (!row) {
      continue
    }

    out.push(row)
  }

  if (out.length) {
    return out
  }

  return [mindFallback]
}

const normalizeAnswer = (raw: unknown, fallback: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = clip(text0, 1800)

  if (text) {
    return text
  }

  return safeFallbackAnswer(fallback)
}

const normalizeResult = (raw: unknown, fallback: string): TruthResult | null => {
  const row = (raw && typeof raw === "object" ? raw : null) as {
    stance?: unknown
    answer?: unknown
    evidence?: unknown
    what_would_change_my_mind?: unknown
  } | null

  if (!row) {
    return null
  }

  const stance = pickStance(row.stance)
  const answer = normalizeAnswer(row.answer, fallback)
  const evidence = normalizeEvidence(row.evidence)
  const what_would_change_my_mind = normalizeMind(row.what_would_change_my_mind)
  return { stance, answer, evidence, what_would_change_my_mind }
}

const parseResult = (raw: string, fallback: string) => {
  const parsed = parseJson(raw)

  if (!parsed) {
    return null
  }

  return normalizeResult(parsed, fallback)
}

const sourceKindMatchesEvidenceType = (type: TruthEvidenceType, kind: TruthEvidenceSourceKind) => {
  if (type === "tool_check") {
    return kind === "tool"
  }

  return kind === "message"
}

const hasUsableToolEvidence = (raw: string) => {
  const text = clean(raw)

  if (!text) {
    return false
  }

  for (var i = 0; i < toolFailurePatterns.length; i++) {
    const re = toolFailurePatterns[i]

    if (!re) {
      continue
    }

    if (re.test(text)) {
      return false
    }
  }

  return true
}

const validateEvidenceSources = (evidenceRows: TruthEvidence[], sourceSet: SourceSet) => {
  const list = Array.isArray(evidenceRows) ? evidenceRows : []
  var valid = 0
  var invalidAny = 0
  var invalidTool = 0
  var invalidKind = 0
  var invalidToolOutput = 0

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row) {
      invalidAny += 1
      continue
    }

    const source = row.source
    const kind = source?.kind === "tool" ? "tool" : "message"
    const id = clean(source?.id)
    const type = row.type

    if (!id || !isValidSourceId(id)) {
      invalidAny += 1
      continue
    }

    if (!sourceKindMatchesEvidenceType(type, kind)) {
      invalidAny += 1
      invalidKind += 1
      continue
    }

    if (kind === "tool") {
      if (!sourceSet.toolIds.has(id)) {
        invalidAny += 1
        invalidTool += 1
        continue
      }

      const detail = sourceSet.toolDetail.get(id) ?? ""

      if (!hasUsableToolEvidence(detail)) {
        invalidAny += 1
        invalidToolOutput += 1
        continue
      }

      valid += 1
      continue
    }

    if (!sourceSet.messageIds.has(id)) {
      invalidAny += 1
      continue
    }

    valid += 1
  }

  return { valid, invalidAny, invalidTool, invalidKind, invalidToolOutput }
}

const issueList = (row: TruthResult, sourceSet: SourceSet) => {
  const issues: string[] = []
  const evidence = Array.isArray(row?.evidence) ? row.evidence : []
  const validation = validateEvidenceSources(evidence, sourceSet)

  if (hasBannedValidationPhrase(row.answer)) {
    issues.push("banned_validation_phrase")
  }

  if (validation.invalidTool > 0) {
    issues.push("invalid_tool_source")
  }

  if (validation.invalidKind > 0) {
    issues.push("invalid_evidence_kind")
  }

  if (validation.invalidToolOutput > 0) {
    issues.push("invalid_tool_output_evidence")
  }

  if (row.stance === "supported" && evidence.length < 1) {
    issues.push("supported_without_evidence")
  }

  if (row.stance === "supported" && validation.valid < 1) {
    issues.push("supported_without_valid_source")
  }

  return issues
}

const requestSystemPrompt = [
  TRUTHFULNESS_POLICY_SYSTEM_MESSAGE,
  "You must return json only.",
  "Required json schema:",
  TRUTHFULNESS_JSON_SCHEMA,
  "json example:",
  TRUTHFULNESS_JSON_EXAMPLE,
].join("\n")

const requestOptions = {
  tool_choice: "none",
  response_format: { type: "json_object" as const },
}

const callAudit = async (call: TruthModelCall, messages: Msg[], fallback: string, signal?: AbortSignal) => {
  const res = await call(messages, undefined, 1400, signal, requestOptions).catch(() => ({
    ok: false,
    text: "",
  }))

  if (!res.ok) {
    return null
  }

  const raw0 = typeof res.text === "string" ? res.text : ""
  const raw = raw0.trim()

  if (!raw) {
    return null
  }

  return parseResult(raw, fallback)
}

const callWithFallback = async (
  primary: TruthModelCall,
  fallback: TruthModelCall | null | undefined,
  messages: Msg[],
  draft: string,
  signal?: AbortSignal,
) => {
  const first = await callAudit(primary, messages, draft, signal)

  if (first) {
    return first
  }

  if (!fallback) {
    return null
  }

  if (fallback === primary) {
    return null
  }

  return callAudit(fallback, messages, draft, signal)
}

export const needsEvidenceRewrite = (row: TruthResult) => {
  const evidence = Array.isArray(row?.evidence) ? row.evidence : []
  return row?.stance === "supported" && evidence.length < 1
}

export const fallbackTruthResult = (draft: string): TruthResult => {
  return {
    stance: "unknown",
    answer: safeFallbackAnswer(draft),
    evidence: [],
    what_would_change_my_mind: [mindFallback],
  }
}

const strictEvidenceFallbackResult = (): TruthResult => {
  return {
    stance: "unknown",
    answer: unsupportedEvidenceFallback,
    evidence: [],
    what_would_change_my_mind: [evidenceMindFallback],
  }
}

const shouldForceEvidenceFallback = (issues: string[]) => {
  const list = Array.isArray(issues) ? issues : []

  for (var i = 0; i < list.length; i++) {
    const row = clean(list[i]).toLowerCase()

    if (row === "supported_without_valid_source") {
      return true
    }

    if (row === "invalid_evidence_kind") {
      return true
    }

    if (row === "invalid_tool_output_evidence") {
      return true
    }
  }

  return false
}

const sanitizeFinal = (row: TruthResult, fallback: string): TruthResult => {
  const answer0 = normalizeAnswer(row.answer, fallback)
  var answer = enforceNoMirroringOutput(answer0)

  if (hasBannedValidationPhrase(answer)) {
    return fallbackTruthResult(answer)
  }

  const evidence = normalizeEvidence(row.evidence)
  const what_would_change_my_mind = normalizeMind(row.what_would_change_my_mind)
  const autoVerifyLevel = autoVerifyLevelFromEvidence(evidence)
  const attemptedChecks = autoVerifyLevel !== "none"

  if (hasIdentityMetadataInference(answer)) {
    return {
      stance: "unknown",
      answer: "cannot verify identity from path or session metadata alone. I need an explicit user-provided identity statement or direct verified source.",
      evidence,
      what_would_change_my_mind,
    }
  }

  if (hasAuditMetaPhrase(answer)) {
    answer = attemptedChecks ? withAttemptedChecksLanguage(answer, autoVerifyLevel) : unknownFallback
  }

  if (row.stance === "unsupported" && evidence.length < 1) {
    return {
      stance: "unknown",
      answer: attemptedChecks ? withAttemptedChecksLanguage(answer, autoVerifyLevel) : unknownFallback,
      evidence,
      what_would_change_my_mind,
    }
  }

  if (row.stance !== "supported" && evidence.length < 1 && hasHardDenialPhrase(answer)) {
    return {
      stance: "unknown",
      answer: withUnknownVerificationLanguage(answer),
      evidence,
      what_would_change_my_mind,
    }
  }

  if (row.stance === "supported" && evidence.length < 1) {
    return {
      stance: "unknown",
      answer: unsupportedEvidenceFallback,
      evidence,
      what_would_change_my_mind: [evidenceMindFallback],
    }
  }

  if (row.stance !== "supported" && attemptedChecks) {
    return {
      stance: "unknown",
      answer: withAttemptedChecksLanguage(answer, autoVerifyLevel),
      evidence,
      what_would_change_my_mind,
    }
  }

  return {
    stance: row.stance,
    answer,
    evidence,
    what_would_change_my_mind,
  }
}

export const enforceTruthfulnessAudit = async (input: TruthAuditInput, deps: TruthAuditDeps): Promise<TruthResult> => {
  const userText = clip(input.userText, 1200)
  const draft = safeFallbackAnswer(input.draftAnswer)
  const recentContext = capContext(input.recentContext, 10, 420)
  const toolEvidence = capTools(input.toolEvidence, 12, 520)
  const autoVerifyLevel = autoVerifyLevelFromToolInput(toolEvidence)
  const sourceSet = sourceSetFromInput(recentContext, toolEvidence)
  const basePayload = {
    user_text: userText,
    draft_answer: draft,
    available_sources: {
      messages: recentContext,
      tools: toolEvidence,
    },
    recent_context_ids: recentContext.map((row) => row.id),
    tool_source_ids: toolEvidence.map((row) => row.id),
  }
  const baseMessages: Msg[] = [
    { role: "system", content: requestSystemPrompt },
    { role: "system", content: TRUTHFULNESS_AUDITOR_SYSTEM_MESSAGE },
    { role: "user", content: `json audit input:\n${JSON.stringify(basePayload)}` },
  ]
  var out = await callWithFallback(deps.primaryCall, deps.fallbackCall, baseMessages, draft, deps.signal)

  if (!out) {
    return applyAttemptedCheckFallback(fallbackTruthResult(draft), autoVerifyLevel)
  }

  var issues = issueList(out, sourceSet)

  if (!issues.length) {
    return applyAttemptedCheckFallback(sanitizeFinal(out, draft), autoVerifyLevel)
  }

  const rewritePrimary = deps.rewriteCall || deps.primaryCall
  const rewriteFallback = deps.fallbackCall
  const rewritePayload = {
    user_text: userText,
    draft_answer: draft,
    prior_audit: out,
    issues,
    available_sources: {
      messages: recentContext,
      tools: toolEvidence,
    },
  }
  const rewriteMessages: Msg[] = [
    { role: "system", content: requestSystemPrompt },
    { role: "system", content: TRUTHFULNESS_AUDITOR_SYSTEM_MESSAGE },
    { role: "system", content: `${TRUTHFULNESS_REWRITE_MESSAGE} Issues: ${issues.join(",")}. Return json only.` },
    { role: "user", content: `json rewrite input:\n${JSON.stringify(rewritePayload)}` },
  ]
  const revised = await callWithFallback(rewritePrimary, rewriteFallback, rewriteMessages, draft, deps.signal)

  if (!revised) {
    if (shouldForceEvidenceFallback(issues)) {
      return applyAttemptedCheckFallback(strictEvidenceFallbackResult(), autoVerifyLevel)
    }

    return applyAttemptedCheckFallback(fallbackTruthResult(out.answer || draft), autoVerifyLevel)
  }

  out = revised
  issues = issueList(out, sourceSet)

  if (issues.length) {
    if (shouldForceEvidenceFallback(issues)) {
      return applyAttemptedCheckFallback(strictEvidenceFallbackResult(), autoVerifyLevel)
    }

    return applyAttemptedCheckFallback(fallbackTruthResult(out.answer || draft), autoVerifyLevel)
  }

  return applyAttemptedCheckFallback(sanitizeFinal(out, draft), autoVerifyLevel)
}
