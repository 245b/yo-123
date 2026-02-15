import path from "node:path"
import { cp, lstat, mkdir } from "node:fs/promises"

type BackupRow = {
  source: string
  target: string
  copied: boolean
}

const root = process.cwd()
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const base = path.join(root, ".codex-trash", "runtime-backups", stamp)

const sources = [
  "data/operator-web/logs",
  "data/operator-web/transcripts",
  "data/operator-web/sessions",
  "data/workspace/logs",
  "hello/VNC/vnc-desktop/workspace/operator",
  "hello/VNC/vnc-desktop/config/chromium/Default/Sessions",
]

const exists = async (target: string) =>
  lstat(target)
    .then(() => true)
    .catch(() => false)

await mkdir(base, { recursive: true })

const rows: BackupRow[] = []

for (var i = 0; i < sources.length; i++) {
  const rel = sources[i] ?? ""

  if (!rel) {
    continue
  }

  const src = path.join(root, rel)
  const ok = await exists(src)

  if (!ok) {
    rows.push({ source: rel, target: "", copied: false })
    continue
  }

  const name = rel.replace(/[\\/]/g, "__")
  const dst = path.join(base, name)
  await cp(src, dst, { recursive: true, force: true })
  rows.push({ source: rel, target: dst, copied: true })
}

const manifest = {
  ts: new Date().toISOString(),
  backupDir: base,
  rows,
}

await Bun.write(path.join(base, "manifest.json"), JSON.stringify(manifest, null, 2))

const copied = rows.filter((row) => row.copied).length
console.log(`Runtime backup completed: ${copied} path(s) copied to ${base}`)