import { IntegrationManifestSchema, type IntegrationManifest } from "../../contracts/src/plugin"
import { generatedIntegrationRegistry } from "./generated/registry"
import { integrationManifests } from "./manifests"

export const integrationRegistry = generatedIntegrationRegistry

export const listIntegrations = () => Object.values(integrationRegistry)

export const getIntegrationManifest = (id: string): IntegrationManifest | null => {
  const key = (id ?? "").trim()

  if (!key) {
    return null
  }

  const row = integrationRegistry[key]

  if (!row) {
    return null
  }

  const parsed = IntegrationManifestSchema.safeParse(row)

  if (!parsed.success) {
    return null
  }

  return parsed.data
}

export const validateIntegrationRegistry = () => {
  for (var i = 0; i < integrationManifests.length; i++) {
    const row = integrationManifests[i]
    const parsed = IntegrationManifestSchema.safeParse(row)

    if (!parsed.success) {
      return parsed
    }
  }

  return {
    success: true as const,
    data: integrationManifests,
  }
}