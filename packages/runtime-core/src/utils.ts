import type { Event, Listener } from "./interfaces"

export const createEmitter = <T>() => {
  const listeners = new Set<Listener<T>>()

  const event: Event<T> = (listener) => {
    listeners.add(listener)

    return {
      dispose: () => {
        listeners.delete(listener)
      },
    }
  }

  const fire = (input: T) => {
    for (const listener of listeners) {
      listener(input)
    }
  }

  return { event, fire }
}

export const safeJsonParse = (raw: string) => {
  const t0 = typeof raw === "string" ? raw : ""
  const t = t0.trim()

  if (!t) {
    return null
  }

  try {
    return JSON.parse(t) as unknown
  } catch {
    return null
  }
}

export const randomId = () => {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 10)
  return `${t}-${r}`
}
