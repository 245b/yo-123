import { expect, test } from "@playwright/test"

const waitSnapshot = async (page: import("@playwright/test").Page) => {
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
}

const snapshotAttr = async (page: import("@playwright/test").Page, name: string) => {
  const list = page.frames()

  for (var i = 0; i < list.length; i++) {
    const frame = list[i]

    if (!frame) {
      continue
    }

    if (!frame.url().includes("/snapshot.html")) {
      continue
    }

    return await frame.evaluate((row) => {
      return document.documentElement.getAttribute(row) ?? ""
    }, name)
  }

  return ""
}

test("session flag toggles with route activation", async ({ page, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  await page.goto(base, { waitUntil: "domcontentloaded" })
  await waitSnapshot(page)

  const snap = page.frameLocator('iframe[data-kind="snapshot"]')
  await expect
    .poll(async () => await snapshotAttr(page, "data-ms-chat-active"))
    .not.toBe("1")

  const ta = snap.locator("#chat-home-view-container textarea").first()
  await expect(ta).toBeVisible()
  await ta.fill("hide header in session")
  await ta.press("Enter")
  await expect(page).toHaveURL(/\/t\//)
  await expect
    .poll(async () => await snapshotAttr(page, "data-ms-chat-active"))
    .toBe("1")

  await page.evaluate(() => {
    window.sessionStorage.removeItem("ms_chat_active")
  })
  await page.goto(base, { waitUntil: "domcontentloaded" })
  await waitSnapshot(page)
  await expect
    .poll(async () => await snapshotAttr(page, "data-ms-chat-active"))
    .not.toBe("1")
})
