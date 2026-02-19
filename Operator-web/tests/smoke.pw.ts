import { expect, test, type Frame, type Page } from "@playwright/test"

const waitForSnapshotFrame = async (page: Page, base: string) => {
  await page.goto(base, { waitUntil: "domcontentloaded" })
  await page.waitForSelector('iframe[title="snapshot"]', { timeout: 20_000 })

  var frame = page.frames().find((x) => (x.url() || "").includes("/snapshot.html")) ?? null

  for (var i = 0; i < 200 && !frame; i++) {
    await page.waitForTimeout(100)
    frame = page.frames().find((x) => (x.url() || "").includes("/snapshot.html")) ?? null
  }

  if (!frame) {
    throw new Error("snapshot iframe not found")
  }

  await frame.waitForSelector("#chat-home-view-container textarea", { timeout: 20_000 })
  return frame as Frame
}

const installFakeWsScenario = async (page: Page, scenario: string) => {
  await page.addInitScript((inputScenario) => {
    const mode0 = typeof inputScenario === "string" ? inputScenario : ""
    const mode = mode0.trim()
    const store = window as unknown as { __ms_submit_count?: number; WebSocket?: unknown }
    store.__ms_submit_count = 0

    const emitCaps = (emit: (obj: unknown) => void, chatId: string) => {
      emit({
        type: "runtime_capabilities",
        chat_id: chatId,
        capabilities: { approvals: true, request_user_input: true, resize_pty: true, feedback: true },
      })
    }

    class FakeWebSocket {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
      url: string
      readyState = FakeWebSocket.CONNECTING
      private listeners: Record<string, Array<(ev: unknown) => void>> = {}

      constructor(url: string) {
        this.url = url
        setTimeout(() => {
          this.readyState = FakeWebSocket.OPEN
          this._emit("open", {})
        }, 10)
      }

      addEventListener(type: string, fn: (ev: unknown) => void) {
        const list = this.listeners[type] || []
        list.push(fn)
        this.listeners[type] = list
      }

      removeEventListener(type: string, fn: (ev: unknown) => void) {
        const list = this.listeners[type] || []
        this.listeners[type] = list.filter((x) => x !== fn)
      }

      send(data: unknown) {
        const text = typeof data === "string" ? data : ""
        const msg = text
          ? (() => {
              try {
                return JSON.parse(text)
              } catch {
                return null
              }
            })()
          : null

        if (!msg || msg.type !== "submit_turn") {
          return
        }

        const chatId = "pw-chat"
        const turnId = "pw-turn"
        const next = (store.__ms_submit_count ?? 0) + 1
        store.__ms_submit_count = next
        const emit = (obj: unknown) => this._emit("message", { data: JSON.stringify(obj) })

        if (mode === "transient-retry") {
          if (next === 1) {
            setTimeout(() => this.close(), 0)
            return
          }

          emitCaps(emit, chatId)
          emit({ type: "task_complete", chat_id: chatId, turn_id: turnId, last_agent_message: "retry recovered" })
          return
        }

        if (mode === "runtime-failed") {
          emitCaps(emit, chatId)
          emit({ type: "task_started", chat_id: chatId, model_context_window: 128000 })
          emit({ type: "turn_status", chat_id: chatId, turn_id: turnId, status: "running" })
          emit({
            type: "turn_status",
            chat_id: chatId,
            turn_id: turnId,
            status: "failed",
            detail: "runtime failure for retry gate",
          })
          return
        }

        if (mode === "exec-degraded") {
          emitCaps(emit, chatId)
          emit({ type: "task_started", chat_id: chatId, model_context_window: 128000 })
          emit({ type: "turn_status", chat_id: chatId, turn_id: turnId, status: "running" })
          emit({
            type: "runtime_host_health",
            chat_id: chatId,
            host_role: "exec-host",
            state: "degraded",
            heartbeat_lag_ms: 22000,
            restart_count: 3,
            restart_limit: 3,
            reason: "restart_budget_exhausted",
          })
          return
        }
      }

      close() {
        if (this.readyState === FakeWebSocket.CLOSED) {
          return
        }

        this.readyState = FakeWebSocket.CLOSED
        this._emit("close", {})
      }

      _emit(type: string, ev: unknown) {
        const list = this.listeners[type] || []

        for (var i = 0; i < list.length; i++) {
          const fn = list[i] ?? null
          fn?.(ev)
        }
      }
    }

    ;(store as { WebSocket?: unknown }).WebSocket = FakeWebSocket
  }, scenario)
}

