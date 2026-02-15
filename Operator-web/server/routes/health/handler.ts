import { sessionEnsure } from "../../terminal/client"
import type { RuntimeSupervisor } from "../../agent/runtime/supervisor"
import { parseHealthQuery } from "./schema"
import { TermAgentHealthSchema } from "../../../../packages/contracts/src/http"

type HttpPort = {
  ok: (req: Request | null | undefined, data: unknown, st?: number) => Response
  fail: (
    req: Request | null | undefined,
    code: string,
    message: string,
    st?: number,
    details?: unknown,
  ) => Response
}

export const createHealthHandler = (deps: { http: HttpPort; runtime: RuntimeSupervisor }) => {
  return async (req: Request) => {
    const parsed = parseHealthQuery(new URL(req.url))

    if (!parsed.success) {
      return deps.http.fail(req, "invalid_query", "Invalid health query", 400, parsed.error.flatten())
    }

    const details = !!parsed.data.details

    if (!details) {
      return deps.http.ok(req, {
        status: "ok",
        checks: { api: true },
      })
    }

    const runtime = await deps.runtime.listSessions()
    const runtimeHosts = deps.runtime.hostStates()
    const runtimeHostsOk =
      runtimeHosts.enabled !== true || (runtimeHosts.extensionHost !== "degraded" && runtimeHosts.lspHost !== "degraded")
    const termBase0 = (process.env.TERM_AGENT_URL ?? "").trim()
    const termBase = termBase0 || "http://workspace:7682"
    const termHealthUrl = `${termBase.replace(/\/$/, "")}/v1/health`
    const termHealthRaw = await fetch(termHealthUrl, { method: "GET", signal: AbortSignal.timeout(3000) })
      .then((res) => {
        if (!res.ok) {
          return null as unknown
        }

        return res.json()
      })
      .catch(() => null)
    const termHealth = TermAgentHealthSchema.safeParse(termHealthRaw)
    const term = await sessionEnsure().catch(() => ({ ok: false, error: "TERM agent unavailable" }))
    const checks = {
      api: true,
      runtime: runtime.ok === true,
      runtimeHosts: runtimeHostsOk,
      termAgentHealth: termHealth.success && termHealth.data.ok === true,
      termAgent: term.ok === true,
    }
    const healthy = checks.runtime && checks.runtimeHosts && checks.termAgent && checks.termAgentHealth

    if (healthy) {
      return deps.http.ok(req, {
        status: "ok",
        checks,
      })
    }

    return deps.http.fail(req, "health_unhealthy", "Dependency check failed", 503, {
        checks,
        runtimeError: runtime.ok ? "" : runtime.error,
        runtimeHosts,
        termAgentHealthError: termHealth.success ? "" : "Invalid /v1/health payload",
        termAgentError: term.ok ? "" : term.error,
      })
  }
}
