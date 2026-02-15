import { describe, expect, test } from "bun:test"
import { makeHttp } from "./http"

const cors = {
  "access-control-allow-origin": "*",
}

describe("http envelopes", () => {
  test("returns success envelope with requestId", async () => {
    const http = makeHttp(cors)
    const req = new Request("http://localhost/api/health")
    const res = http.ok(req, { ping: "pong" })
    const body = (await res.json()) as {
      ok: boolean
      requestId?: string
      ts?: string
      data?: { ping?: string }
    }

    expect(body.ok).toBe(true)
    expect(typeof body.requestId).toBe("string")
    expect(typeof body.ts).toBe("string")
    expect(body.data?.ping).toBe("pong")
  })

  test("returns error envelope with code and requestId", async () => {
    const http = makeHttp(cors)
    const req = new Request("http://localhost/api/health")
    const res = http.fail(req, "bad_request", "Bad input", 400)
    const body = (await res.json()) as {
      ok: boolean
      error?: {
        code?: string
        message?: string
        requestId?: string
        ts?: string
      }
    }

    expect(body.ok).toBe(false)
    expect(body.error?.code).toBe("bad_request")
    expect(body.error?.message).toBe("Bad input")
    expect(typeof body.error?.requestId).toBe("string")
    expect(typeof body.error?.ts).toBe("string")
  })
})