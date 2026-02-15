import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { extractCheckableClaims, runAutoVerification, type SessionCheckInput } from "./verification"

describe("runtime auto verification", () => {
  test("extracts absolute and relative checkable path claims", () => {
    const claims = extractCheckableClaims(
      "Path claim: C:\\Users\\Khali\\Desktop\\start-new\\Operator-web and ./Operator-web",
      "Current directory should be /projects/_workspaces/operator",
      "C:\\Users\\Khali\\Desktop\\start-new",
    )
    const hasWindowsPath = claims.some((row) => row.kind === "path" && row.value.includes("C:\\Users\\Khali\\Desktop\\start-new\\Operator-web"))
    const hasRelativePath = claims.some((row) => row.kind === "path" && row.value.includes("./Operator-web"))
    const hasRuntimeState = claims.some((row) => row.kind === "runtime_state")
    expect(hasWindowsPath).toBe(true)
    expect(hasRelativePath).toBe(true)
    expect(hasRuntimeState).toBe(true)
  })

  test("records host verification evidence for existing and missing paths", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "auto-verify-host-"))
    const existing = path.join(root, "existing-dir")
    const missing = path.join(root, "missing-dir")
    mkdirSync(existing, { recursive: true })
    const out = await runAutoVerification({
      userText: `Check host paths: ${existing} and ${missing}`,
      draftAnswer: "",
      root,
      sessionId: "verify-host",
      allowTerminalExec: false,
      maxProbes: 2,
      timeoutMs: 6000,
    })
    const joined = out.toolEvidence.map((row) => row.detail).join("\n")
    expect(out.toolEvidence.length).toBeGreaterThanOrEqual(2)
    expect(joined.includes('"exists":true')).toBe(true)
    expect(joined.includes('"exists":false')).toBe(true)
  })

  test("session checks are bounded and only run when terminal execution is enabled", async () => {
    var calls: SessionCheckInput[] = []
    const runSessionCheck = async (input: SessionCheckInput) => {
      calls.push(input)
      return { output: "exists:directory", exitCode: 0 }
    }
    const first = await runAutoVerification(
      {
        userText: "relative path claims: ./one ./two ./three",
        draftAnswer: "",
        root: process.cwd(),
        sessionId: "verify-session",
        allowTerminalExec: true,
        maxProbes: 1,
        timeoutMs: 6000,
      },
      {
        runSessionCheck,
      },
    )
    expect(calls.length).toBe(1)
    expect(first.toolEvidence.some((row) => row.id.startsWith("tool:auto_verify_session_path_"))).toBe(true)

    calls = []
    await runAutoVerification(
      {
        userText: "relative path claims: ./one ./two",
        draftAnswer: "",
        root: process.cwd(),
        sessionId: "verify-session",
        allowTerminalExec: false,
        maxProbes: 2,
        timeoutMs: 6000,
      },
      {
        runSessionCheck,
      },
    )
    expect(calls.length).toBe(0)
  })

  test("flags identity inference from metadata as non-supportive", async () => {
    const text = "The assistant draft asserts the user's identity as Khali from session metadata."
    const claims = extractCheckableClaims(text, "", process.cwd())
    const hasIdentityMetadata = claims.some((row) => row.kind === "identity_metadata")
    expect(hasIdentityMetadata).toBe(true)

    const out = await runAutoVerification({
      userText: text,
      draftAnswer: "",
      root: process.cwd(),
      sessionId: "verify-identity",
      allowTerminalExec: false,
      maxProbes: 2,
      timeoutMs: 6000,
    })
    expect(out.identityMetadataDetected).toBe(true)
    expect(out.toolEvidence.length).toBe(0)
    expect(out.summary.toLowerCase().includes("identity inference")).toBe(true)
  })
})
