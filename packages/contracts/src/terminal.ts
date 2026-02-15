import { z } from "zod"

export type TerminalCreate = {
  sessionId: string
  processId: string
  command: string
  cwd?: string
  cols?: number
  rows?: number
}

export type TerminalAttach = {
  sessionId: string
  processId: string
}

export type TerminalDetach = {
  sessionId: string
  processId: string
}

export type TerminalResize = {
  sessionId: string
  processId: string
  cols: number
  rows: number
}

export type TerminalRestore = {
  sessionId: string
  processId: string
  snapshot: TerminalSnapshot
}

export type TerminalSnapshot = {
  sessionId: string
  processId: string
  command: string
  cwd: string
  cols: number
  rows: number
  running: boolean
  output: string
  updatedAt: string
}

export const TerminalSnapshotSchema = z.object({
  sessionId: z.string().trim().min(1),
  processId: z.string().trim().min(1),
  command: z.string(),
  cwd: z.string(),
  cols: z.number().int().min(1),
  rows: z.number().int().min(1),
  running: z.boolean(),
  output: z.string(),
  updatedAt: z.string().trim().min(1),
})

export const decodeTerminalSnapshot = (raw: unknown) => TerminalSnapshotSchema.safeParse(raw)
