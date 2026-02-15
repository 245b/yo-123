type HttpPort = {
  fail: (
    req: Request | null | undefined,
    code: string,
    message: string,
    st?: number,
    details?: unknown,
  ) => Response
}

export const createLegacyChatHandler = (http: HttpPort) => {
  return (req: Request) => {
    return http.fail(
      req,
      "chat_route_removed",
      "POST /api/chat has been removed. Use /api/chat/ws for the Codex-style event loop.",
      410,
    )
  }
}