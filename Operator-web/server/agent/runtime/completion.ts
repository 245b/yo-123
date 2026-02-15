import type { AgentTurnStatus } from "../types"
import type { RuntimeTerm } from "./helpers"

const clean = (raw: unknown) => {
  const text0 = typeof raw === "string" ? raw : ""
  return text0.trim()
}

const clip = (raw: string, maxChars: number) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text1 = text0.replace(/\r/g, "\n").replace(/\n{2,}/g, "\n")
  const text = text1.trim()

  if (!text) {
    return ""
  }

  if (text.length <= maxChars) {
    return text
  }

  return `${text.slice(0, maxChars)}...`
}

export const latestCompletedTermOutput = (
  order: string[],
  terms: Record<string, RuntimeTerm>,
  maxChars = 1600,
) => {
  const list = Array.isArray(order) ? order : []

  for (var i = list.length - 1; i >= 0; i--) {
    const id0 = list[i] ?? ""
    const id = clean(id0)

    if (!id) {
      continue
    }

    const row = terms[id]
    const text0 = row && typeof row.output === "string" ? row.output : ""
    const text = clip(text0, maxChars)

    if (!text) {
      continue
    }

    if (text === "running...") {
      continue
    }

    return text
  }

  return ""
}

export const buildNoTextCompletionFallback = (input: {
  status?: AgentTurnStatus
  detail?: string
  order: string[]
  terms: Record<string, RuntimeTerm>
}) => {
  const status = input.status || "completed"
  var head = "Turn completed without a final assistant message."

  if (status === "interrupted") {
    head = "Turn was interrupted before a final assistant message was produced."
  }

  if (status === "failed") {
    head = "Turn failed before a final assistant message was produced."
  }

  const detail = clean(input.detail)
  var text = head

  if (detail) {
    text = `${text}\n${detail}`
  }

  const latest = latestCompletedTermOutput(input.order, input.terms)

  if (!latest) {
    return text
  }

  return `${text}\nLatest command output:\n${latest}`
}

