import { z } from "zod"

const chatIdPattern = /^[a-zA-Z0-9_-]{4,128}$/

export const ChatIdSchema = z.string().trim().regex(chatIdPattern)

export const CleanupPathSchema = z.object({
  chatId: ChatIdSchema,
})

export const HealthQuerySchema = z.object({
  details: z
    .union([z.literal("1"), z.literal("true")])
    .optional(),
})

export const LegacyChatRequestSchema = z
  .object({
    msg: z.string().optional(),
    messages: z.array(z.unknown()).optional(),
  })
  .passthrough()

export const MutableSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.unknown(),
  requestId: z.string().trim().min(1),
  ts: z.string().trim().min(1),
})

export const TermAgentHealthSchema = z.object({
  ok: z.boolean(),
  ts: z.string().trim().min(1),
  session_root: z.string().trim().min(1),
  workspace_root: z.string().trim().min(1),
  token_configured: z.boolean(),
  tmux_available: z.boolean(),
  perms: z.array(z.string()),
})

export const PreviewOpenRequestSchema = z.object({
  url: z.string().trim().min(1),
})

export const PreviewOpenResponseSchema = z.object({
  ok: z.literal(true),
  url: z.string().trim().min(1),
  tabId: z.string().trim().min(1).optional(),
})
