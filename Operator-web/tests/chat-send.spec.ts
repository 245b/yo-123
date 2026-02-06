import { expect, test } from "@playwright/test"

test("enter resets textarea height after long message", async ({ page }) => {
  const p = page

  await p.route("**/api/chat", (r) => {
    const req = r.request()

    if (req.method() !== "POST") {
      r.fallback()
      return
    }

    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, text: "hi" }) })
  })

  await p.goto("/", { waitUntil: "domcontentloaded" })

  const snap = p.frameLocator('iframe[data-kind="snapshot"]')
  const side = p.frameLocator('iframe[data-kind="sidebar"]')
  await expect(snap.locator("body")).toBeVisible()
  await expect(side.locator("body")).toBeVisible()
  await expect(snap.locator('[data-ms-chatbox="1"]')).toHaveCount(1, { timeout: 20_000 })

  const ta = snap.locator('[data-ms-chatbox="1"] textarea').first()
  const h0 = await ta.evaluate((t) => Math.round(t.getBoundingClientRect().height))
  const msg = `LONGMSG ${"x".repeat(400)}\n${"y".repeat(400)}\n${"z".repeat(400)}\n${"w".repeat(400)}`

  await ta.fill(msg)
  await p.waitForTimeout(50)
  const h1 = await ta.evaluate((t) => Math.round(t.getBoundingClientRect().height))

  expect(h1).toBeGreaterThan(h0)

  await ta.press("Enter")
  await expect(snap.locator("#__ms_ds_list")).toContainText("LONGMSG")
  await expect(ta).toHaveValue("")
  await p.waitForTimeout(50)
  const h2 = await ta.evaluate((t) => Math.round(t.getBoundingClientRect().height))

  expect(h2).toBeLessThanOrEqual(h0 + 2)
})

test("enter sends and shows response", async ({ page }) => {
  const p = page

  await p.route("**/api/chat", (r) => {
    const req = r.request()

    if (req.method() !== "POST") {
      r.fallback()
      return
    }

    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, text: "hi" }) })
  })

  await p.goto("/", { waitUntil: "domcontentloaded" })

  const snap = p.frameLocator('iframe[data-kind="snapshot"]')
  const side = p.frameLocator('iframe[data-kind="sidebar"]')
  await expect(snap.locator("body")).toBeVisible()
  await expect(side.locator("body")).toBeVisible()
  await expect(snap.locator('[data-ms-chatbox="1"]')).toHaveCount(1, { timeout: 20_000 })

  const ta = snap.locator('[data-ms-chatbox="1"] textarea').first()
  await ta.fill("hello")
  await ta.press("Enter")

  await p.waitForFunction(() => window.location.pathname.startsWith("/t/"))
  const cid = await p.evaluate(() => (window.localStorage.getItem("ms_chat_active") ?? "").trim())
  const pid = await p.evaluate(() => {
    const p = (window.location.pathname ?? "").trim()
    return p.startsWith("/t/") ? p.slice(3).trim() : ""
  })
  expect(cid).toBe(pid)

  await expect(ta).toHaveValue("")
  await expect(snap.locator("#__ms_ds")).toHaveCount(1)
  await expect(snap.locator("#__ms_ds_list")).toHaveCount(1)
  await expect(snap.locator("#__ms_ds_list")).toContainText("hello")
  await expect(snap.locator("#__ms_ds_list")).toContainText("Operator 1.5 Lite")
  await expect(snap.locator("#__ms_ds_list")).toContainText("hi")

  const ds = snap.locator("#__ms_ds").first()
  const r1 = await ds.boundingBox()
  const r2 = await ta.boundingBox()
  expect(r1).not.toBeNull()
  expect(r2).not.toBeNull()

  if (!r1 || !r2) {
    return
  }

  expect(r1.y).toBeLessThan(r2.y)
})

