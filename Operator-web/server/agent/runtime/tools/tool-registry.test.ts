import { describe, expect, test } from "bun:test"
import { createToolGate } from "./tool-gate"
import { ToolRegistry } from "./tool-registry"

describe("ToolRegistry", () => {
  test("serializes mutating tool calls via gate", async () => {
    const gate = createToolGate()
    const reg = new ToolRegistry(gate)
    const events: string[] = []

    reg.register("fs_write", {
      run: async (inv) => {
        events.push(`${inv.meta.id}:start`)
        await Bun.sleep(30)
        events.push(`${inv.meta.id}:end`)
        return { ok: true }
      },
    })

    await Promise.all([
      reg.dispatch("fs_write", {}, { id: "a" }),
      reg.dispatch("fs_write", {}, { id: "b" }),
    ])

    const sa = events.indexOf("a:start")
    const ea = events.indexOf("a:end")
    const sb = events.indexOf("b:start")
    const eb = events.indexOf("b:end")

    expect(sa).toBeGreaterThanOrEqual(0)
    expect(ea).toBeGreaterThanOrEqual(0)
    expect(sb).toBeGreaterThanOrEqual(0)
    expect(eb).toBeGreaterThanOrEqual(0)

    const aThenB = sa < ea && ea < sb && sb < eb
    const bThenA = sb < eb && eb < sa && sa < ea
    expect(aThenB || bThenA).toBe(true)
  })

  test("does not serialize non-mutating tool calls", async () => {
    const gate = createToolGate()
    const reg = new ToolRegistry(gate)
    const events: string[] = []
    var resolveBoth: (() => void) | null = null
    const both = new Promise<void>((r) => {
      resolveBoth = r
    })
    var started = 0

    reg.register("fs_read", {
      run: async (inv) => {
        events.push(`${inv.meta.id}:start`)
        started += 1

        if (started === 2 && resolveBoth) {
          resolveBoth()
        }

        await both
        events.push(`${inv.meta.id}:end`)
        return { ok: true }
      },
    })

    await Promise.all([
      reg.dispatch("fs_read", {}, { id: "a" }),
      reg.dispatch("fs_read", {}, { id: "b" }),
    ])

    const firstEnd = events.findIndex((x) => x.endsWith(":end"))
    expect(firstEnd).toBeGreaterThanOrEqual(2)
  })

  test("returns error for unknown tool", async () => {
    const gate = createToolGate()
    const reg = new ToolRegistry(gate)
    const out = await reg.dispatch("nope", {}, { id: "x" })
    const row = out && typeof out === "object" ? (out as { ok?: unknown; error?: unknown } | null) : null
    expect(row?.ok).toBe(false)
    expect(typeof row?.error).toBe("string")
  })
})

