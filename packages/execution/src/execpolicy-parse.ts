import { tokenizeCommand } from "./execpolicy-tokenize"
import type { Decision, PatternToken, PrefixRule } from "./execpolicy-types"

type ParseOk = { ok: true; rules: PrefixRule[] }
type ParseErr = { ok: false; error: { message: string; file: string; index: number } }

export type ParsePolicyResult = ParseOk | ParseErr

type Value = string | Value[]

const isWs = (ch: string) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r"
const isIdHead = (ch: string) => !!ch && /[A-Za-z_]/.test(ch)
const isIdTail = (ch: string) => !!ch && /[A-Za-z0-9_]/.test(ch)

const decisionFrom = (raw: string, file: string, idx: number): Decision | ParseErr => {
  const t0 = typeof raw === "string" ? raw : ""
  const t = t0.trim().toLowerCase()

  if (t === "allow") {
    return "allow"
  }

  if (t === "prompt") {
    return "prompt"
  }

  if (t === "forbidden") {
    return "forbidden"
  }

  return { ok: false, error: { message: `Invalid decision: ${t0}`, file, index: idx } }
}

const singleToken = (raw: string, file: string, idx: number): string | ParseErr => {
  const t0 = typeof raw === "string" ? raw : ""
  const t = t0.trim()

  if (!t) {
    return { ok: false, error: { message: "pattern token cannot be empty", file, index: idx } }
  }

  return t0
}

const patternTokenFrom = (value: Value, file: string, idx: number): PatternToken | ParseErr => {
  if (typeof value === "string") {
    const token = singleToken(value, file, idx)

    if (typeof token !== "string") {
      return token
    }

    return { kind: "single", token }
  }

  const list0 = Array.isArray(value) ? value : []

  if (!list0.length) {
    return { ok: false, error: { message: "pattern alternatives cannot be empty", file, index: idx } }
  }

  const alts: string[] = []

  for (var i = 0; i < list0.length; i++) {
    const item = list0[i]

    if (typeof item !== "string") {
      return { ok: false, error: { message: "pattern alternative must be a string", file, index: idx } }
    }

    const token = singleToken(item, file, idx)

    if (typeof token !== "string") {
      return token
    }

    alts.push(token)
  }

  if (alts.length === 1) {
    return { kind: "single", token: alts[0] ?? "" }
  }

  return { kind: "alts", alts }
}

const exampleTokensFrom = (value: Value, file: string, idx: number): string[] | ParseErr => {
  if (typeof value === "string") {
    const txt0 = value
    const txt = txt0.trim()

    if (!txt) {
      return { ok: false, error: { message: "example cannot be an empty string", file, index: idx } }
    }

    const tok = tokenizeCommand(txt0)

    if (!tok.ok) {
      return { ok: false, error: { message: tok.error, file, index: idx } }
    }

    if (!tok.tokens.length) {
      return { ok: false, error: { message: "example cannot be an empty string", file, index: idx } }
    }

    return tok.tokens
  }

  const list0 = Array.isArray(value) ? value : []

  if (!list0.length) {
    return { ok: false, error: { message: "example cannot be an empty list", file, index: idx } }
  }

  const out: string[] = []

  for (var i = 0; i < list0.length; i++) {
    const item = list0[i]

    if (typeof item !== "string") {
      return { ok: false, error: { message: "example tokens must be strings", file, index: idx } }
    }

    const token = singleToken(item, file, idx)

    if (typeof token !== "string") {
      return token
    }

    out.push(token)
  }

  return out
}

const ruleMatches = (rule: PrefixRule, tokens: string[]) => {
  if (!tokens.length) {
    return false
  }

  if ((tokens[0] ?? "") !== rule.first) {
    return false
  }

  if (tokens.length < 1 + rule.rest.length) {
    return false
  }

  for (var i = 0; i < rule.rest.length; i++) {
    const tok = tokens[i + 1] ?? ""
    const pt = rule.rest[i]

    if (!pt) {
      return false
    }

    if (pt.kind === "single") {
      if (tok !== pt.token) {
        return false
      }
      continue
    }

    var hit = false

    for (var ai = 0; ai < pt.alts.length; ai++) {
      if ((pt.alts[ai] ?? "") === tok) {
        hit = true
        break
      }
    }

    if (!hit) {
      return false
    }
  }

  return true
}

const validateExamples = (rules: PrefixRule[], match: string[][], notMatch: string[][], file: string, idx: number) => {
  for (var i = 0; i < notMatch.length; i++) {
    const ex = notMatch[i] ?? []
    var ok = true

    for (var ri = 0; ri < rules.length; ri++) {
      const r = rules[ri]

      if (r && ruleMatches(r, ex)) {
        ok = false
        break
      }
    }

    if (!ok) {
      return { ok: false, error: { message: `not_match example unexpectedly matched: ${ex.join(" ")}`, file, index: idx } } as ParseErr
    }
  }

  for (var i = 0; i < match.length; i++) {
    const ex = match[i] ?? []
    var ok = false

    for (var ri = 0; ri < rules.length; ri++) {
      const r = rules[ri]

      if (r && ruleMatches(r, ex)) {
        ok = true
        break
      }
    }

    if (!ok) {
      return { ok: false, error: { message: `match example did not match: ${ex.join(" ")}`, file, index: idx } } as ParseErr
    }
  }

  return null
}

