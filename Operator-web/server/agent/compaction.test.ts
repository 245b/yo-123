import { describe, expect, test } from "bun:test"
import { COMPACT_SUMMARY_PREFIX, compactMessages } from "./compaction"
import type { AgentChatMessage } from "./types"

describe("compactMessages", () => {
  test("keeps history when usage is below auto-compact limit", async () => {
    const messages: AgentChatMessage[] = [
      { role: "system", content: "base instructions" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ]
    const out = await compactMessages(
      {
        messages,
        contextWindow: 128000,
        autoCompactLimit: 100000,
      },
      async () => "summary",
    )

    expect(out.compacted).toBe(false)
    expect(out.messages).toEqual(messages)
    expect(out.summary).toBe("")
  })

  test("compacts to system + recent users + summary message when over limit", async () => {
    const text = "x".repeat(9000)
    const messages: AgentChatMessage[] = [
      { role: "system", content: "system instructions" },
      { role: "user", content: text },
      { role: "assistant", content: "assistant output" },
      { role: "user", content: `${text} second` },
    ]
    const out = await compactMessages(
      {
        messages,
        contextWindow: 128000,
        autoCompactLimit: 1000,
      },
      async () => "checkpoint summary",
    )

    expect(out.compacted).toBe(true)
    expect(out.summary).toBe("checkpoint summary")
    expect(out.messages.length).toBeGreaterThanOrEqual(2)
    expect(out.messages[0]?.role).toBe("system")
    const last = out.messages[out.messages.length - 1]
    expect(last?.role).toBe("user")
    expect(last?.content.startsWith(COMPACT_SUMMARY_PREFIX)).toBe(true)
  })
})
