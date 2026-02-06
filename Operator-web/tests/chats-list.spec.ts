import { expect, test } from "@playwright/test"

test("sidebar All tasks shows saved chats", async ({ page }) => {
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

  await side.locator("svg.lucide-panel-left").first().click()
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "1")
  await p.waitForFunction(() => Boolean(window.localStorage.getItem("ms_chats")))

  const box = side.locator("#__ms_chats")
  await expect(box).toHaveCount(1)
  await expect(box).toContainText("New chat")
})

