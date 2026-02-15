import { expect, test } from "@playwright/test"

const waitForUiShell = async (page: import("@playwright/test").Page) => {
  var end = Date.now() + 12000

  while (Date.now() < end) {
    const shell = await page.locator('[data-ms-chat-shell="1"]').count()
    const panel = await page.locator("[data-ms-right-panel]").count()

    if (shell === 1 && panel === 1) {
      return
    }

    await page.waitForTimeout(120)
  }

  await page.reload({ waitUntil: "domcontentloaded" })
  end = Date.now() + 12000

  while (Date.now() < end) {
    const shell = await page.locator('[data-ms-chat-shell="1"]').count()
    const panel = await page.locator("[data-ms-right-panel]").count()

    if (shell === 1 && panel === 1) {
      return
    }

    await page.waitForTimeout(120)
  }

  const shell = await page.locator('[data-ms-chat-shell="1"]').count()
  const panel = await page.locator("[data-ms-right-panel]").count()
  expect(shell).toBe(1)
  expect(panel).toBe(1)
}

const snapshotFrame = async (page: import("@playwright/test").Page) => {
  await expect
    .poll(() => {
      const list = page.frames()

      for (var i = 0; i < list.length; i++) {
        const frame = list[i]

        if (!frame) {
          continue
        }

        if (!frame.url().includes("/snapshot.html")) {
          continue
        }

        return "ready"
      }

      return ""
    })
    .toBe("ready")

  const list = page.frames()

  for (var i = 0; i < list.length; i++) {
    const frame = list[i]

    if (!frame) {
      continue
    }

    if (!frame.url().includes("/snapshot.html")) {
      continue
    }

    return frame
  }

  throw new Error("snapshot frame not found")
}

const postTermEvent = async (
  page: import("@playwright/test").Page,
  payload: {
    type: "ms-agent-term-event"
    chatId: string
    term: { id: string; tool: string; input: string; output: string; status: "running" | "done" | "failed" }
    ts: number
  },
) => {
  const frame = await snapshotFrame(page)
  await frame.evaluate((row) => {
    window.parent.postMessage(row, "*")
  }, payload)
}

const postRightOpenEvent = async (
  page: import("@playwright/test").Page,
  payload: {
    type: "ms-right-panel-open-request"
    chatId: string
    reason: string
    ts: number
  },
) => {
  const frame = await snapshotFrame(page)
  await frame.evaluate((row) => {
    window.parent.postMessage(row, "*")
  }, payload)
}

