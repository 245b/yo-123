import { clean } from "../utils/text"
import { vendorsForQuery } from "./sources"

const hasKey = (t: string, keys: string[]) => {
  if (!t || !keys.length) {
    return false
  }

  for (var i = 0; i < keys.length; i++) {
    const k0 = keys[i] ?? ""
    const k = k0.trim().toLowerCase()

    if (!k) {
      continue
    }

    if (t.includes(k)) {
      return true
    }
  }

  return false
}

const isCatalog = (q: string) => {
  const t = clean(q).toLowerCase()

  if (!t) {
    return false
  }

  const vs = vendorsForQuery(t)

  if (!vs.length) {
    return false
  }

  const keys = [
    "model",
    "models",
    "model lineup",
    "model list",
    "model catalog",
    "model release",
    "model versions",
    "model family",
    "model names",
    "available models",
    "latest model",
    "current model",
    "newest model",
    "release",
    "release notes",
    "version",
    "versions",
    "version list",
    "version history",
    "lineup",
    "catalog",
    "list",
    "roster",
    "variants",
    "series",
    "model card",
    "model cards",
    "changelog",
    "pricing",
    "price",
  ]

  return hasKey(t, keys)
}

const isDocs = (q: string) => {
  const t = clean(q).toLowerCase()

  if (!t) {
    return false
  }

  const keys = [
    "docs",
    "documentation",
    "reference",
    "api",
    "sdk",
    "spec",
    "specification",
    "developer",
    "guide",
    "manual",
  ]

  return hasKey(t, keys)
}

const isTime = (t: string) => {
  if (!t) {
    return false
  }

  if (t.includes("time zone") || t.includes("timezone")) {
    return true
  }

  if (t.includes("current time") || t.includes("local time")) {
    return true
  }

  if (t.includes("what time") || t.includes("time is it")) {
    return true
  }

  if (t.includes("time in ") || t.includes("time at ") || t.includes("time for ")) {
    return true
  }

  if (t.startsWith("time in ") || t.startsWith("time at ") || t.startsWith("time for ")) {
    return true
  }

  if (t.includes("release date") || t.includes("publication date") || t.includes("publish date")) {
    return false
  }

  if (t.includes("due date") || t.includes("expiry date") || t.includes("expiration date") || t.includes("birth date")) {
    return false
  }

  if (t.includes("today") && t.includes("date")) {
    return true
  }

  if (t.includes("current date") || t.includes("date today")) {
    return true
  }

  if (t.includes("what's the date") || t.includes("whats the date") || t.includes("what is the date")) {
    return true
  }

  if (t.includes("what date is it") || t.includes("what day is it")) {
    return true
  }

  if (t === "date" || t === "the date") {
    return true
  }

  if (t.startsWith("date in ") || t.startsWith("date at ") || t.startsWith("date for ")) {
    return true
  }

  if (t.includes("date in ") || t.includes("date at ") || t.includes("date for ")) {
    return true
  }

  return false
}

export const kind = (q: string) => {
  const t = clean(q).toLowerCase()

  if (!t) {
    return ""
  }

  if (isTime(t)) {
    return "time"
  }

  if (isCatalog(t)) {
    return "model_catalog"
  }

  if (t.includes("news") || t.includes("headlines") || t.includes("top stories")) {
    return "news"
  }

  if (t.includes("what's the news") || t.includes("whats the news")) {
    return "news"
  }

  if (t.includes("breaking") || t.includes("current events")) {
    return "news"
  }

  if (isDocs(t)) {
    return "docs"
  }

  const keys = [
    "search",
    "look up",
    "find",
    "source",
    "citation",
    "cite",
    "website",
    "web",
    "docs",
    "documentation",
    "reference",
    "price",
    "pricing",
    "release",
    "version",
    "current",
    "today",
    "latest",
    "updated",
    "as of",
    "map code",
    "island code",
    "creator code",
    "promo code",
    "coupon code",
  ]

  for (var i = 0; i < keys.length; i++) {
    const k0 = keys[i] ?? ""
    const k = k0.trim()

    if (!k) {
      continue
    }

    if (t.includes(k)) {
      return "web"
    }
  }

  return ""
}

export const fresh = (q: string, k: string) => {
  if (k === "news") {
    return true
  }

  const t = clean(q).toLowerCase()

  if (!t) {
    return false
  }

  const keys = [
    "latest",
    "current",
    "today",
    "this week",
    "this month",
    "this year",
    "breaking",
    "recent",
    "announced",
    "announcement",
    "released",
    "release",
    "price",
    "pricing",
    "version",
    "updated",
    "update",
    "as of",
    "now",
    "right now",
  ]

  for (var i = 0; i < keys.length; i++) {
    const k0 = keys[i] ?? ""
    const w = k0.trim()

    if (!w) {
      continue
    }

    if (t.includes(w)) {
      return true
    }
  }

  return false
}
