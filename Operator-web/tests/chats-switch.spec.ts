import { expect, test } from "@playwright/test"

test("sidebar can switch between saved chats", async ({ page }) => {
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
  await ta.fill("one")
  await ta.press("Enter")
  await expect(snap.locator("#__ms_ds_list")).toContainText("one")
  await expect(snap.locator("#__ms_ds_list")).toContainText("hi")

  const id1 = await p.evaluate(() => (window.localStorage.getItem("ms_chat_active") ?? "").trim())
  expect(id1).toBeTruthy()
  expect(await p.evaluate((id) => window.localStorage.getItem(`ms_chat_${id}`) ?? "", id1)).toContain("one")

  await side.locator("svg.lucide-square-pen").first().click()
  await p.waitForFunction(() => window.location.pathname === "/")
  await p.waitForFunction(() => window.localStorage.getItem("ms_chat_active") === null)
  const ta2 = snap.locator('[data-ms-chatbox="1"] textarea').first()
  await ta2.fill("two")
  await ta2.press("Enter")
  await p.waitForFunction(() => Boolean((window.localStorage.getItem("ms_chat_active") ?? "").trim()))
  const id2 = await p.evaluate(() => (window.localStorage.getItem("ms_chat_active") ?? "").trim())
  expect(id2).toBeTruthy()
  expect(id2).not.toBe(id1)
  await ta2.press("Enter")
  await expect(snap.locator("#__ms_ds_list")).toContainText("two")
  await expect(snap.locator("#__ms_ds_list")).toContainText("hi")

  const id2b = await p.evaluate(() => (window.localStorage.getItem("ms_chat_active") ?? "").trim())
  expect(id2b).toBe(id2)
  expect(await p.evaluate((id) => window.localStorage.getItem(`ms_chat_${id}`) ?? "", id2)).toContain("two")

  await side.locator("svg.lucide-panel-left").first().click()
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "1")

  await expect(side.locator("#__ms_chats")).toHaveCount(1)
  await expect(side.locator(`[data-ms-chat=\"${id1}\"]`)).toHaveCount(1)
  await expect(side.locator(`[data-ms-chat=\"${id2}\"]`)).toHaveCount(1)

  await side.locator(`[data-ms-chat=\"${id1}\"]`).first().click()
  await p.waitForFunction((id) => window.localStorage.getItem("ms_chat_active") === id, id1)
  await expect
    .poll(() => snap.locator("html").evaluate(() => ((window as unknown as { __ms_ds_id?: string }).__ms_ds_id ?? "").trim()))
    .toBe(id1)
  await expect(snap.locator("#__ms_ds_list")).toContainText("one")
  await expect(snap.locator("#__ms_ds_list")).not.toContainText("two")

  await side.locator(`[data-ms-chat=\"${id2}\"]`).first().click()
  await p.waitForFunction((id) => window.localStorage.getItem("ms_chat_active") === id, id2)
  await expect
    .poll(() => snap.locator("html").evaluate(() => ((window as unknown as { __ms_ds_id?: string }).__ms_ds_id ?? "").trim()))
    .toBe(id2)
  await expect(snap.locator("#__ms_ds_list")).toContainText("two")
  await expect(snap.locator("#__ms_ds_list")).not.toContainText("one")
})

