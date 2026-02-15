import type { HostHealthEvent } from "@operator/contracts/host-health"
import type { RuntimeEnvelope, RuntimeRole } from "@operator/contracts/runtime-ipc"

export type Disposable = {
  dispose: () => void
}

export type Listener<T> = (event: T) => void

export type Event<T> = (listener: Listener<T>) => Disposable

export type IServiceIdentifier<T> = {
  readonly id: string
  readonly _type?: T
}

export type DependencyCtor<T> = {
  new (...args: never[]): T
  dependencies?: readonly IServiceIdentifier<unknown>[]
}

export type SyncDescriptor<T> = {
  ctor: DependencyCtor<T>
  staticArgs?: readonly unknown[]
}

export type ServiceValue<T> = T | SyncDescriptor<T>

export type IServiceContainer = {
  set: <T>(id: IServiceIdentifier<T>, value: ServiceValue<T>) => void
  get: <T>(id: IServiceIdentifier<T>) => T | undefined
  require: <T>(id: IServiceIdentifier<T>) => T
  createChild: () => IServiceContainer
}

export type CommandDefinition<TArgs extends readonly unknown[] = readonly unknown[], TResult = unknown> = {
  id: string
  description?: string
  validate?: (args: readonly unknown[]) => string
  handler: (...args: TArgs) => TResult | Promise<TResult>
}

export type ICommandRegistry = {
  register: <TArgs extends readonly unknown[], TResult>(command: CommandDefinition<TArgs, TResult>) => Disposable
  execute: <TResult>(id: string, args?: readonly unknown[]) => Promise<TResult>
  has: (id: string) => boolean
  list: () => string[]
  onDidRegister: Event<{ id: string }>
}

export type IChannelClient = {
  send: (role: RuntimeRole, envelope: RuntimeEnvelope) => boolean
}

export type HostStartInput = {
  role: RuntimeRole
  cmd: string[]
  cwd?: string
  env?: Record<string, string>
  restartLimit: number
  restartWindowMs: number
  heartbeatTimeoutMs: number
}

export type IHostSupervisor = {
  start: (input: HostStartInput) => Promise<boolean>
  restart: (role: RuntimeRole, reason?: string) => boolean
  stop: (role: RuntimeRole) => void
  stopAll: () => void
  send: (role: RuntimeRole, envelope: RuntimeEnvelope) => boolean
  state: (role: RuntimeRole) => "starting" | "ready" | "degraded" | "stopped"
  onHealth: Event<HostHealthEvent>
  onEnvelope: Event<{ role: RuntimeRole; envelope: RuntimeEnvelope }>
}
