import path from "node:path"
import { integrationManifests } from "../packages/integrations/src/manifests"

const out = path.join(process.cwd(), "packages", "integrations", "src", "generated", "registry.ts")

const sorted = integrationManifests.slice().sort((a, b) => {
  const aa = a.id.toLowerCase()
  const bb = b.id.toLowerCase()

  if (aa < bb) {
    return -1
  }

  if (aa > bb) {
    return 1
  }

  return 0
})

const lines: string[] = []
lines.push('import type { IntegrationManifest } from "../../../contracts/src/plugin"')
lines.push("")
lines.push("export const generatedIntegrationRegistry: Record<string, IntegrationManifest> = {")

for (var i = 0; i < sorted.length; i++) {
  const row = sorted[i]

  if (!row) {
    continue
  }

  const key = JSON.stringify(row.id)
  const body = JSON.stringify(row, null, 2)
    .split("\n")
    .map((line, idx) => (idx === 0 ? line : `  ${line}`))
    .join("\n")

  lines.push(`  ${key}: ${body},`)
}

lines.push("}")
lines.push("")

await Bun.write(out, lines.join("\n"))
console.log(`Generated integration registry with ${sorted.length} manifest(s)`)