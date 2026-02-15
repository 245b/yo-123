/*---------------------------------------------------------------------------------------------
 *  Ported (selective copy + adaptation) from OpenAI Codex (codex-rs):
 *  codex-rs/process-hardening/src/lib.rs
 *  License: Apache-2.0
 *--------------------------------------------------------------------------------------------*/

type Env = Record<string, string>

const hasOwn = (obj: object, key: string) => {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

export const sanitizeSpawnEnv = (input: Env) => {
  const out: Env = {}
  const keys = Object.keys(input)

  for (var i = 0; i < keys.length; i++) {
    const key = keys[i] ?? ""

    if (!key) {
      continue
    }

    if (key === "NODE_OPTIONS" || key === "BUN_OPTIONS") {
      continue
    }

    if (key.startsWith("LD_") || key.startsWith("DYLD_")) {
      continue
    }

    if (!hasOwn(input, key)) {
      continue
    }

    const value = input[key]

    if (typeof value !== "string") {
      continue
    }

    out[key] = value
  }

  return out
}

export const UNIFIED_EXEC_ENV_DEFAULTS: Array<[string, string]> = [
  ["NO_COLOR", "1"],
  ["TERM", "dumb"],
  ["LANG", "C.UTF-8"],
  ["LC_CTYPE", "C.UTF-8"],
  ["LC_ALL", "C.UTF-8"],
  ["COLORTERM", ""],
  ["PAGER", "cat"],
  ["GIT_PAGER", "cat"],
  ["GH_PAGER", "cat"],
]

export const applyUnifiedExecEnvDefaults = (input: Env) => {
  const out: Env = { ...input }

  for (var i = 0; i < UNIFIED_EXEC_ENV_DEFAULTS.length; i++) {
    const row = UNIFIED_EXEC_ENV_DEFAULTS[i]

    if (!row) {
      continue
    }

    const key = row[0]
    const value = row[1]
    out[key] = value
  }

  return out
}
