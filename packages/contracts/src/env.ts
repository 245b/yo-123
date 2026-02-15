import { z } from "zod"

const placeholders = new Set([
  "replace_me",
  "replaceme",
  "sk-replace_me",
  "sk_replace_me",
  "none",
  "null",
  "unset",
  "disabled",
])

const secret = z
  .string()
  .trim()
  .min(1)
  .refine((v) => !placeholders.has(v.toLowerCase()), "Secret is unset or placeholder")

export const OperatorEnvSchema = z.object({
  DEEPSEEK_API_KEY: secret,
  TERM_AGENT_TOKEN: secret.optional(),
  TERM_AGENT_URL: z.string().trim().optional(),
  OPERATOR_DATA_DIR: z.string().trim().optional(),
  SEARCH_MODE: z.string().trim().optional(),
  ALLOW_TERMINAL_EXEC: z.string().trim().optional(),
})

export type OperatorEnv = z.infer<typeof OperatorEnvSchema>

export type EnvLike = Record<string, string | undefined>

export const normalizeOperatorEnv = (env: EnvLike): OperatorEnv => {
  const deepseek = (env.DEEPSEEK_API_KEY ?? env.OPERATOR_DEEPSEEK_API_KEY ?? env.DEEPSEEK_KEY ?? "").trim()
  const token = (env.TERM_AGENT_TOKEN ?? "").trim()
  const termUrl = (env.TERM_AGENT_URL ?? "").trim()
  const dataDir = (env.OPERATOR_DATA_DIR ?? "").trim()
  const searchMode = (env.SEARCH_MODE ?? "").trim()
  const allowTerminalExec = (env.ALLOW_TERMINAL_EXEC ?? "").trim()

  return {
    DEEPSEEK_API_KEY: deepseek,
    TERM_AGENT_TOKEN: token ? token : undefined,
    TERM_AGENT_URL: termUrl ? termUrl : undefined,
    OPERATOR_DATA_DIR: dataDir ? dataDir : undefined,
    SEARCH_MODE: searchMode ? searchMode : undefined,
    ALLOW_TERMINAL_EXEC: allowTerminalExec ? allowTerminalExec : undefined,
  }
}

export const parseOperatorEnv = (env: EnvLike) => OperatorEnvSchema.safeParse(normalizeOperatorEnv(env))