import { describe, expect, test } from "bun:test"
import { CommandRegistry } from "./commands"

describe("CommandRegistry", () => {
  test("registers and executes commands", async () => {
    const c = new CommandRegistry()
    c.register({
      id: "sum",
      validate: (args) => {
        if (args.length === 2) {
          return ""
        }

        return "sum expects 2 args"
      },
      handler: (a: number, b: number) => a + b,
    })

    const out = await c.execute<number>("sum", [2, 3])
    expect(out).toBe(5)
  })

  test("prevents duplicate command ids", () => {
    const c = new CommandRegistry()
    c.register({ id: "echo", handler: (v: string) => v })
    expect(() => c.register({ id: "echo", handler: () => "x" })).toThrow("already registered")
  })
})
