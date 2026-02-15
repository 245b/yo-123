import type { AgentChatMessage } from "./types"

export const estimateTokensFromText = (text: string) => {
  const raw = typeof text === "string" ? text : ""

  if (!raw) {
    return 0
  }

  return Math.ceil(raw.length / 4)
}

export const estimateTokensFromMessages = (messages: AgentChatMessage[]) => {
  const list = Array.isArray(messages) ? messages : []
  var total = 0

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row) {
      continue
    }

    total += estimateTokensFromText(row.content)
    total += 4
  }

  return total
}

export const normalizeMessages = (messages: AgentChatMessage[]) => {
  const list = Array.isArray(messages) ? messages : []
  const out: AgentChatMessage[] = []

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row) {
      continue
    }

    const role = row.role
    const content0 = typeof row.content === "string" ? row.content : ""
    const content = content0.trim()

    if (!content) {
      continue
    }

    out.push({ role, content })
  }

  return out
}

export const latestUserMessages = (messages: AgentChatMessage[], maxTokens: number) => {
  const list = Array.isArray(messages) ? messages : []
  const out: AgentChatMessage[] = []
  var budget = maxTokens > 0 ? maxTokens : 0

  for (var i = list.length - 1; i >= 0; i--) {
    const row = list[i]

    if (!row || row.role !== "user") {
      continue
    }

    const cost = estimateTokensFromText(row.content)

    if (budget <= 0) {
      break
    }

    if (cost <= budget) {
      out.push(row)
      budget -= cost
      continue
    }

    const approxChars = Math.max(32, budget * 4)
    const trimmed = row.content.slice(Math.max(0, row.content.length - approxChars)).trim()

    if (trimmed) {
      out.push({ role: "user", content: trimmed })
    }

    budget = 0
    break
  }

  out.reverse()
  return out
}
