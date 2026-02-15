const mutating = new Set([
  "terminal_exec",
  "terminal_send",
  "terminate_command",
  "fs_write",
  "fs_move",
  "fs_copy",
  "fs_delete",
  "fs_mkdir",
  "fs_purge",
  "fs_apply_patch",
  "fs_replace_ranges",
  "project_setup",
  "project_install",
  "project_run",
  "project_test",
  "editor_open",
])

export const isMutatingTool = (name: string) => {
  const raw = typeof name === "string" ? name : ""
  const tool = raw.trim()

  if (!tool) {
    return false
  }

  return mutating.has(tool)
}

export type ToolMeta = {
  id: string
}

export type ToolInvocation = {
  name: string
  args: Record<string, unknown>
  meta: ToolMeta
}

export type ToolGate = {
  run: <T>(fn: () => Promise<T>) => Promise<T>
}

export type ToolHandler = {
  run: (inv: ToolInvocation) => Promise<unknown>
  isMutating?: (inv: ToolInvocation) => boolean
}

export class ToolRegistry {
  private readonly gate: ToolGate | null
  private readonly handlers = new Map<string, ToolHandler>()

  constructor(gate?: ToolGate | null) {
    this.gate = gate ?? null
  }

  register(name: string, handler: ToolHandler) {
    const raw = typeof name === "string" ? name : ""
    const tool = raw.trim()

    if (!tool) {
      return false
    }

    if (!handler || typeof handler.run !== "function") {
      return false
    }

    this.handlers.set(tool, handler)
    return true
  }

  dispatch(name: string, args: Record<string, unknown>, meta: ToolMeta) {
    const raw = typeof name === "string" ? name : ""
    const tool = raw.trim()

    if (!tool) {
      return Promise.resolve({ ok: false, error: "Missing tool name" })
    }

    const handler = this.handlers.get(tool) ?? null

    if (!handler) {
      return Promise.resolve({ ok: false, error: `Unknown tool: ${tool}` })
    }

    const inv: ToolInvocation = {
      name: tool,
      args: args ?? {},
      meta,
    }

    const fn = () => handler.run(inv)
    const mut = typeof handler.isMutating === "function" ? handler.isMutating(inv) : isMutatingTool(tool)
    const gate = this.gate

    if (mut && gate) {
      return gate.run(fn)
    }

    return fn()
  }
}