test("right panel auto-opens and persists fs-created artifacts", async ({ page, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  const chatId = "right-panel-chat-fs"
  await page.addInitScript(() => {
    const cur = window.localStorage.getItem("ms_open_right")

    if (cur) {
      return
    }

    window.localStorage.setItem("ms_open_right", "0")
  })
  await page.goto(`${base}/t/${chatId}`, { waitUntil: "domcontentloaded" })

  const panel = page.locator("[data-ms-right-panel]")
  const folder = page.locator('[data-ms-node="operator/new-folder"][data-ms-kind="folder"]')
  const file = page.locator('[data-ms-node="operator/new-folder/main.ts"][data-ms-kind="file"]')
  const editor = page.locator('[data-ms-editor="1"]')

  await waitForUiShell(page)
  await expect(panel).toHaveAttribute("data-ms-right-panel", "0")

  await postTermEvent(page, {
    type: "ms-agent-term-event",
    chatId,
    term: {
      id: "mkdir-1",
      tool: "fs_mkdir",
      input: 'fs_mkdir {"path":"operator/new-folder"}',
      output: "running...",
      status: "running",
    },
    ts: Date.now(),
  })

  await expect(panel).toHaveAttribute("data-ms-right-panel", "1")
  await expect(folder).toBeVisible()

  await postTermEvent(page, {
    type: "ms-agent-term-event",
    chatId,
    term: {
      id: "mkdir-1",
      tool: "fs_mkdir",
      input: 'fs_mkdir {"path":"operator/new-folder"}',
      output:
        '{"ok":true,"result":{"path":"operator/new-folder","before":{"exists":false},"after":{"exists":true,"path":"operator/new-folder"}}}',
      status: "done",
    },
    ts: Date.now(),
  })

  await postTermEvent(page, {
    type: "ms-agent-term-event",
    chatId,
    term: {
      id: "write-1",
      tool: "fs_write",
      input: 'fs_write {"path":"operator/new-folder/main.ts","content":"export const n = 1;\\n"}',
      output:
        '{"ok":true,"result":{"path":"operator/new-folder/main.ts","before":{"exists":false},"after":{"exists":true,"path":"operator/new-folder/main.ts"}}}',
      status: "done",
    },
    ts: Date.now(),
  })

  await expect(panel).toHaveAttribute("data-ms-right-panel", "1")
  await expect(panel.getByText("operator/").first()).toBeVisible()
  await expect(folder).toBeVisible()
  await expect(file).toBeVisible()

  await folder.click()
  await expect(file).toBeHidden()
  await folder.click()
  await expect(file).toBeVisible()
  await file.click()
  await expect(editor).toContainText("export const n = 1;")

  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(panel).toHaveAttribute("data-ms-right-panel", "1")
  await expect(file).toBeVisible()
  await expect(editor).toContainText("export const n = 1;")
})

test("right panel detects shell create heuristics", async ({ page, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  const chatId = "right-panel-chat-shell"
  await page.addInitScript(() => {
    const cur = window.localStorage.getItem("ms_open_right")

    if (cur) {
      return
    }

    window.localStorage.setItem("ms_open_right", "0")
  })
  await page.goto(`${base}/t/${chatId}`, { waitUntil: "domcontentloaded" })

  const panel = page.locator("[data-ms-right-panel]")
  await waitForUiShell(page)
  await expect(panel).toHaveAttribute("data-ms-right-panel", "0")

  await postTermEvent(page, {
    type: "ms-agent-term-event",
    chatId,
    term: {
      id: "shell-1",
      tool: "terminal",
      input: "mkdir src && touch src/a.ts && echo hi > src/b.txt",
      output: "done",
      status: "done",
    },
    ts: Date.now(),
  })

  await expect(panel).toHaveAttribute("data-ms-right-panel", "1")
  await expect(page.locator('[data-ms-node="src"][data-ms-kind="folder"]')).toBeVisible()
  await expect(page.locator('[data-ms-node="src/a.ts"][data-ms-kind="file"]')).toBeVisible()
  await expect(page.locator('[data-ms-node="src/b.txt"][data-ms-kind="file"]')).toBeVisible()
})

test("right panel opens when agent enters a session folder", async ({ page, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  const chatId = "right-panel-chat-cd"
  await page.addInitScript(() => {
    const cur = window.localStorage.getItem("ms_open_right")

    if (cur) {
      return
    }

    window.localStorage.setItem("ms_open_right", "0")
  })
  await page.goto(`${base}/t/${chatId}`, { waitUntil: "domcontentloaded" })

  const panel = page.locator("[data-ms-right-panel]")
  await waitForUiShell(page)
  await expect(panel).toHaveAttribute("data-ms-right-panel", "0")

  await postTermEvent(page, {
    type: "ms-agent-term-event",
    chatId,
    term: {
      id: "cd-1",
      tool: "terminal",
      input: "cd chat-app",
      output: "running...",
      status: "running",
    },
    ts: Date.now(),
  })

  await expect(panel).toHaveAttribute("data-ms-right-panel", "1")
  await expect(page.getByText("No artifacts yet.")).toBeVisible()
})

test("right panel opens from admin chat override event", async ({ page, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  const chatId = "right-panel-admin-open"
  await page.addInitScript(() => {
    const cur = window.localStorage.getItem("ms_open_right")

    if (cur) {
      return
    }

    window.localStorage.setItem("ms_open_right", "0")
  })
  await page.goto(`${base}/t/${chatId}`, { waitUntil: "domcontentloaded" })

  const panel = page.locator("[data-ms-right-panel]")
  await waitForUiShell(page)
  await expect(panel).toHaveAttribute("data-ms-right-panel", "0")

  await postRightOpenEvent(page, {
    type: "ms-right-panel-open-request",
    chatId,
    reason: "admin_chat",
    ts: Date.now(),
  })

  await expect(panel).toHaveAttribute("data-ms-right-panel", "1")
})

test("right panel open shifts chat UI left by 20 percent", async ({ page, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  const chatId = "right-panel-chat-shift-20"
  await page.addInitScript(() => {
    const cur = window.localStorage.getItem("ms_open_right")

    if (cur) {
      return
    }

    window.localStorage.setItem("ms_open_right", "0")
  })
  await page.goto(`${base}/t/${chatId}`, { waitUntil: "domcontentloaded" })

  const panel = page.locator("[data-ms-right-panel]")
  const shell = page.locator('[data-ms-chat-shell="1"]')
  const fill = page.locator('[data-ms-right-fill="1"]')
  await waitForUiShell(page)

  const before = await shell.evaluate((el) => Math.round(el.getBoundingClientRect().width))
  await expect(panel).toHaveAttribute("data-ms-right-panel", "0")

  await postTermEvent(page, {
    type: "ms-agent-term-event",
    chatId,
    term: {
      id: "mkdir-20",
      tool: "terminal",
      input: "mkdir shift-test",
      output: "running...",
      status: "running",
    },
    ts: Date.now(),
  })

  await expect(panel).toHaveAttribute("data-ms-right-panel", "1")
  await expect(fill).toHaveCount(1)
  await expect(fill).toHaveAttribute("data-ms-right-fill", "1")
  await expect
    .poll(async () => await shell.evaluate((el) => Math.round(el.getBoundingClientRect().width)))
    .toBeLessThan(Math.round(before * 0.85))
})

test("right panel editor auto-focuses newest created file in real time", async ({ page, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  const chatId = "right-panel-chat-live-focus"
  await page.addInitScript(() => {
    const cur = window.localStorage.getItem("ms_open_right")

    if (cur) {
      return
    }

    window.localStorage.setItem("ms_open_right", "0")
  })
  await page.goto(`${base}/t/${chatId}`, { waitUntil: "domcontentloaded" })

  const panel = page.locator("[data-ms-right-panel]")
  const editor = page.locator('[data-ms-editor="1"]')
  const a = page.locator('[data-ms-node="src/a.ts"][data-ms-kind="file"]')
  const b = page.locator('[data-ms-node="src/b.ts"][data-ms-kind="file"]')

  await waitForUiShell(page)

  await postTermEvent(page, {
    type: "ms-agent-term-event",
    chatId,
    term: {
      id: "a-1",
      tool: "fs_write",
      input: 'fs_write {"path":"src/a.ts","content":"export const a = 1;\\n"}',
      output:
        '{"ok":true,"result":{"path":"src/a.ts","before":{"exists":false},"after":{"exists":true,"path":"src/a.ts"}}}',
      status: "done",
    },
    ts: Date.now(),
  })

  await expect(panel).toHaveAttribute("data-ms-right-panel", "1")
  await expect(a).toBeVisible()
  await a.click()
  await expect(editor).toContainText("export const a = 1;")

  await postTermEvent(page, {
    type: "ms-agent-term-event",
    chatId,
    term: {
      id: "b-1",
      tool: "fs_write",
      input: 'fs_write {"path":"src/b.ts","content":"export const b = 2;\\n"}',
      output:
        '{"ok":true,"result":{"path":"src/b.ts","before":{"exists":false},"after":{"exists":true,"path":"src/b.ts"}}}',
      status: "running",
    },
    ts: Date.now(),
  })

  await expect(b).toBeVisible()
  await expect(editor).toContainText("export const b = 2;")
})

test("right panel can be resized by dragging", async ({ page, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  const chatId = "right-panel-chat-resize"
  await page.addInitScript(() => {
    const boot = window.localStorage.getItem("ms_right_resize_boot") ?? ""

    if (boot === "1") {
      return
    }

    window.localStorage.setItem("ms_right_resize_boot", "1")
    window.localStorage.setItem("ms_open_right", "0")
    window.localStorage.removeItem("ms_right_w")
  })
  await page.goto(`${base}/t/${chatId}`, { waitUntil: "domcontentloaded" })

  const panel = page.locator("[data-ms-right-panel]")
  const handle = page.locator('[data-ms-right-resize="1"]')
  await waitForUiShell(page)
  await expect(panel).toHaveAttribute("data-ms-right-panel", "0")

  await postTermEvent(page, {
    type: "ms-agent-term-event",
    chatId,
    term: {
      id: "mk-1",
      tool: "terminal",
      input: "mkdir api",
      output: "running...",
      status: "running",
    },
    ts: Date.now(),
  })

  await expect(panel).toHaveAttribute("data-ms-right-panel", "1")
  await expect(handle).toBeVisible()

  const before = await panel.evaluate((el) => Math.round(el.getBoundingClientRect().width))
  const box = await handle.boundingBox()

  if (!box) {
    throw new Error("resize handle not found")
  }

  const sx = box.x + box.width / 2
  const sy = box.y + box.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sx - 140, sy, { steps: 8 })
  await page.mouse.up()

  await expect
    .poll(async () => await panel.evaluate((el) => Math.round(el.getBoundingClientRect().width)))
    .toBeGreaterThan(before + 80)

  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(panel).toHaveAttribute("data-ms-right-panel", "1")
  await expect
    .poll(async () => await panel.evaluate((el) => Math.round(el.getBoundingClientRect().width)))
    .toBeGreaterThan(before + 60)
})
