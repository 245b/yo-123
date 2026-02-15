import { ServiceCollection } from "./service-collection"
import type { IServiceContainer, IServiceIdentifier, ServiceValue, SyncDescriptor } from "./interfaces"

const isObject = (raw: unknown): raw is Record<string, unknown> => {
  return !!raw && typeof raw === "object"
}

const isSyncDescriptor = <T>(raw: ServiceValue<T>): raw is SyncDescriptor<T> => {
  if (!isObject(raw)) {
    return false
  }

  return "ctor" in raw
}

export class InstantiationService implements IServiceContainer {
  private readonly constructing = new Set<string>()

  constructor(
    private readonly services: ServiceCollection = new ServiceCollection(),
    private readonly parent?: InstantiationService,
  ) {}

  set<T>(id: IServiceIdentifier<T>, value: ServiceValue<T>) {
    this.services.set(id, value)
  }

  get<T>(id: IServiceIdentifier<T>): T | undefined {
    const local = this.services.get(id)

    if (local === undefined) {
      const up = this.parent?.get(id)

      if (up !== undefined) {
        return up
      }

      return undefined
    }

    if (isSyncDescriptor(local)) {
      const created = this.instantiate(id, local)
      this.services.set(id, created)
      return created
    }

    return local
  }

  require<T>(id: IServiceIdentifier<T>) {
    const got = this.get(id)

    if (got !== undefined) {
      return got
    }

    throw new Error(`Missing required service: ${id.id}`)
  }

  createChild() {
    return new InstantiationService(new ServiceCollection(), this)
  }

  private instantiate<T>(id: IServiceIdentifier<T>, desc: SyncDescriptor<T>) {
    const key = id.id

    if (this.constructing.has(key)) {
      throw new Error(`Cyclic dependency detected while constructing ${key}`)
    }

    this.constructing.add(key)

    const depIds = Array.isArray(desc.ctor.dependencies) ? desc.ctor.dependencies : []
    const depArgs: unknown[] = []

    for (var i = 0; i < depIds.length; i++) {
      const depId = depIds[i]

      if (!depId) {
        continue
      }

      depArgs.push(this.require(depId))
    }

    const staticArgs = Array.isArray(desc.staticArgs) ? desc.staticArgs : []
    const ctor = desc.ctor as new (...args: unknown[]) => T
    const value = new ctor(...depArgs, ...staticArgs)
    this.constructing.delete(key)
    return value
  }
}
