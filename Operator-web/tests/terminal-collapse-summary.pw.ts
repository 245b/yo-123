import { expect, test } from "@playwright/test"

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

test("terminal entries auto-collapse with a summary and expand to xterm output", async ({ page, baseURL }) => {
  const base = baseURL || "http://127.0.0.1:4174"
  const chatId = "term-collapse-summary"
  const termId = "term-elon-1"
  const input = 'mcp-search "Elon Musk"\nrg -n "Elon" .'
  const output = "Result line 1\nResult line 2\n"

  await page.addInitScript(
    ({ chatId, input, output, termId }) => {
      const esc = (s: string) =>
        s
          .replace(/\\/g, "\\\\")
          .replace(/\t/g, "\\t")
          .replace(/\r/g, "\\r")
          .replace(/\n/g, "\\n")

      const ts = Date.now()
      window.localStorage.setItem("ms_chats", `${chatId}\tNew chat\t${ts}`)
      window.localStorage.setItem(`ms_chat_${chatId}`, `user\tHi\nassistant\tOk`)
      window.localStorage.setItem(
        `ms_chat_term_${chatId}`,
        `1\t${esc(termId)}\t${esc("terminal")}\t${esc("done")}\t${esc(input)}\t${esc(output)}`,
      )
      window.sessionStorage.setItem("ms_chat_active", chatId)
      window.localStorage.removeItem(`ms_term_fold_${termId}`)
    },
    { chatId, input, output, termId },
  )

  await page.goto(`${base}/t/${chatId}`, { waitUntil: "domcontentloaded" })

  const frame = await snapshotFrame(page)
  const box = frame.locator(`[data-ms-term-id="${termId}"]`)
  await expect(box).toHaveCount(1)

  const summaryWrap = box.locator('[data-ms-term-summary-wrap="1"]')
  const details = box.locator('[data-ms-term-details="1"]')
  const summaryText = box.locator('[data-ms-term-summary="1"]')
  const foldBtn = box.locator("button.ms-term-fold")

  await expect(summaryWrap).toBeVisible()
  await expect(details).toBeHidden()
  await expect(summaryText).toContainText("Searching about Elon Musk")
  await expect(foldBtn).toHaveText("<")

  await summaryWrap.locator("button.ms-term-summary-toggle").click()

  await expect(details).toBeVisible()
  await expect(summaryWrap).toBeHidden()
  await expect(foldBtn).toHaveText(">")

  await expect
    .poll(() => frame.evaluate((id) => window.localStorage.getItem(`ms_term_fold_${id}`) ?? "", termId))
    .toBe("0")

  const inPre = box.locator('[data-ms-term-in="1"]')
  await expect(inPre).toContainText('mcp-search "Elon Musk"')
  await expect(inPre).toContainText('rg -n "Elon" .')

  const xterm = box.locator('[data-ms-term-out="1"] .xterm')
  await expect(xterm).toHaveCount(1)

  const raw = box.locator('[data-ms-term-raw="1"]')
  await expect(raw).toContainText("Result line 1")
})
