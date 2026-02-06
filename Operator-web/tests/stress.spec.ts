import { expect, test } from "@playwright/test"

const num = (k: string, d: number) => {
  const v0 = process.env[k] ?? ""
  const v = Number.parseInt(v0, 10)

  if (!Number.isFinite(v)) {
    return d
  }

  if (v <= 0) {
    return d
  }

  return v
}

test("loads and injects Operator", async ({ page }) => {
  const p = page
  const errs: string[] = []
  const logs: string[] = []

  p.on("pageerror", (e) => errs.push(e.message))
  p.on("console", (m) => {
    const t = m.type()

    if (t !== "error") {
      return
    }

    const s = m.text()
    const ok0 = s.includes("has been blocked by CORS policy")
    const ok1 = s.includes("Failed to load resource: net::ERR_FAILED")

    if (ok0 || ok1) {
      logs.push(s)
      return
    }

    errs.push(s)
  })

  const t0 = Date.now()
  await p.goto("/", { waitUntil: "domcontentloaded" })

  const snap = p.frameLocator('iframe[data-kind="snapshot"]')
  const side = p.frameLocator('iframe[data-kind="sidebar"]')

  await expect(snap.locator("body")).toBeVisible()
  await expect(side.locator("body")).toBeVisible()

  await expect(snap.locator("#__ms_operator")).toHaveCount(1)

  await expect(side.locator("nav")).toHaveCount(1)

  const ms = Date.now() - t0
  await test.info().attach("timing.json", {
    body: JSON.stringify({ ms }, null, 2),
    contentType: "application/json",
  })
  await test.info().attach("console.json", {
    body: JSON.stringify({ logs }, null, 2),
    contentType: "application/json",
  })

  expect(errs).toEqual([])
})

test("stress: sidebar open/close", async ({ page }) => {
  const p = page
  await p.goto("/", { waitUntil: "domcontentloaded" })
  await p.evaluate(() => window.localStorage.setItem("ms_open", "0"))
  await p.reload({ waitUntil: "domcontentloaded" })

  const snap = p.frameLocator('iframe[data-kind="snapshot"]')
  const side = p.frameLocator('iframe[data-kind="sidebar"]')

  await expect(snap.locator("body")).toBeVisible()
  await expect(side.locator("body")).toBeVisible()

  const rounds = num("MS_STRESS_TG", 12)

  if (rounds > 12) {
    test.setTimeout(180_000)
  }

  const t0 = Date.now()

  for (var i = 0; i < rounds; i++) {
    await side.locator("svg.lucide-panel-left").first().click({ force: true })
    await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "1")
    await p.waitForTimeout(250)

    await side.locator("svg.lucide-panel-left").first().click()
    await p.waitForFunction(() => window.localStorage.getItem("ms_open") !== "1")
    await p.waitForTimeout(250)
  }

  const ms = Date.now() - t0
  await test.info().attach("toggle.json", {
    body: JSON.stringify({ rounds, ms }, null, 2),
    contentType: "application/json",
  })
})

test("chat textarea auto-grows and persists draft", async ({ page }) => {
  const p = page
  await p.goto("/", { waitUntil: "domcontentloaded" })

  await p.evaluate(() => window.localStorage.removeItem("__ms_chat_draft"))
  await p.reload({ waitUntil: "domcontentloaded" })

  const snap = p.frameLocator('iframe[data-kind="snapshot"]')
  const ta = snap.locator('textarea[placeholder="Assign a task or ask anything"]').first()
  await expect(ta).toBeVisible()
  await expect(ta).toHaveAttribute("data-ms-ta", "1", { timeout: 2000 })

  const h0 = await ta.evaluate((t) => Math.round(t.getBoundingClientRect().height))
  await ta.fill(`${"x".repeat(400)}\n${"y".repeat(400)}\n${"z".repeat(400)}\n${"w".repeat(400)}`)
  await p.waitForTimeout(50)
  const h1 = await ta.evaluate((t) => Math.round(t.getBoundingClientRect().height))

  expect(h1).toBeGreaterThan(h0)

  await ta.fill("persist me")
  await p.waitForTimeout(25)
  await expect.poll(() => p.evaluate(() => window.localStorage.getItem("__ms_chat_draft"))).toBe("persist me")

  await p.reload({ waitUntil: "domcontentloaded" })
  const snap2 = p.frameLocator('iframe[data-kind="snapshot"]')
  const ta2 = snap2.locator('textarea[placeholder="Assign a task or ask anything"]').first()
  await expect(ta2).toHaveValue("persist me", { timeout: 20_000 })
})

