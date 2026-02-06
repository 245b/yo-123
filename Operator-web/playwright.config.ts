import { defineConfig } from "@playwright/test"

const port = Number.parseInt(process.env.PW_PORT ?? "", 10) || 4174

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: "bun scripts/pw-server.ts",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    env: { PORT: String(port), DATA_DIR: "test-results/server-data", NODE_ENV: "test" },
    stdout: "pipe",
    stderr: "pipe",
  },
})
