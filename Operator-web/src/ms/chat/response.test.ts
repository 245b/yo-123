import { describe, expect, test } from "bun:test"
import {
  buildNoTextCompletionDiagnostic,
  extractLatestLocalPreviewUrl,
  extractLocalPreviewUrls,
  resolveExecCommandEndOutput,
  resolveExecCommandEndStatus,
} from "./response-helpers"

describe("response stream helpers", () => {
  test("builds interrupted no-text diagnostic with detail and latest output", () => {
    const out = buildNoTextCompletionDiagnostic({
      status: "interrupted",
      detail: "Turn was interrupted by user request.",
      latestOutput: "npm test\nok",
    })
    expect(out.includes("Turn was interrupted before a final assistant message was produced.")).toBe(true)
    expect(out.includes("Turn was interrupted by user request.")).toBe(true)
    expect(out.includes("Latest command output:")).toBe(true)
    expect(out.includes("npm test")).toBe(true)
  })

  test("builds generic no-text diagnostic without latest output", () => {
    const out = buildNoTextCompletionDiagnostic({
      status: "completed-without-text",
      detail: "",
      latestOutput: "running...",
    })
    expect(out).toBe("Turn completed without a final assistant message.")
  })

  test("marks empty finished command as done when previous output was running", () => {
    const out = resolveExecCommandEndOutput({
      output: "",
      previous: "running...",
    })
    expect(out).toBe("done")
  })

  test("keeps previous non-running output when end output is empty", () => {
    const out = resolveExecCommandEndOutput({
      output: "",
      previous: "command completed",
    })
    expect(out).toBe("command completed")
  })

  test("keeps command running when exec end has process id but no exit code", () => {
    const out = resolveExecCommandEndStatus({
      exitCode: undefined,
      processId: "8126",
    })
    expect(out).toBe("running")
  })

  test("extracts explicit localhost urls and normalizes 0.0.0.0", () => {
    const out = extractLocalPreviewUrls("Vite on http://0.0.0.0:5173 and API on http://127.0.0.1:3000")
    expect(out).toEqual(["http://localhost:5173/", "http://127.0.0.1:3000/"])
  })

  test("extractor ignores non-loopback urls and trims punctuation", () => {
    const out = extractLocalPreviewUrls("open https://example.com now, then http://localhost:8080/ok).")
    expect(out).toEqual(["http://localhost:8080/ok"])
  })

  test("extracts the latest localhost preview url", () => {
    const out = extractLatestLocalPreviewUrl("first http://localhost:3000 then http://127.0.0.1:4173")
    expect(out).toBe("http://127.0.0.1:4173/")
  })
})
