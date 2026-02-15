export type ProviderResult = {
  ok: boolean
  data?: unknown
  error?: string
}

export type ProviderRun = (input: unknown) => Promise<ProviderResult>

export type ProviderHealth = () => Promise<{ ok: boolean; detail?: string }>

export type ProviderContract = {
  id: string
  run: ProviderRun
  healthCheck: ProviderHealth
}