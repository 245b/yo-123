import { z } from "zod"
import { PreviewOpenRequestSchema } from "../../../../../packages/contracts/src/http"

const PreviewOpenBodySchema = z.object({
  url: z.string().trim().min(1),
})

const canParseUrl = (raw: string) => {
  const api = URL as typeof URL & {
    canParse?: (url: string) => boolean
  }
  const fn = api.canParse

  if (typeof fn !== "function") {
    return false
  }

  return fn(raw)
}

const loopbackHost = (raw: string) => {
  const host0 = typeof raw === "string" ? raw : ""
  const host = host0.trim().toLowerCase()

  if (!host) {
    return false
  }

  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
    return true
  }

  if (host === "::1" || host === "[::1]") {
    return true
  }

  return false
}

export const normalizePreviewOpenUrl = (raw: string) => {
  const text = (typeof raw === "string" ? raw : "").trim()

  if (!text) {
    return ""
  }

  if (!canParseUrl(text)) {
    return ""
  }

  const parsed = new URL(text)
  const protocol = parsed.protocol.toLowerCase()

  if (protocol !== "http:" && protocol !== "https:") {
    return ""
  }

  const host = parsed.hostname.toLowerCase()

  if (!loopbackHost(host)) {
    return ""
  }

  if (host === "0.0.0.0") {
    parsed.hostname = "localhost"
  }

  return parsed.toString()
}

export const parsePreviewOpenBody = (raw: unknown) => {
  const parsed = PreviewOpenRequestSchema.safeParse(raw)

  if (!parsed.success) {
    return parsed
  }

  const url = normalizePreviewOpenUrl(parsed.data.url)
  return PreviewOpenBodySchema.safeParse({ url })
}
