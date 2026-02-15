import type { IServiceIdentifier } from "./interfaces"

const ids = new Map<string, IServiceIdentifier<unknown>>()

export const createServiceIdentifier = <T>(raw: string): IServiceIdentifier<T> => {
  const id0 = typeof raw === "string" ? raw : ""
  const id = id0.trim()

  if (!id) {
    throw new Error("Service id is required")
  }

  const seen = ids.get(id)

  if (seen) {
    return seen as IServiceIdentifier<T>
  }

  const next = { id } as IServiceIdentifier<T>
  ids.set(id, next as IServiceIdentifier<unknown>)
  return next
}