test("health endpoint is reachable", async ({ request, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  const res = await request.get(`${base}/api/health`)
  expect(res.ok()).toBe(true)
  const body = (await res.json()) as {
    ok?: unknown
    ts?: unknown
    requestId?: unknown
    data?: { status?: unknown }
  }
  expect(body.ok).toBe(true)
  expect(typeof body.ts).toBe("string")
  expect(typeof body.requestId).toBe("string")
  expect(body.data?.status).toBe("ok")
})

test("deprecated chat endpoint returns 410", async ({ request, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  const res = await request.post(`${base}/api/chat`, {
    data: {
      messages: [{ role: "user", content: "ping" }],
    },
  })
  expect(res.status()).toBe(410)
  const body = (await res.json()) as {
    ok?: unknown
    error?: {
      code?: unknown
      message?: unknown
      requestId?: unknown
      ts?: unknown
    }
  }
  expect(body.ok).toBe(false)
  expect(body.error?.code).toBe("chat_route_removed")
  expect(typeof body.error?.message).toBe("string")
  expect(typeof body.error?.requestId).toBe("string")
  expect(typeof body.error?.ts).toBe("string")
})

test("home page renders", async ({ page, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  await page.goto(base, { waitUntil: "domcontentloaded" })
  await expect(page).toHaveURL(new RegExp("^http://127\\.0\\.0\\.1:[0-9]+/?$"))
  await expect(page.locator("body")).toHaveCount(1)
})

test("runtime health + exec_process_exit render without UI exceptions", async ({ page, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  await page.addInitScript(() => {
    const mk = (ws: unknown) => {
      const w = ws as { _emit?: (t: string, ev: unknown) => void; _send?: (obj: unknown) => void }

      if (!w || typeof w._emit !== "function") {
        return
      }

      const emit = (obj: unknown) => w._emit?.("message", { data: JSON.stringify(obj) })

      const chatId = "pw-chat"
      const turnId = "pw-turn"
      const callId = "call-1"
      const processId = "proc-1"

      emit({
        type: "runtime_capabilities",
        chat_id: chatId,
        capabilities: { approvals: true, request_user_input: true, resize_pty: true, feedback: true },
      })
      emit({
        type: "runtime_host_health",
        chat_id: chatId,
        host_role: "exec-host",
        state: "ready",
        heartbeat_lag_ms: 0,
        restart_count: 0,
        restart_limit: 3,
      })
      emit({
        type: "runtime_host_health",
        chat_id: chatId,
        host_role: "pty-host",
        state: "ready",
        heartbeat_lag_ms: 0,
        restart_count: 0,
        restart_limit: 5,
      })
      emit({
        type: "exec_command_begin",
        chat_id: chatId,
        turn_id: turnId,
        call_id: callId,
        command: "echo hi",
        process_id: processId,
        tool_name: "terminal_exec",
      })
      emit({ type: "exec_command_end", chat_id: chatId, turn_id: turnId, call_id: callId, process_id: processId })
      emit({ type: "exec_process_exit", chat_id: chatId, process_id: processId, exit_code: 0, output: "hi\n", wall_time_ms: 123, final: true })
      emit({ type: "task_complete", chat_id: chatId, turn_id: turnId, last_agent_message: "done" })
    }

    class FakeWebSocket {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSING = 2
      static CLOSED = 3
      url: string
      readyState = FakeWebSocket.CONNECTING
      private listeners: Record<string, Array<(ev: unknown) => void>> = {}

      constructor(url: string) {
        this.url = url
        setTimeout(() => {
          this.readyState = FakeWebSocket.OPEN
          this._emit("open", {})
        }, 10)
      }

      addEventListener(type: string, fn: (ev: unknown) => void) {
        const list = this.listeners[type] || []
        list.push(fn)
        this.listeners[type] = list
      }

      removeEventListener(type: string, fn: (ev: unknown) => void) {
        const list = this.listeners[type] || []
        this.listeners[type] = list.filter((x) => x !== fn)
      }

      send(data: unknown) {
        const text = typeof data === "string" ? data : ""
        const msg = text
          ? (() => {
              try {
                return JSON.parse(text)
              } catch {
                return null
              }
            })()
          : null

        if (msg && msg.type === "submit_turn") {
          mk(this)
        }
      }

      close() {
        if (this.readyState === FakeWebSocket.CLOSED) {
          return
        }

        this.readyState = FakeWebSocket.CLOSED
        this._emit("close", {})
      }

      _emit(type: string, ev: unknown) {
        const list = this.listeners[type] || []

        for (var i = 0; i < list.length; i++) {
          const fn = list[i] ?? null
          fn?.(ev)
        }
      }
    }

    ;(window as unknown as { WebSocket?: unknown }).WebSocket = FakeWebSocket
  })

  await page.goto(base, { waitUntil: "domcontentloaded" })

  await page.waitForSelector('iframe[title="snapshot"]', { timeout: 20_000 })

  var frame = page.frames().find((x) => (x.url() || "").includes("/snapshot.html")) ?? null

  for (var i = 0; i < 200 && !frame; i++) {
    await page.waitForTimeout(100)
    frame = page.frames().find((x) => (x.url() || "").includes("/snapshot.html")) ?? null
  }

  if (!frame) {
    throw new Error("snapshot iframe not found")
  }

  await frame.waitForSelector("#chat-home-view-container textarea", { timeout: 20_000 })

  await frame.fill("#chat-home-view-container textarea", "ping")
  const send = frame.locator('button[data-ms-send="1"]')
  await expect(send).toHaveCount(1)
  await send.click()

  await expect(frame.locator("#__ms_runtime_status")).toContainText("Runtime", { timeout: 20_000 })
  await expect(frame.locator("#__ms_runtime_status")).toContainText("exec-host")
  await expect(frame.locator('[data-ms-term-id=\"call-1\"] [data-ms-term-status=\"1\"]')).toHaveText("done", { timeout: 20_000 })
})

test("turn_status failed ends current turn as error and does not auto-retry", async ({ page, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  await installFakeWsScenario(page, "runtime-failed")
  const frame = await waitForSnapshotFrame(page, base)

  await frame.fill("#chat-home-view-container textarea", "ping")
  await frame.locator('button[data-ms-send="1"]').click()

  await expect(frame.locator("#__ms_ds_list [data-err=\"1\"]")).toContainText("runtime failure for retry gate", { timeout: 20_000 })
  const count = await frame.evaluate(() => {
    const w = window as unknown as { __ms_submit_count?: number }
    const n = w.__ms_submit_count
    return typeof n === "number" ? n : 0
  })
  expect(count).toBe(1)
})

test("degraded exec-host fails active turn immediately", async ({ page, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  await installFakeWsScenario(page, "exec-degraded")
  const frame = await waitForSnapshotFrame(page, base)

  await frame.fill("#chat-home-view-container textarea", "ping")
  await frame.locator('button[data-ms-send="1"]').click()

  await expect(frame.locator("#__ms_ds_list [data-err=\"1\"]")).toContainText("restart_budget_exhausted", { timeout: 20_000 })
  const count = await frame.evaluate(() => {
    const w = window as unknown as { __ms_submit_count?: number }
    const n = w.__ms_submit_count
    return typeof n === "number" ? n : 0
  })
  expect(count).toBe(1)
})

test("transport disconnect retries once and then succeeds", async ({ page, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  await installFakeWsScenario(page, "transient-retry")
  const frame = await waitForSnapshotFrame(page, base)

  await frame.fill("#chat-home-view-container textarea", "ping")
  await frame.locator('button[data-ms-send="1"]').click()

  await expect(frame.locator("#__ms_ds_list")).toContainText("retry recovered", { timeout: 20_000 })
  const count = await frame.evaluate(() => {
    const w = window as unknown as { __ms_submit_count?: number }
    const n = w.__ms_submit_count
    return typeof n === "number" ? n : 0
  })
  expect(count).toBe(2)
})
