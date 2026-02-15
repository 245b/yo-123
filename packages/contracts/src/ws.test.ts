import { describe, expect, test } from "bun:test"
import { decodeAgentWsClientMessage, decodeAgentWsServerEvent } from "./ws"

describe("ws contracts", () => {
  test("rejects malformed submit_turn", () => {
    const out = decodeAgentWsClientMessage({
      type: "submit_turn",
      chatId: "operator",
      messages: [{ role: "user", content: 42 }],
    })

    expect(out.success).toBe(false)
  })

  test("accepts turn_complete server event", () => {
    const out = decodeAgentWsServerEvent({
      type: "turn_complete",
      chat_id: "operator",
      turn_id: "t1",
      last_agent_message: "done",
    })

    expect(out.success).toBe(true)
  })
})