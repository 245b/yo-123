import { describe, expect, test } from "bun:test"
import { createRestartBudget, isBudgetExhaustedAt, recordRestart, trimRestarts } from "./restart-budget"

describe("restart budget", () => {
  test("exhausts within window", () => {
    const b = createRestartBudget({ limit: 2, windowMs: 1000 })
    recordRestart(b, 100)
    recordRestart(b, 200)
    expect(isBudgetExhaustedAt(b, 300)).toBe(true)
  })

  test("trims outside window", () => {
    const b = createRestartBudget({ limit: 2, windowMs: 100 })
    recordRestart(b, 0)
    trimRestarts(b, 1000)
    expect(b.restarts.length).toBe(0)
    expect(isBudgetExhaustedAt(b, 1000)).toBe(false)
  })
})
