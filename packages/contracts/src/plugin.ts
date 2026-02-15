import { z } from "zod"

export const IntegrationKindSchema = z.enum(["provider", "tool", "bridge", "runtime"])

export const IntegrationManifestSchema = z.object({
  id: z.string().trim().min(1),
  kind: IntegrationKindSchema,
  capabilities: z.array(z.string().trim().min(1)).min(1),
  configSchema: z.record(z.unknown()),
})

export const IntegrationHealthSchema = z.object({
  ok: z.boolean(),
  detail: z.string().optional(),
})

export type IntegrationManifest = z.infer<typeof IntegrationManifestSchema>
export type IntegrationHealth = z.infer<typeof IntegrationHealthSchema>

export type IntegrationRuntime = IntegrationManifest & {
  run: (input: unknown) => Promise<unknown>
  healthCheck: () => Promise<IntegrationHealth>
}