import type { IServiceIdentifier, ServiceValue } from "./interfaces"

export class ServiceCollection {
  private readonly entries = new Map<string, ServiceValue<unknown>>()

  set<T>(id: IServiceIdentifier<T>, value: ServiceValue<T>) {
    this.entries.set(id.id, value as ServiceValue<unknown>)
  }

  get<T>(id: IServiceIdentifier<T>) {
    const row = this.entries.get(id.id)

    if (row) {
      return row as ServiceValue<T>
    }

    return undefined
  }

  has<T>(id: IServiceIdentifier<T>) {
    return this.entries.has(id.id)
  }

  remove<T>(id: IServiceIdentifier<T>) {
    this.entries.delete(id.id)
  }

  clone() {
    const next = new ServiceCollection()

    for (const [key, value] of this.entries) {
      next.entries.set(key, value)
    }

    return next
  }
}
