import { errorEnvelope, okEnvelope } from "../../../packages/observability/src/envelope"
import { requestMetaFrom } from "../../../packages/observability/src/request"

export const makeHttp = (corsHeaders: HeadersInit) => {
  const json = (v: unknown, st = 200, hs?: HeadersInit) =>
    new Response(JSON.stringify(v), {
      status: st,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        ...corsHeaders,
        ...(hs ?? {}),
      },
    })

  const ok = (req: Request | null | undefined, data: unknown, st = 200) => {
    const meta = requestMetaFrom(req)
    const body = okEnvelope(data, meta.requestId, meta.ts)
    return json(body, st, { "x-request-id": meta.requestId })
  }

  const fail = (
    req: Request | null | undefined,
    code: string,
    message: string,
    st = 400,
    details?: unknown,
  ) => {
    const meta = requestMetaFrom(req)
    const body = errorEnvelope({
      code,
      message,
      details,
      requestId: meta.requestId,
      ts: meta.ts,
    })
    return json(body, st, { "x-request-id": meta.requestId })
  }

  const bad = (msg: string, st = 400, req?: Request | null, code = "bad_request", details?: unknown) =>
    fail(req, code, msg, st, details)

  return { json, ok, fail, bad }
}

export const body = async (req: Request) => {
  const ct = req.headers.get("content-type") ?? ""

  if (!ct.toLowerCase().includes("application/json")) {
    return
  }

  const out = (await req.json().catch(() => null)) as unknown

  if (!out) {
    return
  }

  return out
}
