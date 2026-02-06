import { expect, test } from "@playwright/test"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

type ToolLog = {
  tool: string
  ok: boolean
}

const readToolLogs = async (chatId: string) => {
  const dir = join(process.cwd(), "data", "logs")
  const out: ToolLog[] = []
  const files = await readdir(dir).catch(() => [])

  for (var i = 0; i < files.length; i++) {
    const name = files[i] ?? ""

    if (!name.includes("_tool_result_")) {
      continue
    }

    const full = join(dir, name)
    const raw = await readFile(full, "utf8").catch(() => "")

    if (!raw) {
      continue
    }

    const json = JSON.parse(raw) as {
      chatId?: unknown
      tool?: unknown
      result?: unknown
    }
    const id0 = typeof json.chatId === "string" ? json.chatId : ""

    if (id0 !== chatId) {
      continue
    }

    const tool0 = typeof json.tool === "string" ? json.tool : ""
    const row = (json.result && typeof json.result === "object" ? json.result : null) as { ok?: unknown } | null
    const ok = row?.ok === true
    out.push({ tool: tool0, ok })
  }

  return out
}

test("api: health is ok", async ({ request }) => {
  const r = await request.get("/api/health")
  expect(r.ok()).toBe(true)

  const j = (await r.json()) as unknown
  const o = (j && typeof j === "object" ? j : null) as { ok?: unknown; ts?: unknown } | null

  expect(o?.ok).toBe(true)
  expect(typeof o?.ts === "string").toBe(true)
})

test("api: chat cleanup accepts valid id", async ({ request }) => {
  const id = "11111111-2222-3333-4444-555555555555"
  const r = await request.post(`/api/chats/${id}/cleanup`, { data: {} })
  expect(r.status()).toBe(200)

  const j = (await r.json()) as unknown
  const o = (j && typeof j === "object" ? j : null) as
    | {
        ok?: unknown
        chatId?: unknown
        removedPaths?: unknown
        removedFiles?: unknown
      }
    | null

  expect(o?.ok).toBe(true)
  expect(o?.chatId).toBe(id)
  expect(Array.isArray(o?.removedPaths)).toBe(true)
  expect(Array.isArray(o?.removedFiles)).toBe(true)
})

test("api: hello-world website prompt writes separate html css js files", async ({ request }) => {
  const id = `hello-site-${Date.now()}`
  const prompt = "Create a great-looking Hello World website using separate HTML, CSS, and JS files inside the active session folder."
  const r = await request.post("/api/chat", {
    headers: { accept: "application/json" },
    data: {
      chatId: id,
      sessionId: id,
      allow_terminal_exec: true,
      messages: [{ role: "user", content: prompt }],
    },
  })
  expect(r.status()).toBe(200)

  const j = (await r.json()) as unknown
  const o = (j && typeof j === "object" ? j : null) as { ok?: unknown; text?: unknown } | null
  const text0 = typeof o?.text === "string" ? o.text : ""
  const text = text0.trim()

  expect(o?.ok).toBe(true)
  expect(text).toContain("index.html")
  expect(text).toContain("style.css")
  expect(text).toContain("script.js")
  expect(text.toLowerCase()).toContain("hello world")
  expect(text).not.toContain("No response events received")
  expect(text).not.toContain("The system attempted to generate a response")

  const settle0 = Number.parseInt(process.env.HELLO_SITE_SETTLE_MS ?? "", 10)
  const settle = Number.isFinite(settle0) && settle0 > 0 ? settle0 : 1200
  await new Promise((res) => setTimeout(res, settle))

  const logs = await readToolLogs(id)
  const writes = logs.filter((row) => row.tool === "fs_write")
  const lists = logs.filter((row) => row.tool === "fs_list")
  expect(writes.length).toBeGreaterThanOrEqual(3)
  expect(writes.every((row) => row.ok)).toBe(true)
  expect(lists.length).toBeGreaterThanOrEqual(1)
  expect(lists.some((row) => row.ok)).toBe(true)
})

