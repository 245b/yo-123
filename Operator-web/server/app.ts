import path from "node:path"
import { parseOperatorEnv } from "../../packages/contracts/src/env"
import { migrateOperatorData } from "../../packages/data/src/migrator"
import { loadEnv } from "./env"
import { buildConfig } from "./config"
import { makeHttp } from "./utils/http"
import { fileResponse } from "./api/static"
import { createChatCleanupService, type ChatCleanupService } from "./chat/cleanup"
import { createCleanupService } from "./routes/chats/cleanup/service"
import { createCleanupHandler } from "./routes/chats/cleanup/handler"
import { createLegacyChatHandler } from "./routes/chat/legacy/handler"
import { createHealthHandler } from "./routes/health/handler"
import { AgentWsController } from "./agent/ws"
import { RuntimeSupervisor } from "./agent/runtime/supervisor"

var srv0: ReturnType<typeof Bun.serve> | null = null

const normalizeDataDirEnv = (root: string) => {
  const op0 = (process.env.OPERATOR_DATA_DIR ?? "").trim()
  const data0 = (process.env.DATA_DIR ?? "").trim()
  const raw0 = op0 || data0

  if (!raw0) {
    return
  }

  const raw = raw0.trim()
  const abs = path.isAbsolute(raw) ? raw : path.resolve(root, raw)
  process.env.OPERATOR_DATA_DIR = abs

  if (data0) {
    process.env.DATA_DIR = abs
  }
}

const flagOn = (raw: string, fallback: boolean) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim().toLowerCase()

  if (!text) {
    return fallback
  }

  if (text === "0" || text === "false" || text === "off" || text === "no") {
    return false
  }

  return true
}

export const runServer = async () => {
  const root = path.resolve(import.meta.dir, "..")
  await loadEnv(root)
  normalizeDataDirEnv(root)
  const env = parseOperatorEnv(process.env as Record<string, string | undefined>)

  if (!env.success) {
    const reason = JSON.stringify(env.error.flatten())
    throw new Error(`Environment validation failed: ${reason}`)
  }

  const migrated = await migrateOperatorData(root)

  if (!migrated.ok) {
    const details = migrated.notes.join(", ")
    throw new Error(`Data migration failed: ${details}`)
  }

  const cfg = await buildConfig(root)
  const http = makeHttp(cfg.corsHeaders)
  const runtime = new RuntimeSupervisor({ root })
  const ws = new AgentWsController(runtime)
  void runtime.listSessions()
  const cleanupLocal = createChatCleanupService(root)
  const hostStates = runtime.hostStates()
  const dataHostOn = flagOn(process.env.OPERATOR_DATA_HOST_V1 || "", false)
  const cleanup: ChatCleanupService = dataHostOn && hostStates.enabled
    ? {
        start: () => {},
        request: (chatId: string) => runtime.cleanupChat(chatId),
      }
    : cleanupLocal
  const cleanupService = createCleanupService(cleanup)
  const healthRoute = createHealthHandler({ http, runtime })
  const legacyChatRoute = createLegacyChatHandler(http)
  const cleanupRoute = createCleanupHandler({ http, service: cleanupService })

  if (!(dataHostOn && hostStates.enabled)) {
    cleanupLocal.start()
  }

  const port0 = Number.parseInt(process.env.PORT ?? "", 10)
  const port = Number.isFinite(port0) && port0 > 0 ? port0 : 3000

  const srv = Bun.serve<{
    chatId: string
    sessionId: string
    mode: string
    approvalPolicy: string
    sandboxMode: string
    configured: boolean
    unsubscribe?: (() => void) | null
  }>({
    port,
    idleTimeout: 120,
    fetch: async (req, server) => {
      const url = new URL(req.url)
      const p = url.pathname

      if (req.method === "OPTIONS") {
        return new Response("", { headers: cfg.corsHeaders })
      }

      if (p === "/api/health" && req.method === "GET") {
        return healthRoute(req)
      }

      if (p === "/api/chat" && req.method === "POST") {
        return legacyChatRoute(req)
      }

      if (p === "/api/chat/ws") {
        const ok = server.upgrade(req, {
          data: {
            chatId: "operator",
            sessionId: "operator",
            mode: "chat",
            approvalPolicy: "",
            sandboxMode: "",
            configured: false,
            unsubscribe: null,
          },
        })

        if (ok) {
          return
        }

        return http.fail(req, "websocket_upgrade_failed", "WebSocket upgrade failed", 426)
      }

      if (p.startsWith("/api/chats/") && p.endsWith("/cleanup") && req.method === "POST") {
        return cleanupRoute(req, p)
      }

      if (p.startsWith("/api/")) {
        return http.fail(req, "not_found", "Not found", 404)
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

      return new Response("Missing build output. Run: bun run build", { status: 404 })
    },
    websocket: {
      open: (socket) => {
        ws.open(socket)
      },
      message: (socket, message) => {
        void ws.message(socket, message)
      },
      close: (socket) => {
        ws.close(socket)
      },
    },
  })

  srv0 = srv
  console.log(`Server running on http://localhost:${srv.port}`)
}
