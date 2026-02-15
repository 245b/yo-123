import { z } from "zod"
import type { RuntimeRole } from "./runtime-ipc"

export type HostState = "starting" | "ready" | "degraded" | "stopped"

export type HostHealthEvent = {
  id: string
  hostRole: RuntimeRole
  state: HostState
  heartbeatLagMs: number
  restartCount: number
  restartLimit: number
  windowMs: number
  ts: string
  reason?: string
}

export const HostStateSchema = z.enum(["starting", "ready", "degraded", "stopped"])

export const HostHealthEventSchema = z.object({
  id: z.string().trim().min(1),
  hostRole: z.enum(["control-plane", "runtime-supervisor", "exec-host", "pty-host", "extension-host", "lsp-host", "data-host"]),
  state: HostStateSchema,
  heartbeatLagMs: z.number().int().min(0),
  restartCount: z.number().int().min(0),
  restartLimit: z.number().int().min(1),
  windowMs: z.number().int().min(1),
  ts: z.string().trim().min(1),
  reason: z.string().optional(),
})

export const decodeHostHealthEvent = (raw: unknown) => HostHealthEventSchema.safeParse(raw)
