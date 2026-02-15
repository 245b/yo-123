export type Decision = "allow" | "prompt" | "forbidden"

export type PatternToken =
  | { kind: "single"; token: string }
  | { kind: "alts"; alts: string[] }

export type PrefixRule = {
  kind: "prefix_rule"
  first: string
  rest: PatternToken[]
  decision: Decision
  justification?: string
  source?: {
    file: string
    index: number
  }
}

export type PrefixRuleMatch = {
  kind: "prefix_rule_match"
  matchedPrefix: string[]
  decision: Decision
  justification?: string
  source?: PrefixRule["source"]
}

export type HeuristicsRuleMatch = {
  kind: "heuristics_rule_match"
  command: string[]
  decision: Decision
  reason?: string
}

export type RuleMatch = PrefixRuleMatch | HeuristicsRuleMatch

export type Evaluation = {
  decision: Decision
  matchedRules: RuleMatch[]
}

export type ExecPolicy = {
  rules: Map<string, PrefixRule[]>
}

