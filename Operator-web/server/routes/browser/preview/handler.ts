import { body } from "../../../utils/http"
import { parsePreviewOpenBody } from "./schema"

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

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

const trim = (raw: unknown) => {
  const text0 = typeof raw === "string" ? raw : ""
  return text0.trim()
}

const cdpHttpBase = (raw: string | undefined) => {
  const env0 = trim(process.env.BROWSER_CDP_HTTP_URL)
  const env1 = env0 || trim(process.env.OPERATOR_BROWSER_CDP_HTTP_URL)
  const fromEnv = env1 || "http://localhost:9222"
  const text0 = trim(raw)
  const text = text0 || fromEnv
  return text.replace(/\/+$/, "")
}

const readTabId = (raw: unknown) => {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
  return trim(row?.id)
}

export const createPreviewOpenHandler = (deps: {
  http: HttpPort
  fetcher?: Fetcher
  cdpBase?: string
}) => {
  const fetcher = deps.fetcher ?? fetch

  return async (req: Request) => {
    const payload = await body(req)
    const parsed = parsePreviewOpenBody(payload)

    if (!parsed.success) {
      return deps.http.fail(req, "invalid_preview_request", "Invalid preview request", 400, parsed.error.flatten())
    }

    const url = parsed.data.url
    const cdp = cdpHttpBase(deps.cdpBase)
    const encoded = encodeURIComponent(url)
    const openUrl = `${cdp}/json/new?${encoded}`
    const opened = await fetcher(openUrl, { method: "PUT" }).catch(() => null)

    if (!opened || !opened.ok) {
      return deps.http.fail(req, "preview_open_failed", "Failed to open preview in browser", 502, { url })
    }

    const openedJson = await opened.json().catch(() => null)
    const tabId = readTabId(openedJson)

    if (tabId) {
      const activateUrl = `${cdp}/json/activate/${encodeURIComponent(tabId)}`
      const activated = await fetcher(activateUrl, { method: "GET" }).catch(() => null)

      if (!activated || !activated.ok) {
        return deps.http.fail(req, "preview_activate_failed", "Failed to focus preview tab", 502, { url, tabId })
      }
    }

    return deps.http.ok(req, { ok: true, url, tabId: tabId || undefined })
  }
}
