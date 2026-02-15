import path from "node:path"
import { readdir } from "node:fs/promises"
import { spawnSafe } from "../packages/execution/src/spawn-safe"

const root = process.cwd()

const skipDirs = new Set([
  ".git",
  "node_modules",
  ".codex-trash",
  ".codex-debugger",
  "data",
])

const skipPathParts = [
  "hello/VNC/vnc-desktop/workspace",
  "hello/VNC/vnc-desktop/config/chromium",
]

const allowFiles = new Set([
  ".env",
  "Operator-web/.env.example",
  "deepseek.texzt",
])

const extAllow = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".yml", ".yaml", ".sh", ".py", ".md"])

const rules = [
  {
    id: "openai_style_key",
    re: /sk-[a-zA-Z0-9]{24,}/g,
  },
  {
    id: "hardcoded_deepseek_key",
    re: /DEEPSEEK_API_KEY\s*[:=]\s*["'][^"'\n]+["']/g,
  },
  {
    id: "hardcoded_term_agent_token",
    re: /TERM_AGENT_TOKEN\s*[:=]\s*["'][^"'\n]+["']/g,
  },
]

const listFromRg = async () => {
  if (!Bun.which("rg")) {
    return [] as string[]
  }

  const p = spawnSafe({
    kind: "host",
    cmd: [
    "rg",
    "--files",
    "-g",
    "!**/node_modules/**",
    "-g",
    "!**/.git/**",
    ],
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  })

  const code = await p.exited.catch(() => 1)

  if (code !== 0) {
    return [] as string[]
  }

  const stdout = p.stdout ?? null
  const text0 = stdout ? await Bun.readableStreamToText(stdout).catch(() => "") : ""
  const text = text0.trim()

  if (!text) {
    return [] as string[]
  }

  return text.split(/\r?\n/g)
}

const walk = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const out: string[] = []

  for (var i = 0; i < entries.length; i++) {
    const row = entries[i]

    if (!row) {
      continue
    }

    const full = path.join(dir, row.name)
    const rel = path.relative(root, full).split("\\").join("/")

    if (!rel) {
      continue
    }

    if (row.isDirectory()) {
      if (skipDirs.has(row.name)) {
        continue
      }

      var blocked = false

      for (var j = 0; j < skipPathParts.length; j++) {
        const part = skipPathParts[j] ?? ""

        if (part && rel.startsWith(part)) {
          blocked = true
          break
        }
      }

      if (blocked) {
        continue
      }

      const nested = await walk(full)

      for (var j = 0; j < nested.length; j++) {
        const item = nested[j]

        if (!item) {
          continue
        }

        out.push(item)
      }

      continue
    }

    const ext = path.extname(row.name).toLowerCase()

    if (!extAllow.has(ext)) {
      continue
    }

    out.push(rel)
  }

  return out
}

const files0 = await listFromRg()
const files = files0.length ? files0 : await walk(root)

const hits: { file: string; rule: string; value: string }[] = []

for (var i = 0; i < files.length; i++) {
  const rel0 = files[i] ?? ""
  const rel = rel0.split("\\").join("/")

  if (!rel) {
    continue
  }

  if (allowFiles.has(rel)) {
    continue
  }

  var blocked = false

  for (var j = 0; j < skipPathParts.length; j++) {
    const part = skipPathParts[j] ?? ""

    if (part && rel.startsWith(part)) {
      blocked = true
      break
    }
  }

  if (blocked) {
    continue
  }

  const full = path.join(root, rel)
  const text = await Bun.file(full).text().catch(() => "")

  if (!text) {
    continue
  }

  for (var r = 0; r < rules.length; r++) {
    const rule = rules[r]

    if (!rule) {
      continue
    }

    const ms = text.match(rule.re) ?? []

    for (var k = 0; k < ms.length; k++) {
      const value = ms[k] ?? ""
      const low = value.toLowerCase()

      if (!value) {
        continue
      }

      if (low.includes("replace_me") || low.includes("replaceme")) {
        continue
      }

      if (low.includes("example")) {
        continue
      }

      hits.push({ file: rel, rule: rule.id, value })
    }
  }
}

if (!hits.length) {
  console.log("Secret scan passed")
  process.exit(0)
}

console.error("Secret scan failed")

for (var i = 0; i < hits.length; i++) {
  const row = hits[i]

  if (!row) {
    continue
  }

  console.error(`${row.file} [${row.rule}] ${row.value.slice(0, 120)}`)
}

process.exit(1)
