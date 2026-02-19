import { apiBaseCandidates, apiUrlWithBase, probeApiBase, rememberApiBase } from "../../lib/api"

const trim = (raw: unknown) => {
  const text0 = typeof raw === "string" ? raw : ""
  return text0.trim()
}

const withFallbackBase = (list: string[]) => {
  const out: string[] = []

  for (var i = 0; i < list.length; i++) {
    const row = trim(list[i])

    if (out.includes(row)) {
      continue
    }

    out.push(row)
  }

  if (out.includes("")) {
    return out
  }

  out.push("")
  return out
}

const requestPreviewOpen = async (base: string, previewUrl: string) => {
  const path = "/api/browser/preview/open"
  const url = apiUrlWithBase(path, base)
  const req = {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ url: previewUrl }),
  }
  const res = await window.fetch(url, req).catch(() => null)

  if (!res) {
    return false
  }

  if (res.status === 404) {
    return false
  }

  if (base) {
    rememberApiBase(base)
  }

  return res.ok
}

const tryPreviewOpen = async (bases: string[], previewUrl: string) => {
  for (var i = 0; i < bases.length; i++) {
    const base = trim(bases[i])
    const ok = await requestPreviewOpen(base, previewUrl)

    if (!ok) {
      continue
    }

    return true
  }

  return false
}

export const openBrowserPreview = async (rawUrl: string) => {
  const previewUrl = trim(rawUrl)

  if (!previewUrl) {
    return false
  }

  const first = withFallbackBase(apiBaseCandidates())
  const okFirst = await tryPreviewOpen(first, previewUrl)

  if (okFirst) {
    return true
  }

  await probeApiBase()
  const second = withFallbackBase(apiBaseCandidates())
  return tryPreviewOpen(second, previewUrl)
}