test("stream tool-only completion falls back to server diagnostic text", async ({ page }) => {
  const p = page
  var calls = 0

  await p.route("**/api/chat", async (r) => {
    const req = r.request()

    if (req.method() !== "POST") {
      await r.fallback()
      return
    }

    calls++

    if (calls === 1) {
      const body = [
        "event: run",
        'data: {"phase":"start","runId":"r1","sessionId":"operator"}',
        "",
        "event: term",
        'data: {"phase":"start","tool":"terminal_exec","id":"t1","args":{"command":"echo hello"}}',
        "",
        "event: done",
        "data: ",
        "",
      ].join("\n")

      await r.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" },
        body,
      })
      return
    }

    const text = [
      "What went wrong: The execution pipeline ended without a final assistant answer.",
      "Where the failure occurred: The failure occurred in tool execution.",
      "Why progress could not continue: Tool activity completed but no assistant response text was produced.",
      "What is missing or misconfigured: A valid assistant completion was not returned after tool execution.",
    ].join("\n\n")

    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, text }) })
  })

  await p.goto("/", { waitUntil: "domcontentloaded" })

  const snap = p.frameLocator('iframe[data-kind="snapshot"]')
  const side = p.frameLocator('iframe[data-kind="sidebar"]')
  await expect(snap.locator("body")).toBeVisible()
  await expect(side.locator("body")).toBeVisible()
  await expect(snap.locator('[data-ms-chatbox="1"]')).toHaveCount(1, { timeout: 20_000 })

  const ta = snap.locator('[data-ms-chatbox="1"] textarea').first()
  await ta.fill("build me a page")
  await ta.press("Enter")

  await expect(snap.locator("#__ms_ds_list")).toContainText("What went wrong:", { timeout: 15_000 })
  await expect(snap.locator("#__ms_ds_list")).not.toContainText("Empty response")
  await expect(snap.locator("#__ms_ds_list")).not.toContainText("server stalled")
  expect(calls).toBe(2)
})

test("new task returns to home", async ({ page }) => {
  const p = page

  await p.route("**/api/chat", (r) => {
    const req = r.request()

    if (req.method() !== "POST") {
      r.fallback()
      return
    }

    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, text: "hi" }) })
  })

  await p.goto("/", { waitUntil: "domcontentloaded" })

  const snap = p.frameLocator('iframe[data-kind="snapshot"]')
  const side = p.frameLocator('iframe[data-kind="sidebar"]')
  await expect(snap.locator("body")).toBeVisible()
  await expect(side.locator("body")).toBeVisible()
  await expect(snap.locator('[data-ms-chatbox="1"]')).toHaveCount(1, { timeout: 20_000 })

  const ta = snap.locator('[data-ms-chatbox="1"] textarea').first()
  await ta.fill("hello")
  await ta.press("Enter")
  await expect(snap.locator("#__ms_ds_list")).toContainText("hi")
  await p.waitForFunction(() => window.location.pathname.startsWith("/t/"))

  await side.locator("svg.lucide-panel-left").first().click()
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "1")

  await side.locator('span[title="New task"]').first().click()

  await p.waitForFunction(() => window.location.pathname === "/")
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "1")
  await p.waitForFunction(() => window.localStorage.getItem("ms_chat_active") === null)
  await expect(snap.locator("#__ms_ds_list")).toHaveCount(0)
  await expect(snap.locator("#chat-home-view-container h1")).toContainText("What can I do for you?")
  await expect(snap.locator('[data-ms-chatbox="1"] textarea').first()).toHaveAttribute(
    "placeholder",
    "Assign a task or ask anything",
  )
})

test("hover shows copy button and copies", async ({ page }) => {
  const p = page
  await p.context().grantPermissions(["clipboard-read", "clipboard-write"])

  await p.route("**/api/chat", (r) => {
    const req = r.request()

    if (req.method() !== "POST") {
      r.fallback()
      return
    }

    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, text: "hi" }) })
  })

  await p.goto("/", { waitUntil: "domcontentloaded" })

  const snap = p.frameLocator('iframe[data-kind="snapshot"]')
  const side = p.frameLocator('iframe[data-kind="sidebar"]')
  await expect(snap.locator("body")).toBeVisible()
  await expect(side.locator("body")).toBeVisible()
  await expect(snap.locator('[data-ms-chatbox="1"]')).toHaveCount(1, { timeout: 20_000 })

  const ta = snap.locator('[data-ms-chatbox="1"] textarea').first()
  await ta.fill("hello")
  await ta.press("Enter")
  await expect(snap.locator("#__ms_ds_list")).toContainText("hi")

  const btn = snap.locator('div[aria-label="Copy"]').first()
  await expect(btn).toHaveCount(1)
  await expect(btn).toBeHidden()

  await snap.locator("#__ms_ds_list > div").first().hover()
  await expect(btn).toBeVisible()
  await btn.click()

  const copied = await btn.getAttribute("data-ms-copied")
  expect(copied).toBe("1")

  const txt = (await btn.textContent()) ?? ""
  expect(txt).toContain("Copied")
  expect(await btn.locator("svg").count()).toBe(0)
})

