import { expect, test } from "@playwright/test"
import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const clean = (raw: unknown) => {
  const t0 = typeof raw === "string" ? raw : ""
  return t0.trim()
}

const tag = (raw: unknown) => {
  const text = clean(raw)
  const t0 = text.replace(/[^a-zA-Z0-9_.-]+/g, "-")
  const t = clean(t0).replace(/^-+|-+$/g, "")
  return t || "run"
}

const operatorRoot = () => {
  const fp = fileURLToPath(import.meta.url)
  const dir = path.dirname(fp)
  return path.resolve(dir, "..")
}

const dataDir = () => {
  const env0 = clean(process.env.OPERATOR_DATA_DIR ?? "")
  const env1 = clean(process.env.DATA_DIR ?? "")
  const env = env0 || env1
  return env || path.join(operatorRoot(), "test-results", "server-data")
}

const policyFileFor = (_info: import("@playwright/test").TestInfo) => {
  return path.join(dataDir(), "rules", "policy.rules")
}

const writePolicy = async (info: import("@playwright/test").TestInfo, rules: string) => {
  const policyFile = policyFileFor(info)
  await mkdir(path.dirname(policyFile), { recursive: true })
  const cur0 = await readFile(policyFile, "utf8").catch(() => "")
  const cur = typeof cur0 === "string" ? cur0 : ""

  if (cur.trim() === rules.trim()) {
    return
  }

  await writeFile(policyFile, rules, "utf8")
}

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

const openChat = async (page: import("@playwright/test").Page, base: string, chatId: string) => {
  const encoded = encodeURIComponent(chatId)
  await page.goto(`${base}/t/${encoded}`, { waitUntil: "domcontentloaded" })
  await waitSnapshot(page)

  const snap = page.frameLocator('iframe[data-kind="snapshot"]')
  await expect(snap.locator("html")).toHaveAttribute("data-ms-chat-send", "1")
  const ta = snap.locator("#chat-home-view-container textarea").first()
  await expect(ta).toBeVisible()
  return { snap, ta }
}

const waitApprovalPrompt = async (snap: ReturnType<import("@playwright/test").Page["frameLocator"]>) => {
  const prompt = snap
    .locator('[data-ms-prompt-id]')
    .filter({ hasText: "Tool approval required" })
    .first()
  await expect(prompt).toBeVisible()
  return prompt
}

const chatIdFor = (info: import("@playwright/test").TestInfo, prefix: string) => {
  const runId = tag(process.env.PW_RUN_ID ?? "")
  const proj = tag(info.project.name)
  const wid = typeof info.workerIndex === "number" ? `${info.workerIndex}` : "0"
  const rep = typeof info.repeatEachIndex === "number" ? `${info.repeatEachIndex}` : "0"
  const ts = `${Date.now()}`
  return `${tag(prefix)}-${runId}-${proj}-${wid}-${rep}-${ts}`
}

test("command approval prompt denies execution and returns deterministic error", async ({ page, baseURL }) => {
  await writePolicy(test.info(), 'prefix_rule(pattern=["echo"], decision="prompt", justification="echo requires approval")\n')
  const base = baseURL || "http://127.0.0.1:4174"
  const opened = await openChat(page, base, chatIdFor(test.info(), "approval-cmd-deny"))

  await opened.ta.fill("test:approval-cmd")
  await opened.ta.press("Enter")

  const prompt = await waitApprovalPrompt(opened.snap)
  await expect(prompt).toContainText("Justification: echo requires approval")

  await prompt.locator("button", { hasText: "Deny" }).click({ force: true })
  await expect(opened.snap.locator('[data-ms-prompt-id]').filter({ hasText: "Tool approval required" })).toHaveCount(0)
  await expect(opened.snap.locator("body")).toContainText("Tool call denied by user")
})

test("command approval prompt approves and streams output", async ({ page, baseURL }) => {
  await writePolicy(test.info(), 'prefix_rule(pattern=["echo"], decision="prompt", justification="echo requires approval")\n')
  const base = baseURL || "http://127.0.0.1:4174"
  const opened = await openChat(page, base, chatIdFor(test.info(), "approval-cmd-approve"))

  await opened.ta.fill("test:approval-cmd")
  await opened.ta.press("Enter")

  const prompt = await waitApprovalPrompt(opened.snap)
  await expect(prompt).toContainText("Justification: echo requires approval")

  await prompt.locator("button", { hasText: "Approve" }).click({ force: true })
  await expect(opened.snap.locator('[data-ms-prompt-id]').filter({ hasText: "Tool approval required" })).toHaveCount(0)
  await expect(opened.snap.locator("body")).toContainText("Approval command flow completed.")
  await expect(opened.snap.locator("body")).toContainText("Simulated exec ok: echo test")
})

test("file mutation approval prompt renders details and executes on approve", async ({ page, baseURL }) => {
  await writePolicy(test.info(), 'prefix_rule(pattern=["echo"], decision="prompt", justification="echo requires approval")\n')
  const base = baseURL || "http://127.0.0.1:4174"
  const opened = await openChat(page, base, chatIdFor(test.info(), "approval-fs-approve"))

  await opened.ta.fill("test:approval-fs")
  await opened.ta.press("Enter")

  const prompt = await waitApprovalPrompt(opened.snap)
  await expect(prompt).toContainText("Paths: .env")

  await prompt.locator("button", { hasText: "Approve" }).click({ force: true })
  await expect(opened.snap.locator('[data-ms-prompt-id]').filter({ hasText: "Tool approval required" })).toHaveCount(0)
  await expect(opened.snap.locator("body")).toContainText("Approval file mutation flow completed.")
  await expect(opened.snap.locator("body")).toContainText("Simulated fs_delete .env: ok")
})
