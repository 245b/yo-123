import type {
  Decision,
  Evaluation,
  ExecPolicy,
  HeuristicsRuleMatch,
  PatternToken,
  PrefixRule,
  PrefixRuleMatch,
  RuleMatch,
} from "./execpolicy-types"

export type HeuristicsDecision = {
  decision: Decision
  reason?: string
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

export const mergePolicies = (policies: Array<{ rules: PrefixRule[] }>): ExecPolicy => {
  const out = new Map<string, PrefixRule[]>()
  const list0 = Array.isArray(policies) ? policies : []

  for (var i = 0; i < list0.length; i++) {
    const row = list0[i]
    const rules = Array.isArray(row?.rules) ? row.rules : []

    for (var ri = 0; ri < rules.length; ri++) {
      const rule = rules[ri]

      if (!rule) {
        continue
      }

      const key = rule.first
      const cur = out.get(key)

      if (cur) {
        cur.push(rule)
        continue
      }

      out.set(key, [rule])
    }
  }

  return { rules: out }
}

const matches = (rule: PrefixRule, tokens: string[]) => {
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
    const want = rule.rest[i]
    const got = tokens[i + 1] ?? ""

    if (!want) {
      return false
    }

    if (want.kind === "single") {
      if (got !== want.token) {
        return false
      }
      continue
    }

    var ok = false

    for (var ai = 0; ai < want.alts.length; ai++) {
      if ((want.alts[ai] ?? "") === got) {
        ok = true
        break
      }
    }

    if (!ok) {
      return false
    }
  }

  return true
}

const prefixLen = (rule: PrefixRule) => 1 + rule.rest.length

export const defaultHeuristics = (tokens: string[]): HeuristicsDecision => {
  const head0 = tokens[0] ?? ""
  const head = head0.trim().toLowerCase()

  if (!head) {
    return { decision: "allow" }
  }

  if (head === "mkfs" || head.startsWith("mkfs.")) {
    return { decision: "forbidden", reason: "mkfs is destructive" }
  }

  if (head === "shutdown" || head === "reboot" || head === "poweroff" || head === "halt") {
    return { decision: "forbidden", reason: "shutdown/reboot is not allowed" }
  }

  const text = tokens.join(" ").toLowerCase()

  if (text.includes("rm -rf") || text.includes("del /f") || text.includes("rmdir /s")) {
    return { decision: "prompt", reason: "destructive operation" }
  }

  if ((text.includes("curl ") || text.includes("wget ")) && (text.includes("| sh") || text.includes("|bash") || text.includes("| bash"))) {
    return { decision: "prompt", reason: "piping network output to shell" }
  }

  if (head === "git" && tokens[1] === "reset" && tokens[2] === "--hard") {
    return { decision: "prompt", reason: "git reset --hard is destructive" }
  }

  if (head === "git" && tokens[1] === "clean") {
    return { decision: "prompt", reason: "git clean can delete files" }
  }

  return { decision: "allow" }
}

export const checkPolicy = (
  policy: ExecPolicy,
  tokens: string[],
  heuristics?: (tokens: string[]) => HeuristicsDecision,
): Evaluation => {
  const cmd = Array.isArray(tokens) ? tokens : []

  if (!cmd.length) {
    return { decision: "allow", matchedRules: [] }
  }

  const first = cmd[0] ?? ""
  const candidates = policy.rules.get(first) ?? []
  const matched: RuleMatch[] = []
  var decision: Decision = "allow"

  for (var i = 0; i < candidates.length; i++) {
    const rule = candidates[i]

    if (!rule) {
      continue
    }

    if (!matches(rule, cmd)) {
      continue
    }

    const pl = prefixLen(rule)
    const match: PrefixRuleMatch = {
      kind: "prefix_rule_match",
      matchedPrefix: cmd.slice(0, pl),
      decision: rule.decision,
      justification: rule.justification,
      source: rule.source,
    }
    matched.push(match)
    decision = strictest(decision, rule.decision)
  }

  if (matched.length) {
    return { decision, matchedRules: matched }
  }

  const h = typeof heuristics === "function" ? heuristics : defaultHeuristics
  const hd = h(cmd)
  const hm: HeuristicsRuleMatch = {
    kind: "heuristics_rule_match",
    command: cmd,
    decision: hd.decision,
    reason: hd.reason,
  }
  return { decision: hd.decision, matchedRules: [hm] }
}

export const summarizeMatches = (matchedRules: RuleMatch[]) => {
  const list = Array.isArray(matchedRules) ? matchedRules : []
  const out: Array<{
    kind: string
    matched_prefix?: string[]
    decision: Decision
    justification?: string
    reason?: string
    source?: { file: string; index: number }
  }> = []

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row) {
      continue
    }

    if (row.kind === "prefix_rule_match") {
      out.push({
        kind: "prefix_rule_match",
        matched_prefix: row.matchedPrefix,
        decision: row.decision,
        justification: row.justification,
        source: row.source,
      })
      continue
    }

    out.push({
      kind: "heuristics_rule_match",
      decision: row.decision,
      reason: row.reason,
    })
  }

  return out
}

