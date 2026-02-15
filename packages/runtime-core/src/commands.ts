import type { CommandDefinition, ICommandRegistry } from "./interfaces"
import { createEmitter } from "./utils"

const cleanCommandId = (raw: string) => {
  const t0 = typeof raw === "string" ? raw : ""
  const t = t0.trim()

  if (!t) {
    return ""
  }

  return t
}

export class CommandRegistry implements ICommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>()
  private readonly didRegister = createEmitter<{ id: string }>()

  readonly onDidRegister = this.didRegister.event

  register<TArgs extends readonly unknown[], TResult>(command: CommandDefinition<TArgs, TResult>) {
    const id = cleanCommandId(command.id)

    if (!id) {
      throw new Error("Command id is required")
    }

    if (this.commands.has(id)) {
      throw new Error(`Command already registered: ${id}`)
    }

    this.commands.set(id, command as CommandDefinition)
    this.didRegister.fire({ id })

    return {
      dispose: () => {
        this.commands.delete(id)
      },
    }
  }

  has(id: string) {
    const key = cleanCommandId(id)

    if (!key) {
      return false
    }

    return this.commands.has(key)
  }

  list() {
    return Array.from(this.commands.keys()).sort()
  }

  async execute<TResult>(id: string, args: readonly unknown[] = []) {
    const key = cleanCommandId(id)

    if (!key) {
      throw new Error("Command id is required")
    }

    const command = this.commands.get(key)

    if (!command) {
      throw new Error(`Unknown command: ${key}`)
    }

    const validate = command.validate

    if (typeof validate === "function") {
      const err0 = validate(args)
      const err = typeof err0 === "string" ? err0.trim() : ""

      if (err) {
        throw new Error(err)
      }
    }

    const out = await command.handler(...(args as readonly unknown[]))
    return out as TResult
  }
}
