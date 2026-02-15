export type RequestMeta = {
  requestId: string
  ts: string
}

const nowIso = () => new Date().toISOString()

const random = () => {
  const id0 = globalThis.crypto?.randomUUID?.() ?? ""
  const id = typeof id0 === "string" ? id0.trim() : ""

  if (id) {
    return id
  }

  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

export const createRequestId = () => random()

export const requestMetaFrom = (req?: Request | null): RequestMeta => {
  const id0 = req?.headers.get("x-request-id") ?? ""
  const id = id0.trim() || createRequestId()
  return {
    requestId: id,
    ts: nowIso(),
  }
}