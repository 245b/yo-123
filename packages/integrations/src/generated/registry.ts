import type { IntegrationManifest } from "../../../contracts/src/plugin"

export const generatedIntegrationRegistry: Record<string, IntegrationManifest> = {
  "ctx7-search": {
    "id": "ctx7-search",
    "kind": "provider",
    "capabilities": [
      "docs",
      "library-lookup"
    ],
    "configSchema": {
      "timeoutMs": "number",
      "retries": "number"
    }
  },
  "ddg-search": {
    "id": "ddg-search",
    "kind": "provider",
    "capabilities": [
      "search",
      "web"
    ],
    "configSchema": {
      "timeoutMs": "number",
      "retries": "number"
    }
  },
  "terminal-exec": {
    "id": "terminal-exec",
    "kind": "tool",
    "capabilities": [
      "exec",
      "filesystem",
      "session"
    ],
    "configSchema": {
      "timeoutMs": "number",
      "maxChars": "number"
    }
  },
  "yt-transcript": {
    "id": "yt-transcript",
    "kind": "provider",
    "capabilities": [
      "video",
      "transcript"
    ],
    "configSchema": {
      "timeoutMs": "number",
      "lang": "string"
    }
  },
}
