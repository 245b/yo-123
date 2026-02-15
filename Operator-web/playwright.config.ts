import { defineConfig } from "@playwright/test"
import path from "node:path"
import { fileURLToPath } from "node:url"

const port = Number.parseInt(process.env.PW_PORT ?? "", 10) || 4174
const root = path.dirname(fileURLToPath(import.meta.url))
const runId0 = (process.env.PW_RUN_ID ?? "").trim()
const runId = runId0 || `${Date.now()}-${process.pid}`
process.env.PW_RUN_ID = runId
const dataDir = path.join(root, "test-results", `server-data-${runId}`)
process.env.DATA_DIR = dataDir
process.env.OPERATOR_DATA_DIR = dataDir
const ptyBackend = process.env.OPERATOR_PTY_BACKEND || "pty-host-v2"
const ptyHostMode = process.env.OPERATOR_PTY_HOST_MODE || "local"

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.pw.ts",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
    {
      name: "chrome",
      use: {
        browserName: "chromium",
        channel: "chrome",
      },
    },
  ],
  webServer: {
    command: "bun scripts/pw-server.ts",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    env: {
      PORT: String(port),
      DATA_DIR: dataDir,
      OPERATOR_DATA_DIR: dataDir,
      OPERATOR_EXEC_POLICY_TTL_MS: "0",
      OPERATOR_APPROVAL_POLICY: "on-request",
      OPERATOR_SANDBOX_MODE: "workspace-write",
      OPERATOR_RUNTIME_V2: "1",
      OPERATOR_EXEC_V3: "1",
      OPERATOR_TOOL_REGISTRY_V2: "1",
      OPERATOR_DATA_HOST_V1: "1",
      OPERATOR_EXTENSION_HOST_V1: "1",
      OPERATOR_LSP_HOST_V1: "1",
      OPERATOR_PTY_BACKEND: ptyBackend,
      OPERATOR_PTY_HOST_MODE: ptyHostMode,
      NODE_ENV: "test",
    },
    stdout: "pipe",
    stderr: "pipe",
  },
})
