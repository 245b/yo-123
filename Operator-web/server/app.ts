import path from "node:path"
import { loadEnv } from "./env"
import { buildConfig } from "./config"
import { makeHttp } from "./utils/http"
import { fileResponse } from "./api/static"
import { createChatHandler } from "./chat"
import { createChatCleanupService } from "./chat/cleanup"

var srv0: ReturnType<typeof Bun.serve> | null = null

export const runServer = async () => {
  const root = path.resolve(import.meta.dir, "..")
  await loadEnv(root)

  const cfg = await buildConfig(root)
  const http = makeHttp(cfg.corsHeaders)
  const chat = createChatHandler({
    root,
    corsHeaders: cfg.corsHeaders,
    json: http.json,
    bad: http.bad,
  })
  const cleanup = createChatCleanupService(root)
  cleanup.start()

  const port0 = Number.parseInt(process.env.PORT ?? "", 10)
  const port = Number.isFinite(port0) && port0 > 0 ? port0 : 3000

  const srv = Bun.serve({
    port,
    idleTimeout: 120,
    fetch: async (req) => {
      const url = new URL(req.url)
      const p = url.pathname

      if (req.method === "OPTIONS") {
        return new Response("", { headers: cfg.corsHeaders })
      }

      if (p === "/api/health") {
        return http.json({ ok: true, ts: new Date().toISOString() })
      }

      if (p === "/api/chat" && req.method === "POST") {
        return chat(req)
      }

      if (p.startsWith("/api/chats/") && p.endsWith("/cleanup") && req.method === "POST") {
        const pre = "/api/chats/"
        const post = "/cleanup"
        const raw = p.slice(pre.length, Math.max(pre.length, p.length - post.length))
        const id0 = raw
        const id = id0.trim()
        const out = await cleanup.request(id)
        const st = out.ok ? 200 : 400
        return http.json(out, st)
      }

      if (p.startsWith("/api/")) {
        return http.bad("Not found", 404)
      }

      if (p === "/") {
        const idx = await fileResponse(cfg.dist, new URL("http://x/index.html"))

        if (idx) {
          return idx
        }
      }

      const d = await fileResponse(cfg.dist, url)

      if (d) {
        return d
      }

      const u = await fileResponse(cfg.pub, url)

      if (u) {
        return u
      }

      const idx = await fileResponse(cfg.dist, new URL("http://x/index.html"))

      if (idx) {
        return idx
      }

      return new Response("Missing build output. Run: npm run build", { status: 404 })
    },
  })

  srv0 = srv
  console.log(`Server running on http://localhost:${srv.port}`)
}
