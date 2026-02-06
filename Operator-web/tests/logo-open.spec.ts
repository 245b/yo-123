import { expect, test } from "@playwright/test"

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
  const side = p.frameLocator('iframe[data-kind="sidebar"]')
  await expect(snap.locator("body")).toBeVisible()
  await expect(side.locator("body")).toBeVisible()
  await expect(snap.locator('[data-ms-chatbox="1"]')).toHaveCount(1, { timeout: 20_000 })

  const ta = snap.locator('[data-ms-chatbox="1"] textarea').first()
  await ta.fill("hello")
  await ta.press("Enter")
  await expect(snap.locator("#__ms_ds_list")).toContainText("hi")
  await p.waitForFunction(() => window.location.pathname.startsWith("/t/"))
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "0")
  const id0 = await p.evaluate(() => (window.localStorage.getItem("ms_chat_active") ?? "").trim())
  expect(id0).toBeTruthy()

  const lg = side.locator('nav img[width="35"][height="35"]').first()
  await lg.click({ force: true })
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "0")
  await p.waitForFunction(() => window.location.pathname === "/")
  await p.waitForFunction(() => window.localStorage.getItem("ms_chat_active") === null)
})

test("logo returns to home while sidebar stays open", async ({ page }) => {
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
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "0")

  await side.locator("svg.lucide-panel-left").first().click()
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "1")

  const id = await p.evaluate(() => (window.localStorage.getItem("ms_chat_active") ?? "").trim())
  expect(id).toBeTruthy()

  const lg = side.locator('nav img[width="35"][height="35"]').first()
  await lg.click({ force: true })
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "1")
  await p.waitForFunction(() => window.location.pathname === "/")
  await p.waitForFunction(() => window.localStorage.getItem("ms_chat_active") === null)
})
