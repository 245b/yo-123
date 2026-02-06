import path from "node:path"
import { safe } from "../utils/path"

export const fileResponse = async (base: string, url: URL) => {
  const raw = decodeURIComponent(url.pathname)
  const rel = raw.startsWith("/") ? raw.slice(1) : raw

  if (!rel || rel.endsWith("/")) {
    return
  }

  const fp = path.resolve(base, rel)
  const ok = safe(fp).startsWith(`${safe(base)}/`) || safe(fp) === safe(base)

  if (!ok) {
    return
  }

  const f = Bun.file(fp)
  const ex = await f.exists()

  if (!ex) {
    return
  }

  const hs = new Headers()
  hs.set("cache-control", rel.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache")
  return new Response(f, { headers: hs })
}
