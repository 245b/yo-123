import react from "@vitejs/plugin-react"
import type { IncomingMessage, ServerResponse } from "node:http"
import { resolve } from "node:path"
import { defineConfig, type Plugin } from "vite"

const repo0 = process.env.GITHUB_REPOSITORY ?? ""
const repo = repo0.split("/")[1] ?? ""
const gh = process.env.GITHUB_PAGES === "1"
const base = gh && repo ? `/${repo}/` : "/"
const root = process.cwd()
const html = {
  main: resolve(root, "index.html"),
  notFound: resolve(root, "404.html"),
}

const reload = (): Plugin => ({
  name: "ms-reload",
  configureServer: (s) => {
    s.watcher.add(["server/**"])

    s.watcher.on("change", (p) => {
      const v = (p ?? "").split("\\").join("/")

      if (!v.includes("/server/")) {
        return
      }

      s.ws.send({ type: "full-reload" })
    })
  },
})

export default defineConfig({
  base,
  plugins: [react(), reload()],
  build: {
    rollupOptions: {
      input: html,
    },
  },
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    fs: {
      allow: [resolve(root, "..")],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        configure: (p) => {
          const msg = "API server unreachable. Run: npm run dev:server (or restart with npm run dev)"
          const body = JSON.stringify({ ok: false, error: msg })

          p.on("error", (_e: unknown, _req: unknown, res: unknown) => {
            const r = res as ServerResponse<IncomingMessage> | null

            if (!r) {
              return
            }

            if (r.headersSent) {
              return
            }

            r.writeHead(502, {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            })
            r.end(body)
          })
        }
      }
    }
  }
})