test("layout: chat stays out of sidebar overlap", async ({ page }) => {
  const p = page
  await p.goto("/", { waitUntil: "domcontentloaded" })

  const snap = p.frameLocator('iframe[data-kind="snapshot"]')
  const side = p.frameLocator('iframe[data-kind="sidebar"]')

  await expect(snap.locator("body")).toBeVisible()
  await expect(side.locator("body")).toBeVisible()

  await side.locator("svg.lucide-panel-left").first().click()
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "1")

  await expect(snap.locator("html")).toHaveAttribute("data-ms-side", "1")

  const w = await snap
    .locator("html")
    .evaluate((el) => Number.parseInt(el.getAttribute("data-ms-w") ?? "", 10) || 0)

  await expect
    .poll(() => snap.locator("#chat-home-view-container").evaluate((el) => el.getBoundingClientRect().left))
    .toBeGreaterThanOrEqual(w + 10)
})

test("layout: Operator menu stays within viewport (mobile)", async ({ page }) => {
  const p = page
  await p.setViewportSize({ width: 360, height: 640 })
  await p.goto("/", { waitUntil: "domcontentloaded" })

  const snap = p.frameLocator('iframe[data-kind="snapshot"]')
  await expect(snap.locator("body")).toBeVisible()

  await snap.locator("body").evaluate(() => {
    const doc = document
    const sr = doc.querySelector("browser-mcp-container")?.shadowRoot ?? null
    const q = sr ?? doc
    const btn = q.querySelector('button[data-testid="model-selector-dropdown"]') as HTMLButtonElement | null
    if (!btn) {
      return
    }

    const ev = new PointerEvent("pointerdown", { bubbles: true, composed: true, button: 0 })
    btn.dispatchEvent(ev)
  })

  const operatorMenu = snap.locator("#__ms_operator").first()
  await expect(operatorMenu).toHaveCount(1)
  await operatorMenu.evaluate((el) => el.setAttribute("data-open", "1"))
  await expect(operatorMenu).toBeVisible()
  await expect(operatorMenu).toContainText("Operator 1.5 Lite")
})

test("layout: chat shifts after sidebar width change", async ({ page }) => {
  const p = page
  await p.goto("/", { waitUntil: "domcontentloaded" })

  const snap = p.frameLocator('iframe[data-kind="snapshot"]')
  const side = p.frameLocator('iframe[data-kind="sidebar"]')

  await expect(snap.locator("body")).toBeVisible()
  await expect(side.locator("body")).toBeVisible()

  await side.locator("svg.lucide-panel-left").first().click()
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "1")

  await side.locator("nav").evaluate((el) => {
    const nav = el as HTMLElement
    nav.style.width = "480px"
    window.dispatchEvent(new Event("resize"))
  })

  await expect
    .poll(() => snap.locator("html").evaluate((el) => Number.parseInt(el.getAttribute("data-ms-w") ?? "", 10) || 0))
    .toBeGreaterThanOrEqual(320)

  await expect
    .poll(async () => {
      const w = await snap.locator("html").evaluate((el) => Number.parseInt(el.getAttribute("data-ms-w") ?? "", 10) || 0)
      const left = await snap.locator("#chat-home-view-container").evaluate((el) => el.getBoundingClientRect().left)
      return left - w
    })
    .toBeGreaterThanOrEqual(10)
})