type Cursor = { text: string; i: number }

const peek = (c: Cursor) => c.text[c.i] ?? ""
const bump = (c: Cursor) => {
  c.i += 1
}

const skipWs = (c: Cursor) => {
  for (;;) {
    const ch = peek(c)

    if (!ch) {
      return
    }

    if (isWs(ch) || ch === ",") {
      bump(c)
      continue
    }

    return
  }
}

const parseIdent = (c: Cursor, file: string): string | ParseErr => {
  skipWs(c)
  const start = c.i
  const head = peek(c)

  if (!isIdHead(head)) {
    return { ok: false, error: { message: "Expected identifier", file, index: start } }
  }

  bump(c)

  for (;;) {
    const ch = peek(c)

    if (!isIdTail(ch)) {
      break
    }

    bump(c)
  }

  return c.text.slice(start, c.i)
}

const parseString = (c: Cursor, file: string): string | ParseErr => {
  skipWs(c)
  const start = c.i
  const q = peek(c)

  if (q !== `"` && q !== `'`) {
    return { ok: false, error: { message: "Expected string literal", file, index: start } }
  }

  bump(c)
  var out = ""

  for (;;) {
    const ch = peek(c)

    if (!ch) {
      return { ok: false, error: { message: "Unclosed string literal", file, index: start } }
    }

    bump(c)

    if (ch === q) {
      break
    }

    if (ch === "\\") {
      const next = peek(c)

      if (!next) {
        return { ok: false, error: { message: "Unclosed string escape", file, index: start } }
      }

      bump(c)
      out += next
      continue
    }

    out += ch
  }

  return out
}

const parseList = (c: Cursor, file: string): Value[] | ParseErr => {
  skipWs(c)
  const start = c.i

  if (peek(c) !== "[") {
    return { ok: false, error: { message: "Expected '['", file, index: start } }
  }

  bump(c)
  const out: Value[] = []

  for (;;) {
    skipWs(c)
    const ch = peek(c)

    if (!ch) {
      return { ok: false, error: { message: "Unclosed list", file, index: start } }
    }

    if (ch === "]") {
      bump(c)
      break
    }

    const value = parseValue(c, file)

    if (typeof value !== "string" && !Array.isArray(value)) {
      return value
    }

    out.push(value)
    skipWs(c)

    if (peek(c) === ",") {
      bump(c)
    }
  }

  return out
}

const parseValue = (c: Cursor, file: string): Value | ParseErr => {
  skipWs(c)
  const ch = peek(c)

  if (!ch) {
    return { ok: false, error: { message: "Unexpected end of input", file, index: c.i } }
  }

  if (ch === "[" ) {
    return parseList(c, file)
  }

  if (ch === `"` || ch === `'`) {
    return parseString(c, file)
  }

  return { ok: false, error: { message: "Unsupported value (expected string or list)", file, index: c.i } }
}

