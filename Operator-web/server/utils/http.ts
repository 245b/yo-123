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

  const bad = (msg: string, st = 400) => json({ ok: false, error: msg }, st)

  return { json, bad }
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
