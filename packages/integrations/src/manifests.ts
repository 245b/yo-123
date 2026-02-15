import type { IntegrationManifest } from "../../contracts/src/plugin"

export const integrationManifests: IntegrationManifest[] = [
  {
    id: "ddg-search",
    kind: "provider",
    capabilities: ["search", "web"],
    configSchema: {
      timeoutMs: "number",
      retries: "number",
    },
  },
  {
    id: "ctx7-search",
    kind: "provider",
    capabilities: ["docs", "library-lookup"],
    configSchema: {
      timeoutMs: "number",
      retries: "number",
    },
  },
  {
    id: "yt-transcript",
    kind: "provider",
    capabilities: ["video", "transcript"],
    configSchema: {
      timeoutMs: "number",
      lang: "string",
    },
  },
  {
    id: "terminal-exec",
    kind: "tool",
    capabilities: ["exec", "filesystem", "session"],
    configSchema: {
      timeoutMs: "number",
      maxChars: "number",
    },
  },
]