import { expect, test } from "@playwright/test"

test("chat row Operator delete uses modal", async ({ page }) => {
  const p = page
  var cleanupCalls = 0

  await p.route("**/api/chat", (r) => {
    const req = r.request()

    if (req.method() !== "POST") {
      r.fallback()
      return
    }

    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, text: "hi" }) })
  })

  await p.route("**/api/chats/**/cleanup", (r) => {
    const req = r.request()

    if (req.method() !== "POST") {
      r.fallback()
      return
    }

    cleanupCalls++
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
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

  const id = await p.evaluate(() => (window.localStorage.getItem("ms_chat_active") ?? "").trim())
  expect(id).toBeTruthy()

  await side.locator("svg.lucide-panel-left").first().click()
  await p.waitForFunction(() => window.localStorage.getItem("ms_open") === "1")

  const row = side.locator(`[data-ms-chat="${id}"]`).first()
  await expect(row).toHaveCount(1)

  await row.hover()
  await row.locator("svg.lucide-ellipsis").first().click()

  const operatorMenu = side.locator("#__ms_task_row_operator").first()
  await expect(operatorMenu).toBeVisible()
  await operatorMenu.locator("text=Delete").first().click()

  const dlg = p.locator('#__ms_task_row_del [data-ms-act="dlg"]').first()
  await expect.poll(() => p.locator("#__ms_task_row_del").evaluate((el) => (el as HTMLElement).style.display)).toBe("block")
  await expect.poll(() => p.locator("#__ms_task_row_del").getAttribute("data-ms-id")).toBe(id)
  await expect(dlg).toBeVisible()
  await expect(dlg).toContainText("Delete Task")
  await p.locator('#__ms_task_row_del [data-ms-act="cancel"]').first().click({ force: true })
  await expect(dlg).toBeHidden()

  await row.hover()
  await row.locator("svg.lucide-ellipsis").first().click()
  await expect(operatorMenu).toBeVisible()
  await operatorMenu.locator("text=Delete").first().click()
  await expect(dlg).toBeVisible()
  await p.locator('#__ms_task_row_del [data-ms-act="ok"]').first().click({ force: true })

  await expect(side.locator(`[data-ms-chat="${id}"]`)).toHaveCount(0)
  await p.waitForFunction(() => window.localStorage.getItem("ms_chat_active") === null)
  expect(cleanupCalls).toBeGreaterThan(0)
})
