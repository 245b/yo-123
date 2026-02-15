import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { loadEnv } from "./env"

const cleanKeys = ["DEEPSEEK_API_KEY", "TERM_AGENT_TOKEN"]

const resetEnv = () => {
  for (var i = 0; i < cleanKeys.length; i++) {
    const key = cleanKeys[i] ?? ""

    if (!key) {
      continue
    }

    delete process.env[key]
  }
}

const withTempEnvFile = async (content: string, run: (root: string) => Promise<void>) => {
  const root = mkdtempSync(path.join(tmpdir(), "operator-env-test-"))
  const envPath = path.join(root, ".env")
  writeFileSync(envPath, content, "utf8")

  try {
    await run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

afterEach(() => {
  resetEnv()
})

describe("loadEnv", () => {
  test("replaces placeholder tokens with values from .env", async () => {
    process.env["DEEPSEEK_API_KEY"] = "replace_me"
    process.env["TERM_AGENT_TOKEN"] = "none"

    await withTempEnvFile("DEEPSEEK_API_KEY=sk-real\nTERM_AGENT_TOKEN=term-real\n", async (root) => {
      await loadEnv(root)
    })

    expect(process.env.DEEPSEEK_API_KEY).toBe("sk-real")
    expect(process.env.TERM_AGENT_TOKEN).toBe("term-real")
  })

  test("keeps existing non-placeholder values", async () => {
    process.env["DEEPSEEK_API_KEY"] = "sk-from-runtime"
    process.env["TERM_AGENT_TOKEN"] = "term-from-runtime"

    await withTempEnvFile("DEEPSEEK_API_KEY=sk-from-file\nTERM_AGENT_TOKEN=term-from-file\n", async (root) => {
      await loadEnv(root)
    })

    expect(process.env.DEEPSEEK_API_KEY).toBe("sk-from-runtime")
    expect(process.env.TERM_AGENT_TOKEN).toBe("term-from-runtime")
  })
})
