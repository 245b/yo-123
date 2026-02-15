import { describe, expect, test } from "bun:test"
import { backgroundDecision } from "./manager"

describe("unified exec backgrounding", () => {
  test("backgrounds when command reaches 2 minute threshold", () => {
    const out = backgroundDecision({
      timeoutMs: 120000,
      elapsedMs: 120000,
      idleMs: 1000,
    })
    expect(out.background).toBe(true)
    expect(out.reason).toBe("timeout")
  })

  test("backgrounds when output is stalled", () => {
    const out = backgroundDecision({
      timeoutMs: 60000,
      elapsedMs: 50000,
      idleMs: 50000,
    })
    expect(out.background).toBe(true)
    expect(out.reason).toBe("stalled")
  })

  test("keeps foreground when still active and below thresholds", () => {
    const out = backgroundDecision({
      timeoutMs: 60000,
      elapsedMs: 10000,
      idleMs: 2000,
    })
    expect(out.background).toBe(false)
  })
})
