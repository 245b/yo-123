import { expect, test } from "@playwright/test"

test("active chat route is isolated per tab", async ({ browser, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  const ctx = await browser.newContext()
  const a = await ctx.newPage()
  const b = await ctx.newPage()

  await a.goto(`${base}/t/tab-a`, { waitUntil: "domcontentloaded" })
  await b.goto(base, { waitUntil: "domcontentloaded" })
  await b.waitForTimeout(350)
  await expect(a).toHaveURL(new RegExp("/t/tab-a$"))
  await expect(b).toHaveURL(new RegExp("^http://127\\.0\\.0\\.1:[0-9]+/?$"))

  await b.goto(`${base}/t/tab-b`, { waitUntil: "domcontentloaded" })
  await b.waitForTimeout(350)
  await expect(a).toHaveURL(new RegExp("/t/tab-a$"))
  await expect(b).toHaveURL(new RegExp("/t/tab-b$"))

  await a.close()
  await b.waitForTimeout(350)
  await expect(b).toHaveURL(new RegExp("/t/tab-b$"))
  await ctx.close()
})
