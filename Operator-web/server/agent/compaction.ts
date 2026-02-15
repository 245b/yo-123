import type { AgentChatMessage } from "./types"
import { estimateTokensFromMessages, latestUserMessages } from "./history"

export const COMPACT_SUMMARIZATION_PROMPT =
  "You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for another LLM that will resume the task. Include current progress, key decisions, constraints, remaining work, and critical references. Keep it concise and structured."

export const COMPACT_SUMMARY_PREFIX =
  "Another language model started to solve this problem and produced a summary of its thinking process. You also have access to tool state. Build on this summary and continue without duplicating work."

export const DEFAULT_CONTEXT_WINDOW = 128000
export const DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT = 95
export const DEFAULT_AUTO_COMPACT_LIMIT = Math.floor(DEFAULT_CONTEXT_WINDOW * 0.9)
export const COMPACT_USER_MESSAGE_MAX_TOKENS = 20000

export type CompactInput = {
  messages: AgentChatMessage[]
  contextWindow?: number
  effectivePercent?: number
  autoCompactLimit?: number
}

export type CompactResult = {
  compacted: boolean
  beforeTokens: number
  afterTokens: number
  messages: AgentChatMessage[]
  summary: string
  autoCompactLimit: number
  effectiveContextWindow: number
}

export type SummarizeFn = (messages: AgentChatMessage[]) => Promise<string>

const pickContextWindow = (raw?: number) => {
  const n0 = typeof raw === "number" ? Math.floor(raw) : DEFAULT_CONTEXT_WINDOW

  if (n0 < 16000) {
    return 16000
  }

  return n0
}

const pickPercent = (raw?: number) => {
  const n0 = typeof raw === "number" ? Math.floor(raw) : DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT

  if (n0 < 50) {
    return 50
  }

  if (n0 > 100) {
    return 100
  }

  return n0
}

const initialMessages = (messages: AgentChatMessage[]) => {
  const list = Array.isArray(messages) ? messages : []
  const out: AgentChatMessage[] = []

  for (var i = 0; i < list.length; i++) {
    const row = list[i]

    if (!row) {
      continue
    }

    if (row.role !== "system") {
      continue
    }

    out.push(row)
  }

  return out
}

const summaryMessage = (summarySuffix: string): AgentChatMessage => {
  const suffix0 = typeof summarySuffix === "string" ? summarySuffix : ""
  const suffix = suffix0.trim() || "(no summary available)"
  return {
    role: "user",
    content: `${COMPACT_SUMMARY_PREFIX}\n${suffix}`,
  }
}

export const compactMessages = async (input: CompactInput, summarize: SummarizeFn): Promise<CompactResult> => {
  const messages = Array.isArray(input.messages) ? input.messages : []
  const beforeTokens = estimateTokensFromMessages(messages)
  const contextWindow = pickContextWindow(input.contextWindow)
  const effectivePercent = pickPercent(input.effectivePercent)
  const effectiveContextWindow = Math.floor((contextWindow * effectivePercent) / 100)
  const autoCompactLimit0 =
    typeof input.autoCompactLimit === "number" && input.autoCompactLimit > 0
      ? Math.floor(input.autoCompactLimit)
      : Math.floor((contextWindow * 9) / 10)
  const autoCompactLimit = autoCompactLimit0 > 0 ? autoCompactLimit0 : DEFAULT_AUTO_COMPACT_LIMIT

  if (beforeTokens < autoCompactLimit) {
    return {
      compacted: false,
      beforeTokens,
      afterTokens: beforeTokens,
      messages,
      summary: "",
      autoCompactLimit,
      effectiveContextWindow,
    }
  }

  const summarySuffix = await summarize(messages)
  const seed = initialMessages(messages)
  const recentUsers = latestUserMessages(messages, COMPACT_USER_MESSAGE_MAX_TOKENS)
  const compacted = seed.concat(recentUsers, [summaryMessage(summarySuffix)])
  const afterTokens = estimateTokensFromMessages(compacted)

  return {
    compacted: true,
    beforeTokens,
    afterTokens,
    messages: compacted,
    summary: summarySuffix,
    autoCompactLimit,
    effectiveContextWindow,
  }
}
