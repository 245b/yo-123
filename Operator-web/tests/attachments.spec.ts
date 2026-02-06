import path from "path"
import { expect, test } from "@playwright/test"

test("attachments render from file input", async ({ page }) => {
  const p = page

  await p.goto("/", { waitUntil: "domcontentloaded" })

  const snap = p.frameLocator('iframe[data-kind="snapshot"]')
  await expect(snap.locator("body")).toBeVisible()
  await expect(snap.locator('[data-ms-chatbox="1"]')).toHaveCount(1, { timeout: 20_000 })

  await p.waitForSelector('input[type="file"]', { state: "attached" })

  const fp = path.resolve(process.cwd(), "file.png")
  await p.setInputFiles('input[type="file"]', fp)

  await expect(snap.locator("#__ms_att")).toHaveCount(1)
  await expect(snap.locator('[data-ms-att-open="1"]')).toHaveCount(1)
})
