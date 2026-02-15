import { parseCleanupPath } from "./schema"
import type { CleanupService } from "./service"

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

export const createCleanupHandler = (deps: { http: HttpPort; service: CleanupService }) => {
  return async (req: Request, pathname: string) => {
    const parsed = parseCleanupPath(pathname)

    if (!parsed.success) {
      return deps.http.fail(req, "invalid_chat_id", "Invalid chatId", 400, parsed.error.flatten())
    }

    const out = await deps.service.request(parsed.data.chatId)

    if (out.ok) {
      return deps.http.ok(req, out)
    }

    return deps.http.fail(req, "cleanup_failed", "Cleanup request failed", 400, out)
  }
}