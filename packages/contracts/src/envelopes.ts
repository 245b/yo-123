import { z } from "zod"

export const RequestIdSchema = z.string().trim().min(1)
export const TimestampSchema = z.string().trim().min(1)

export const ApiErrorSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  details: z.unknown().optional(),
  requestId: RequestIdSchema,
  ts: TimestampSchema,
})

export const ErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: ApiErrorSchema,
})

export const successEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    ok: z.literal(true),
    data,
    requestId: RequestIdSchema,
    ts: TimestampSchema,
  })

export type ApiError = z.infer<typeof ApiErrorSchema>
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>
export type SuccessEnvelope<T> = {
  ok: true
  data: T
  requestId: string
  ts: string
}