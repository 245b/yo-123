import { describe, expect, test } from "bun:test"
import { buildNoTextCompletionFallback, latestCompletedTermOutput } from "./completion"
import type { RuntimeTerm } from "./helpers"

describe("runtime completion fallback", () => {
  test("returns latest meaningful terminal output", () => {
    const terms: Record<string, RuntimeTerm> = {
      one: { id: "one", tool: "terminal_exec", input: "a", output: "running...", status: "running" },
      two: { id: "two", tool: "terminal_exec", input: "b", output: "done output", status: "done" },
    }
    const out = latestCompletedTermOutput(["one", "two"], terms, 200)
    expect(out).toBe("done output")
  })

  test("builds non-empty failed fallback with detail and output", () => {
    const terms: Record<string, RuntimeTerm> = {
      one: { id: "one", tool: "terminal_exec", input: "x", output: "ls\nfile.txt", status: "done" },
    }
    const out = buildNoTextCompletionFallback({
      status: "failed",
      detail: "Model returned no assistant text.",
      order: ["one"],
      terms,
    })
    expect(out.includes("Turn failed before a final assistant message was produced.")).toBe(true)
    expect(out.includes("Model returned no assistant text.")).toBe(true)
    expect(out.includes("Latest command output:")).toBe(true)
    expect(out.includes("file.txt")).toBe(true)
  })

  test("builds non-empty fallback even without terminal output", () => {
    const out = buildNoTextCompletionFallback({
      status: "failed",
      detail: "",
      order: [],
      terms: {},
    })
    expect(out.trim().length > 0).toBe(true)
  })
})
