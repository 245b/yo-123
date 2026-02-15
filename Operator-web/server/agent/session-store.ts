import type { AgentChatMessage } from "./types"
import { estimateTokensFromMessages, normalizeMessages } from "./history"

type SessionState = {
  chatId: string
  sessionId: string
  mode: string
  messages: AgentChatMessage[]
  totalTokens: number
  compactCount: number
}

export class AgentSessionStore {
  private readonly state = new Map<string, SessionState>()

  ensure(chatId: string, mode?: string, sessionId?: string) {
    const id = (chatId || "").trim() || "operator"
    const sid = (sessionId || id).trim() || "operator"
    const m = (mode || "chat").trim() || "chat"
    const existing = this.state.get(id)

    if (existing) {
      existing.sessionId = sid
      existing.mode = m
      return existing
    }

    const created: SessionState = {
      chatId: id,
      sessionId: sid,
      mode: m,
      messages: [],
      totalTokens: 0,
      compactCount: 0,
    }
    this.state.set(id, created)
    return created
  }

  setMessages(chatId: string, messages: AgentChatMessage[]) {
    const state = this.ensure(chatId)
    const normalized = normalizeMessages(messages)
    state.messages = normalized
    state.totalTokens = estimateTokensFromMessages(normalized)
    return state
  }

  appendMessage(chatId: string, message: AgentChatMessage) {
    const state = this.ensure(chatId)
    const content = (message.content || "").trim()

    if (!content) {
      return state
    }

    state.messages.push({ role: message.role, content })
    state.totalTokens = estimateTokensFromMessages(state.messages)
    return state
  }

  get(chatId: string) {
    const id = (chatId || "").trim()

    if (!id) {
      return null
    }

    return this.state.get(id) || null
  }

  incrementCompaction(chatId: string) {
    const state = this.ensure(chatId)
    state.compactCount += 1
    return state
  }
}
