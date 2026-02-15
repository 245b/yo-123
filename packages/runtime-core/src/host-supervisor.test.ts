import { afterEach, describe, expect, test } from "bun:test"
import { HostSupervisor } from "./host-supervisor"
import type { HostHealthEvent } from "@operator/contracts/host-health"

var host: HostSupervisor | null = null

afterEach(() => {
  host?.stopAll()
  host = null
})

const waitForState = async (list: HostHealthEvent[], state: string, timeoutMs: number) => {
  const end = Date.now() + timeoutMs

  for (;;) {
    for (var i = 0; i < list.length; i++) {
      const row = list[i]

      if (!row) {
        continue
      }

      if (row.state !== state) {
        continue
      }

      return true
    }

    if (Date.now() > end) {
      return false
    }

    await Bun.sleep(25)
  }
}

const waitFor = async (run: () => boolean, timeoutMs: number) => {
  const end = Date.now() + timeoutMs

  for (;;) {
    if (run()) {
      return true
    }

    if (Date.now() > end) {
      return false
    }

    await Bun.sleep(25)
  }
}

describe("HostSupervisor", () => {
  test("degrades when restart budget is exhausted", async () => {
    host = new HostSupervisor()
    const list: HostHealthEvent[] = []
    const drop = host.onHealth((event) => {
      list.push(event)
    })

    await host.start({
      role: "extension-host",
      cmd: ["bun", "-e", "setTimeout(() => process.exit(1), 20)"],
      restartLimit: 1,
      restartWindowMs: 2000,
      heartbeatTimeoutMs: 5000,
    })

    const ok = await waitForState(list, "degraded", 2000)
    drop.dispose()
    expect(ok).toBe(true)
  })

  test("restarts a running host on request", async () => {
    host = new HostSupervisor()
    const list: HostHealthEvent[] = []
    const drop = host.onHealth((event) => {
      list.push(event)
    })

    const hb = '{"id":"hb","role":"extension-host","channel":"extension","method":"heartbeat","ts":"2026-01-01T00:00:00.000Z","requestId":"hb","sessionId":"operator","version":"v1","kind":"event","event":"heartbeat","chat_id":"operator","payload":{"type":"warning","chat_id":"operator","message":"hb"}}'
    await host.start({
      role: "extension-host",
      cmd: ["bun", "-e", `setInterval(() => console.log(${JSON.stringify(hb)}), 40)`],
      restartLimit: 5,
      restartWindowMs: 60000,
      heartbeatTimeoutMs: 2000,
    })

    const readyA = await waitForState(list, "ready", 1000)
    const kicked = host.restart("extension-host", "test_restart")
    const seenRestart = await waitFor(() => {
      for (var i = 0; i < list.length; i++) {
        const row = list[i]

        if (!row) {
          continue
        }

        if (row.restartCount < 1) {
          continue
        }

        return true
      }

      return false
    }, 1500)
    const readyB = await waitForState(list, "ready", 1500)
    drop.dispose()
    expect(readyA).toBe(true)
    expect(kicked).toBe(true)
    expect(seenRestart).toBe(true)
    expect(readyB).toBe(true)
  })
})
