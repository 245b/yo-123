export const okEnvelope = <T>(data: T, requestId: string, ts?: string) => ({
  ok: true as const,
  data,
  requestId,
  ts: ts ?? new Date().toISOString(),
})

export const errorEnvelope = (input: {
  code: string
  message: string
  requestId: string
  details?: unknown
  ts?: string
}) => {
  const details = typeof input.details === "undefined" ? undefined : input.details

  return {
    ok: false as const,
    error: {
      code: input.code,
      message: input.message,
      details,
      requestId: input.requestId,
      ts: input.ts ?? new Date().toISOString(),
    },
  }
}