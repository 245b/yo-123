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

const mkDataDir = () => {
  return mkdtempSync(path.join(tmpdir(), "runtime-persist-"))
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

const waitForFile = async (fp: string, timeoutMs: number) => {
  const end = Date.now() + Math.max(0, timeoutMs)

  for (;;) {
    const ok = await Bun.file(fp).exists()

    if (ok) {
      return
    }

    if (Date.now() > end) {
      throw new Error(`Timed out waiting for file: ${fp}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

const waitForJsonl = async (fp: string, needle: string, timeoutMs: number) => {
  const end = Date.now() + Math.max(0, timeoutMs)

  for (;;) {
    const ok = await Bun.file(fp).exists()

    if (ok) {
      const text = await Bun.file(fp).text()

      if (text.includes(needle)) {
        return
      }
    }

    if (Date.now() > end) {
      throw new Error(`Timed out waiting for JSONL: ${fp}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

describe("runtime persistence", () => {
  test("turn rollouts and snapshot persist and resume_session hydrates after restart", async () => {
    const root = path.resolve(import.meta.dir, "../../..")
    const dataDir = mkDataDir()
    const chatId = "persist-test"

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

    var completed = false
    var gotTurnId = ""
    const unsubscribe = supervisor.subscribe(chatId, (_id, payload) => {
      if (payload.type !== "turn_complete") {
        return
      }

      const row = payload as Record<string, unknown>
      const t0 = typeof row.turn_id === "string" ? row.turn_id : ""
      const t = t0.trim()

      if (!t) {
        return
      }

      if (gotTurnId && t !== gotTurnId) {
        return
      }

      completed = true
    })

    const submit = await supervisor.submitUserTurn({
      chat_id: chatId,
      session_id: chatId,
      mode: "chat",
      messages: [{ role: "user", content: "ping" }],
      allow_terminal_exec: false,
    })
    expect(submit.ok).toBe(true)
    const out = submit.result && typeof submit.result === "object" ? (submit.result as Record<string, unknown>) : null
    const turn0 = typeof out?.turn_id === "string" ? out.turn_id : ""
    gotTurnId = turn0.trim()
    expect(gotTurnId).not.toBe("")

    await waitFor(() => completed, 12000)
    unsubscribe()

    const base = path.join(dataDir, "sessions", chatId)
    const rollout = path.join(base, `${gotTurnId}.jsonl`)
    const snapshot = path.join(base, "snapshot.json")
    await waitForFile(rollout, 8000)
    await waitForFile(snapshot, 8000)
    await waitForJsonl(rollout, '"type":"turn_complete"', 8000)

    supervisor.stop()
    supervisor = null

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

    const resumed = await supervisor.resumeSession({
      chat_id: chatId,
      session_id: chatId,
      mode: "chat",
    })
    expect(resumed.ok).toBe(true)
    const res0 = resumed.result && typeof resumed.result === "object" ? (resumed.result as Record<string, unknown>) : null
    const msgs0 = Array.isArray(res0?.messages) ? res0?.messages : []
    const msgs = msgs0.filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    const hit = msgs.some((row) => {
      const role = typeof row.role === "string" ? row.role : ""
      const content = typeof row.content === "string" ? row.content : ""
      return role === "assistant" && content.includes("Test mode: turn completed.")
    })
    expect(hit).toBe(true)
  })
})
