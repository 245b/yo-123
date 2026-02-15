const placeholders = new Set([
  "replace_me",
  "replaceme",
  "sk-replace_me",
  "sk_replace_me",
  "none",
  "unset",
  "null",
  "disabled",
])

const read = () => {
  const env = process.env as Record<string, string | undefined>
  const key0 = env.DEEPSEEK_API_KEY ?? env.OPERATOR_DEEPSEEK_API_KEY ?? env.DEEPSEEK_KEY ?? ""
  const key = key0.trim()

  if (!key) {
    return ""
  }

  if (placeholders.has(key.toLowerCase())) {
    return ""
  }

  return key
}

export const readDeepSeekApiKey = () => read()