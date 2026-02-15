import { describe, expect, test } from "bun:test"
import { decodeAgentWsClientMessage } from "../../../packages/contracts/src/ws"

describe("ws client contracts", () => {
  test("rejects invalid payload", () => {
    const row = {
      type: "submit_turn",
      chatId: "operator",
      messages: [{ role: "user", content: 123 }],
    }
    const out = decodeAgentWsClientMessage(row)

    expect(out.success).toBe(false)
  })

  test("accepts configure payload", () => {
    const row = {
      type: "configure",
      chatId: "operator",
      mode: "chat",
    }
    const out = decodeAgentWsClientMessage(row)

    expect(out.success).toBe(true)
  })
})
