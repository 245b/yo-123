import { describe, expect, test } from "bun:test"
import { makeHttp } from "../../../utils/http"
import { createPreviewOpenHandler } from "./handler"

const cors = {
  "access-control-allow-origin": "*",
}

describe("browser preview route", () => {
  test("opens and focuses a new cdp tab for loopback url", async () => {
    const calls: { url: string; method: string }[] = []
    const fetcher = async (url: string, init?: RequestInit) => {
      const method = typeof init?.method === "string" ? init.method : "GET"
      calls.push({ url, method })

      if (url.includes("/json/new?")) {
        return new Response(JSON.stringify({ id: "tab-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }

      if (url.endsWith("/json/activate/tab-1")) {
        return new Response("", { status: 200 })
      }

      return new Response("", { status: 404 })
    }
    const http = makeHttp(cors)
    const handle = createPreviewOpenHandler({
      http,
      fetcher,
      cdpBase: "http://localhost:9222",
    })
    const req = new Request("http://localhost/api/browser/preview/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "http://0.0.0.0:5173" }),
    })
    const res = await handle(req)
    const json = (await res.json()) as {
      ok: boolean
      data?: { ok?: boolean; url?: string; tabId?: string }
    }

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.data?.ok).toBe(true)
    expect(json.data?.url).toBe("http://localhost:5173/")
    expect(json.data?.tabId).toBe("tab-1")
    expect(calls.map((row) => row.method)).toEqual(["PUT", "GET"])
    expect(calls[0]?.url.includes("/json/new?http%3A%2F%2Flocalhost%3A5173%2F")).toBe(true)
  })

  test("rejects non-loopback preview urls", async () => {
    const http = makeHttp(cors)
    const handle = createPreviewOpenHandler({ http })
    const req = new Request("http://localhost/api/browser/preview/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    })
    const res = await handle(req)
    const json = (await res.json()) as {
      ok: boolean
      error?: { code?: string }
    }

    expect(res.status).toBe(400)
    expect(json.ok).toBe(false)
    expect(json.error?.code).toBe("invalid_preview_request")
  })

  test("returns 502 when cdp tab activation fails", async () => {
    const fetcher = async (url: string, init?: RequestInit) => {
      const method = typeof init?.method === "string" ? init.method : "GET"

      if (url.includes("/json/new?") && method === "PUT") {
        return new Response(JSON.stringify({ id: "tab-2" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }

      return new Response("", { status: 500 })
    }
    const http = makeHttp(cors)
    const handle = createPreviewOpenHandler({
      http,
      fetcher,
      cdpBase: "http://localhost:9222",
    })
    const req = new Request("http://localhost/api/browser/preview/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "http://localhost:3000" }),
    })
    const res = await handle(req)
    const json = (await res.json()) as {
      ok: boolean
      error?: { code?: string }
    }

    expect(res.status).toBe(502)
    expect(json.ok).toBe(false)
    expect(json.error?.code).toBe("preview_activate_failed")
  })
})
