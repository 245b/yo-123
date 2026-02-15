import { describe, expect, test } from "bun:test"
import { checkPolicy, mergePolicies } from "./execpolicy"
import { parsePolicy } from "./execpolicy-parse"

const allowAll = () => ({ decision: "allow" as const })
const promptAll = () => ({ decision: "prompt" as const })

describe("execpolicy", () => {
  test("basic match", () => {
    const src = `
prefix_rule(
  pattern = ["git", "status"],
)
`
    const parsed = parsePolicy("test.rules", src)
    expect(parsed.ok).toBe(true)

    if (!parsed.ok) {
      return
    }

    const policy = mergePolicies([parsed])
    const ev = checkPolicy(policy, ["git", "status"], allowAll)
    expect(ev.decision).toBe("allow")
    expect(ev.matchedRules.length).toBe(1)
    const m0 = ev.matchedRules[0]
    expect(m0?.kind).toBe("prefix_rule_match")
    expect((m0 as { matchedPrefix?: unknown }).matchedPrefix).toEqual(["git", "status"])
  })

  test("justification cannot be empty", () => {
    const src = `
prefix_rule(
  pattern = ["ls"],
  decision = "prompt",
  justification = "   ",
)
`
    const parsed = parsePolicy("test.rules", src)
    expect(parsed.ok).toBe(false)
  })

  test("only first token alias expands to multiple rules", () => {
    const src = `
prefix_rule(
  pattern = [["bash", "sh"], ["-c", "-l"]],
)
`
    const parsed = parsePolicy("test.rules", src)
    expect(parsed.ok).toBe(true)

    if (!parsed.ok) {
      return
    }

    expect(parsed.rules.length).toBe(2)
    expect(parsed.rules[0]?.first).toBe("bash")
    expect(parsed.rules[1]?.first).toBe("sh")

    const policy = mergePolicies([parsed])
    const bash = checkPolicy(policy, ["bash", "-c", "echo", "hi"], allowAll)
    expect(bash.decision).toBe("allow")
    expect((bash.matchedRules[0] as { matchedPrefix?: unknown }).matchedPrefix).toEqual(["bash", "-c"])

    const sh = checkPolicy(policy, ["sh", "-l", "echo", "hi"], allowAll)
    expect(sh.decision).toBe("allow")
    expect((sh.matchedRules[0] as { matchedPrefix?: unknown }).matchedPrefix).toEqual(["sh", "-l"])
  })

  test("tail aliases are positional and not cartesian expanded", () => {
    const src = `
prefix_rule(
  pattern = ["npm", ["i", "install"], ["--legacy-peer-deps", "--no-save"]],
)
`
    const parsed = parsePolicy("test.rules", src)
    expect(parsed.ok).toBe(true)

    if (!parsed.ok) {
      return
    }

    expect(parsed.rules.length).toBe(1)
    const policy = mergePolicies([parsed])

    const npmI = checkPolicy(policy, ["npm", "i", "--legacy-peer-deps"], allowAll)
    expect(npmI.decision).toBe("allow")
    expect((npmI.matchedRules[0] as { matchedPrefix?: unknown }).matchedPrefix).toEqual(["npm", "i", "--legacy-peer-deps"])

    const npmInstall = checkPolicy(policy, ["npm", "install", "--no-save", "leftpad"], allowAll)
    expect(npmInstall.decision).toBe("allow")
    expect((npmInstall.matchedRules[0] as { matchedPrefix?: unknown }).matchedPrefix).toEqual(["npm", "install", "--no-save"])
  })

  test("match and not_match examples are enforced", () => {
    const src = `
prefix_rule(
  pattern = ["git", "status"],
  match = [["git", "status"], "git status"],
  not_match = [
    ["git", "--config", "color.status=always", "status"],
    "git --config color.status=always status",
  ],
)
`
    const parsed = parsePolicy("test.rules", src)
    expect(parsed.ok).toBe(true)

    if (!parsed.ok) {
      return
    }

    const policy = mergePolicies([parsed])
    const ev = checkPolicy(policy, ["git", "--config", "color.status=always", "status"], allowAll)
    expect(ev.decision).toBe("allow")
    expect(ev.matchedRules.length).toBe(1)
    expect(ev.matchedRules[0]?.kind).toBe("heuristics_rule_match")
  })

  test("strictest decision wins across matches", () => {
    const src = `
prefix_rule(
  pattern = ["git"],
  decision = "prompt",
)
prefix_rule(
  pattern = ["git", "commit"],
  decision = "forbidden",
)
`
    const parsed = parsePolicy("test.rules", src)
    expect(parsed.ok).toBe(true)

    if (!parsed.ok) {
      return
    }

    const policy = mergePolicies([parsed])
    const ev = checkPolicy(policy, ["git", "commit", "-m", "hi"], allowAll)
    expect(ev.decision).toBe("forbidden")
    expect(ev.matchedRules.length).toBe(2)
  })

  test("merge order is deterministic", () => {
    const p1 = parsePolicy(
      "first.rules",
      `
prefix_rule(
  pattern = ["git"],
  decision = "prompt",
)
`,
    )
    const p2 = parsePolicy(
      "second.rules",
      `
prefix_rule(
  pattern = ["git", "commit"],
  decision = "forbidden",
)
`,
    )
    expect(p1.ok).toBe(true)
    expect(p2.ok).toBe(true)

    if (!p1.ok || !p2.ok) {
      return
    }

    const policy = mergePolicies([p1, p2])
    const ev = checkPolicy(policy, ["git", "commit", "-m", "hi"], promptAll)
    expect(ev.decision).toBe("forbidden")
    expect(ev.matchedRules.length).toBe(2)
    expect(ev.matchedRules[0]?.kind).toBe("prefix_rule_match")
    expect((ev.matchedRules[0] as { matchedPrefix?: unknown }).matchedPrefix).toEqual(["git"])
  })
})