const parseCall = (c: Cursor, file: string, index: number): ParsePolicyResult => {
  skipWs(c)

  if (peek(c) !== "(") {
    return { ok: false, error: { message: "Expected '(' after prefix_rule", file, index: c.i } } as ParseErr
  }

  bump(c)

  const args: Record<string, Value> = {}

  for (;;) {
    skipWs(c)
    const ch = peek(c)

    if (!ch) {
      return { ok: false, error: { message: "Unclosed prefix_rule(...)", file, index: c.i } } as ParseErr
    }

    if (ch === ")") {
      bump(c)
      break
    }

    const key = parseIdent(c, file)

    if (typeof key !== "string") {
      return key
    }

    skipWs(c)

    if (peek(c) !== "=") {
      return { ok: false, error: { message: "Expected '='", file, index: c.i } } as ParseErr
    }

    bump(c)
    const value = parseValue(c, file)

    if (typeof value !== "string" && !Array.isArray(value)) {
      return value
    }

    args[key] = value
    skipWs(c)

    if (peek(c) === ",") {
      bump(c)
      continue
    }
  }

  const patternRaw = args.pattern

  if (!patternRaw) {
    return { ok: false, error: { message: "Missing required arg: pattern", file, index } } as ParseErr
  }

  if (!Array.isArray(patternRaw)) {
    return { ok: false, error: { message: "pattern must be a list", file, index } } as ParseErr
  }

  const decisionRaw = args.decision
  const justificationRaw = args.justification
  const matchRaw = args.match
  const notMatchRaw = args.not_match

  const decision =
    typeof decisionRaw === "string" ? decisionFrom(decisionRaw, file, index) : ("allow" as Decision)

  if (typeof decision !== "string") {
    return decision
  }

  const justification0 = typeof justificationRaw === "string" ? justificationRaw : ""
  const justification = justification0.trim() ? justification0 : undefined

  if (typeof justificationRaw === "string" && !justification) {
    return { ok: false, error: { message: "invalid rule: justification cannot be empty", file, index } } as ParseErr
  }

  const tokens: PatternToken[] = []

  for (var ti = 0; ti < patternRaw.length; ti++) {
    const val = patternRaw[ti]
    const tok = patternTokenFrom(val, file, index)

    if (typeof tok !== "object" || !("kind" in tok)) {
      return tok
    }

    tokens.push(tok)
  }

  if (!tokens.length) {
    return { ok: false, error: { message: "pattern cannot be empty", file, index } } as ParseErr
  }

  const head = tokens[0] ?? null

  if (!head) {
    return { ok: false, error: { message: "pattern cannot be empty", file, index } } as ParseErr
  }

  const headAlts = head.kind === "single" ? [head.token] : head.alts
  const rest = tokens.slice(1)
  const rules: PrefixRule[] = []

  for (var ai = 0; ai < headAlts.length; ai++) {
    const alt = headAlts[ai] ?? ""
    const first = singleToken(alt, file, index)

    if (typeof first !== "string") {
      return first
    }

    rules.push({
      kind: "prefix_rule",
      first,
      rest,
      decision,
      justification,
      source: { file, index },
    })
  }

  const matches: string[][] = []
  const notMatches: string[][] = []

  if (matchRaw !== undefined) {
    if (!Array.isArray(matchRaw)) {
      return { ok: false, error: { message: "match must be a list", file, index } } as ParseErr
    }

    for (var mi = 0; mi < matchRaw.length; mi++) {
      const tok = exampleTokensFrom(matchRaw[mi], file, index)

      if (!Array.isArray(tok)) {
        return tok
      }

      matches.push(tok)
    }
  }

  if (notMatchRaw !== undefined) {
    if (!Array.isArray(notMatchRaw)) {
      return { ok: false, error: { message: "not_match must be a list", file, index } } as ParseErr
    }

    for (var mi = 0; mi < notMatchRaw.length; mi++) {
      const tok = exampleTokensFrom(notMatchRaw[mi], file, index)

      if (!Array.isArray(tok)) {
        return tok
      }

      notMatches.push(tok)
    }
  }

  const unknownKeys = Object.keys(args).filter((k) => k !== "pattern" && k !== "decision" && k !== "justification" && k !== "match" && k !== "not_match")

  if (unknownKeys.length) {
    return { ok: false, error: { message: `Unknown args: ${unknownKeys.join(", ")}`, file, index } } as ParseErr
  }

  const validated = validateExamples(rules, matches, notMatches, file, index)

  if (validated) {
    return validated
  }

  return { ok: true, rules }
}

const stripComments = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  var out = ""
  var mode: "none" | "single" | "double" = "none"

  for (var i = 0; i < text0.length; i++) {
    const ch = text0[i] ?? ""

    if (mode === "none") {
      if (ch === "#") {
        for (; i < text0.length; i++) {
          const c = text0[i] ?? ""
          if (c === "\n") {
            out += c
            break
          }
        }
        continue
      }

      if (ch === "'") {
        mode = "single"
        out += ch
        continue
      }

      if (ch === '"') {
        mode = "double"
        out += ch
        continue
      }

      out += ch
      continue
    }

    if (mode === "single") {
      out += ch
      if (ch === "'") {
        mode = "none"
      }
      continue
    }

    out += ch

    if (ch === '"') {
      mode = "none"
      continue
    }

    if (ch === "\\") {
      const next = text0[i + 1] ?? ""
      if (next) {
        out += next
        i += 1
      }
    }
  }

  return out
}

export const parsePolicy = (file: string, raw: string): ParsePolicyResult => {
  const src0 = typeof raw === "string" ? raw : ""
  const src = stripComments(src0)
  const rules: PrefixRule[] = []
  const c: Cursor = { text: src, i: 0 }
  var callIndex = 0

  for (; c.i < c.text.length; c.i++) {
    const ch = c.text[c.i] ?? ""

    if (ch !== "p") {
      continue
    }

    const head = c.text.slice(c.i, c.i + "prefix_rule".length)

    if (head !== "prefix_rule") {
      continue
    }

    const prev = c.i > 0 ? (c.text[c.i - 1] ?? "") : ""
    const next = c.text[c.i + "prefix_rule".length] ?? ""

    if (prev && isIdTail(prev)) {
      continue
    }

    if (next && isIdTail(next)) {
      continue
    }

    c.i += "prefix_rule".length
    const parsed = parseCall(c, file, callIndex)

    if (!parsed.ok) {
      return parsed
    }

    for (var ri = 0; ri < parsed.rules.length; ri++) {
      const r = parsed.rules[ri]

      if (!r) {
        continue
      }

      rules.push(r)
    }

    callIndex += 1
    c.i -= 1
  }

  return { ok: true, rules }
}
