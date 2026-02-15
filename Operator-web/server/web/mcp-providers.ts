import { clean } from "../utils/text"
import { getIntegrationManifest } from "../../../packages/integrations/src/registry"

const hasIntegration = (id: string) => !!getIntegrationManifest(id)

export const normProvider = (raw: string) => {
  const t = clean(raw).toLowerCase()

  if (!t) {
    return ""
  }

  if (t === "ddg" || t === "duckduckgo" || t === "duck") {
    if (!hasIntegration("ddg-search")) {
      return ""
    }

    return "ddg"
  }

  if (t === "searxng" || t === "searx") {
    return "searxng"
  }

  if (t === "ctx7" || t === "context7") {
    if (!hasIntegration("ctx7-search")) {
      return ""
    }

    return "ctx7"
  }

  return ""
}

export const providerManifest = (id: string) => {
  if (id === "ddg") {
    return getIntegrationManifest("ddg-search")
  }

  if (id === "ctx7") {
    return getIntegrationManifest("ctx7-search")
  }

  if (id === "yt") {
    return getIntegrationManifest("yt-transcript")
  }

  return null
}

export const providerArgs = (id: string, kind: string) => {
  const out: Record<string, unknown> = {}

  if (id !== "searxng") {
    return out
  }

  if (kind !== "news") {
    return out
  }

  out.categories = "news"
  out.time_range = "day"
  return out
}

export const mergeResults = <T extends { url: string }>(base: T[], extra: T[], limit: number) => {
  if (!extra.length) {
    return base
  }

  const out = base.slice()
  const seen = new Set<string>()

  for (var i = 0; i < out.length; i++) {
    const url0 = clean(out[i]?.url ?? "")

    if (!url0) {
      continue
    }

    seen.add(url0)
  }

  for (var i = 0; i < extra.length; i++) {
    if (limit > 0 && out.length >= limit) {
      break
    }

    const row = extra[i]
    const url = clean(row?.url ?? "")

    if (!url) {
      continue
    }

    if (seen.has(url)) {
      continue
    }

    seen.add(url)
    out.push(row)
  }

  if (limit > 0 && out.length > limit) {
    return out.slice(0, limit)
  }

  return out
}
