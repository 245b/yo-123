import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { RuntimeSupervisor } from "./supervisor"

var supervisor: RuntimeSupervisor | null = null

afterEach(() => {
  supervisor?.stop()
  supervisor = null
})

const mkDataDir = () => {
  return mkdtempSync(path.join(tmpdir(), "runtime-policy-"))
}

const writePolicy = async (dataDir: string, rules: string) => {
  const dir = path.join(dataDir, "rules")
  mkdirSync(dir, { recursive: true })
  const fp = path.join(dir, "policy.rules")
  await Bun.write(fp, rules)
  return fp
}

const waitFor = async (predicate: () => boolean, timeoutMs: number) => {
  const end = Date.now() + Math.max(0, timeoutMs)

  for (;;) {
    if (predicate()) {
      return
    }

    if (Date.now() > end) {
      throw new Error("Timed out waiting for runtime event")
    }

    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

describe("runtime execpolicy enforcement", () => {
  test("exec_command is blocked by forbidden execpolicy rule", async () => {
    const root = path.resolve(import.meta.dir, "../../..")
    const dataDir = mkDataDir()
    await writePolicy(dataDir, 'prefix_rule(pattern=["echo"], decision="forbidden", justification="no echo")\n')
    supervisor = new RuntimeSupervisor({
      root,
      env: {
        OPERATOR_DATA_DIR: dataDir,
        OPERATOR_EXEC_POLICY_TTL_MS: "0",
        OPERATOR_APPROVAL_POLICY: "on-request",
        OPERATOR_SANDBOX_MODE: "workspace-write",
        OPERATOR_APPROVAL_TIMEOUT_MS: "5000",
        NODE_ENV: "test",
        TERM_AGENT_URL: "",
        TERM_AGENT_TOKEN: "",
      },
    })

    const res = await supervisor.execCommand({ chat_id: "policy-forbidden", command: "echo test" })
    expect(res.ok).toBe(true)
    const row = res.result && typeof res.result === "object" ? (res.result as Record<string, unknown>) : null
    expect(row?.exit_code).toBe(126)
    expect(row?.errorCode).toBe("POLICY_FORBIDDEN")
    const out0 = typeof row?.output === "string" ? row.output : ""
    expect(out0.toLowerCase().includes("blocked")).toBe(true)
  })

  test("exec_command requests approval and runs on approve", async () => {
    const root = path.resolve(import.meta.dir, "../../..")
    const dataDir = mkDataDir()
    await writePolicy(dataDir, 'prefix_rule(pattern=["echo"], decision="prompt", justification="echo requires approval")\n')
    supervisor = new RuntimeSupervisor({
      root,
      env: {
        OPERATOR_DATA_DIR: dataDir,
        OPERATOR_EXEC_POLICY_TTL_MS: "0",
        OPERATOR_APPROVAL_POLICY: "on-request",
        OPERATOR_SANDBOX_MODE: "workspace-write",
        OPERATOR_APPROVAL_TIMEOUT_MS: "5000",
        NODE_ENV: "test",
        TERM_AGENT_URL: "",
        TERM_AGENT_TOKEN: "",
      },
    })

    const chatId = "policy-approve"
    var callId = ""
    const unsubscribe = supervisor.subscribe(chatId, (_id, payload) => {
      if (payload.type !== "tool_approval_requested") {
        return
      }

      const row = payload as Record<string, unknown>
      const v0 = typeof row.call_id === "string" ? row.call_id : ""
      const v = v0.trim()

      if (!v) {
        return
      }

      callId = v
    })

    const pending = supervisor.execCommand({ chat_id: chatId, command: "echo test" })
    await waitFor(() => !!callId, 8000)
    const approved = await supervisor.approve({ chat_id: chatId, call_id: callId, approved: true })
    expect(approved.ok).toBe(true)
    const res = await pending
    expect(res.ok).toBe(true)
    const row = res.result && typeof res.result === "object" ? (res.result as Record<string, unknown>) : null
    expect(row?.exit_code).toBe(0)
    const out0 = typeof row?.output === "string" ? row.output : ""
    expect(out0.includes("Simulated exec ok: echo test")).toBe(true)
    unsubscribe()
  })

  test("exec_command requests approval and blocks on deny", async () => {
    const root = path.resolve(import.meta.dir, "../../..")
    const dataDir = mkDataDir()
    await writePolicy(dataDir, 'prefix_rule(pattern=["echo"], decision="prompt", justification="echo requires approval")\n')
    supervisor = new RuntimeSupervisor({
      root,
      env: {
        OPERATOR_DATA_DIR: dataDir,
        OPERATOR_EXEC_POLICY_TTL_MS: "0",
        OPERATOR_APPROVAL_POLICY: "on-request",
        OPERATOR_SANDBOX_MODE: "workspace-write",
        OPERATOR_APPROVAL_TIMEOUT_MS: "5000",
        NODE_ENV: "test",
        TERM_AGENT_URL: "",
        TERM_AGENT_TOKEN: "",
      },
    })

    const chatId = "policy-deny"
    var callId = ""
    const unsubscribe = supervisor.subscribe(chatId, (_id, payload) => {
      if (payload.type !== "tool_approval_requested") {
        return
      }

      const row = payload as Record<string, unknown>
      const v0 = typeof row.call_id === "string" ? row.call_id : ""
      const v = v0.trim()

      if (!v) {
        return
      }

      callId = v
    })

    const pending = supervisor.execCommand({ chat_id: chatId, command: "echo test" })
    await waitFor(() => !!callId, 8000)
    const denied = await supervisor.approve({ chat_id: chatId, call_id: callId, approved: false })
    expect(denied.ok).toBe(true)
    const res = await pending
    expect(res.ok).toBe(true)
    const row = res.result && typeof res.result === "object" ? (res.result as Record<string, unknown>) : null
    expect(row?.exit_code).toBe(1)
    expect(row?.errorCode).toBe("APPROVAL_DENIED")
    const out0 = typeof row?.output === "string" ? row.output : ""
    expect(out0).toBe("Tool call denied by user")
    unsubscribe()
  })
})