test("square-pen resets without opening sidebar", async ({ page }) => {
  const p = page

  await p.route("**/api/chat", (r) => {
    const req = r.request()

    if (req.method() !== "POST") {
      r.fallback()
      return
    }

    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, text: "hi" }) })
  })

  await p.goto("/", { waitUntil: "domcontentloaded" })

  const snap = p.frameLocator('iframe[data-kind="snapshot"]')
  const side = p.frameLocator('iframe[data-kind="sidebar"]')
  await expect(snap.locator("body")).toBeVisible()
  await expect(side.locator("body")).toBeVisible()
  await expect(snap.locator('[data-ms-chatbox="1"]')).toHaveCount(1, { timeout: 20_000 })

  const ta = snap.locator('[data-ms-chatbox="1"] textarea').first()
  await ta.fill("hello")
  await ta.press("Enter")
  await expect(snap.locator("#__ms_ds_list")).toContainText("hi")
  await p.waitForFunction(() => Boolean(window.localStorage.getItem("ms_chat_active")))

  await side.locator("svg.lucide-square-pen").first().click()
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "0")
  await p.waitForFunction(() => window.location.pathname === "/")
  await p.waitForFunction(() => window.localStorage.getItem("ms_chat_active") === null)
  await expect(snap.locator("#__ms_ds_list")).toHaveCount(0)
  await expect(snap.locator("#chat-home-view-container h1")).toContainText("What can I do for you?")
})

test("logo returns to home while sidebar stays closed", async ({ page }) => {
  const p = page

  await p.route("**/api/chat", (r) => {
    const req = r.request()

    if (req.method() !== "POST") {
      r.fallback()
      return
    }

    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, text: "hi" }) })
  })

  await p.goto("/", { waitUntil: "domcontentloaded" })

  const snap = p.frameLocator('iframe[data-kind="snapshot"]')
  await expect(snap.locator("body")).toBeVisible()
  await expect(snap.locator('[data-ms-chatbox="1"]')).toHaveCount(1, { timeout: 20_000 })

  const ta = snap.locator('[data-ms-chatbox="1"] textarea').first()
  await ta.fill("hello")
  await ta.press("Enter")
  await expect(snap.locator("#__ms_ds_list")).toContainText("hi")
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "0")
  await p.waitForFunction(() => Boolean(window.localStorage.getItem("ms_chat_active")))
  const id = await p.evaluate(() => (window.localStorage.getItem("ms_chat_active") ?? "").trim())
  expect(id).toBeTruthy()

  await snap.locator('nav img[width="35"][height="35"]').first().click({ force: true })
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "0")

  await p.waitForFunction(() => window.location.pathname === "/")
  await p.waitForFunction(() => window.localStorage.getItem("ms_chat_active") === null)
})

test("sidebar logo returns home while staying open", async ({ page }) => {
  const p = page

  await p.route("**/api/chat", (r) => {
    const req = r.request()

    if (req.method() !== "POST") {
      r.fallback()
      return
    }

    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, text: "hi" }) })
  })

  await p.goto("/", { waitUntil: "domcontentloaded" })

  const snap = p.frameLocator('iframe[data-kind="snapshot"]')
  const side = p.frameLocator('iframe[data-kind="sidebar"]')
  await expect(snap.locator("body")).toBeVisible()
  await expect(side.locator("body")).toBeVisible()
  await expect(snap.locator('[data-ms-chatbox="1"]')).toHaveCount(1, { timeout: 20_000 })

  const ta = snap.locator('[data-ms-chatbox="1"] textarea').first()
  await ta.fill("hello")
  await ta.press("Enter")
  await expect(snap.locator("#__ms_ds_list")).toContainText("hi")
  await p.waitForFunction(() => Boolean((window.localStorage.getItem("ms_chat_active") ?? "").trim()))
  const id = await p.evaluate(() => (window.localStorage.getItem("ms_chat_active") ?? "").trim())

  await side.locator("svg.lucide-panel-left").first().click()
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "1")

  await side.locator("nav div.clickable").first().click()
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "1")
  await p.waitForFunction(() => window.location.pathname === "/")
  await p.waitForFunction(() => window.localStorage.getItem("ms_chat_active") === null)
})
