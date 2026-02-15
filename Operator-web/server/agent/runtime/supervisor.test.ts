import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { RuntimeSupervisor } from "./supervisor"

var supervisor: RuntimeSupervisor | null = null

afterEach(() => {
  supervisor?.stop()
  supervisor = null
})

describe("RuntimeSupervisor", () => {
  test("creates and resumes sessions through worker bridge", async () => {
    const root = path.resolve(import.meta.dir, "../../..")
    const dataDir = mkdtempSync(path.join(tmpdir(), "runtime-supervisor-test-"))
    supervisor = new RuntimeSupervisor({
      root,
      env: {
        OPERATOR_DATA_DIR: dataDir,
        OPERATOR_EXEC_POLICY_TTL_MS: "0",
        OPERATOR_APPROVAL_POLICY: "never",
        OPERATOR_SANDBOX_MODE: "workspace-write",
        NODE_ENV: "test",
        TERM_AGENT_URL: "",
        TERM_AGENT_TOKEN: "",
      },
    })

    const list0 = await supervisor.listSessions()
    expect(list0.ok).toBe(true)

    const resumed = await supervisor.resumeSession({
      chat_id: "runtime-test",
      session_id: "runtime-test",
      mode: "chat",
    })
    expect(resumed.ok).toBe(true)

    const list1 = await supervisor.listSessions()
    expect(list1.ok).toBe(true)
    const row = list1.result && typeof list1.result === "object" ? (list1.result as { sessions?: unknown } | null) : null
    const sessions = Array.isArray(row?.sessions) ? row.sessions : []
    expect(sessions.length).toBeGreaterThanOrEqual(1)
  })
})
