#!/usr/bin/env bun
import path from "node:path"
import * as fs from "node:fs"
import * as os from "node:os"
import { spawnSafe } from "../../../../packages/execution/src/spawn-safe"
import { HeadTailBuffer } from "../../../../packages/execution/src/head-tail-buffer"

const clean = (raw: unknown) => {
  const t0 = typeof raw === "string" ? raw : ""
  return t0.trim()
}

const intFrom = (raw: unknown, fallback: number) => {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.floor(raw) : fallback
  }

  const text = clean(raw)

  if (!text) {
    return fallback
  }

  const n0 = Number.parseInt(text, 10)
  return Number.isFinite(n0) ? Math.floor(n0) : fallback
}

const delay = (ms: number) => Bun.sleep(Math.max(0, Math.floor(ms)))

const tap = (s: ReadableStream<Uint8Array> | null, buf: HeadTailBuffer) => {
  if (!s) {
    return Promise.resolve()
  }

  const r = s.getReader()

  return (async () => {
    for (;;) {
      const row = await r.read().catch(() => null)

      if (!row) {
        break
      }

      if (row.done) {
        break
      }

      if (!row.value) {
        continue
      }

      buf.pushChunk(row.value)
    }
  })()
}

type AgentProc = {
  name: string
  base: string
  token: string
  root: string
  proc: ReturnType<typeof spawnSafe>
  out: HeadTailBuffer
  err: HeadTailBuffer
  outP: Promise<void>
  errP: Promise<void>
}

const spawnAgent = (input: {
  name: string
  cmd: string[]
  port: number
  token: string
  projects: string
  operator: string
  home: string
  trash: string
}) => {
  const env: Record<string, string> = {
    ...Object.fromEntries(Object.entries(process.env).filter(([k, v]) => typeof v === "string" && k)),
    TERM_AGENT_TOKEN: input.token,
    TERM_AGENT_PORT: `${input.port}`,
    TERM_AGENT_PERMS: "all",
    PROJECTS_DIR: input.projects,
    OPERATOR_DIR: input.operator,
    WORKSPACE_ROOT: input.operator,
    TERM_SESSION_DIR: input.operator,
    RUN_USER: clean(process.env.USER || process.env.USERNAME) || "operator",
    RUN_HOME: input.home,
    TRASH_DIR: input.trash,
    TERM_AGENT_PURGE_ON_START: "0",
  }

  const proc = spawnSafe({
    kind: "host",
    cmd: input.cmd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = new HeadTailBuffer(256 * 1024)
  const err = new HeadTailBuffer(256 * 1024)
  const outP = tap(proc.stdout ?? null, out)
  const errP = tap(proc.stderr ?? null, err)
  const base = `http://127.0.0.1:${input.port}`
  return {
    name: input.name,
    base,
    token: input.token,
    root: input.operator,
    proc,
    out,
    err,
    outP,
    errP,
  } satisfies AgentProc
}

const stopAgent = async (a: AgentProc) => {
  a.proc.kill()
  await a.proc.exited.catch(() => 0)
  await Promise.all([a.outP, a.errP])
}

const jsonReq = async (a: AgentProc, p: string, body?: Record<string, unknown>) => {
  const url = `${a.base}${p}`
  const method = body ? "POST" : "GET"
  const headers: Record<string, string> = {}

  if (method === "POST") {
    headers["content-type"] = "application/json"
    headers["x-term-agent-token"] = a.token
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null)

  if (!res) {
    return { ok: false as const, status: 0, data: null as unknown }
  }

  const json = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, data: json }
}

const waitHealth = async (a: AgentProc, timeoutMs: number) => {
  const end = Date.now() + Math.max(1, timeoutMs)

  for (;;) {
    const res = await jsonReq(a, "/v1/health")
    const row = res.data && typeof res.data === "object" ? (res.data as Record<string, unknown>) : null
    const ok = row?.ok === true

    if (res.ok && ok) {
      return row
    }

    if (Date.now() > end) {
      return null
    }

    await delay(200)
  }
}

const assertOk = (name: string, ok: boolean, msg: string) => {
  if (ok) {
    return
  }

  throw new Error(`${name}: ${msg}`)
}

const asObj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null)

const runFsSuite = async (a: AgentProc, sessionId: string) => {
  const write = await jsonReq(a, "/v1/fs/write", {
    sessionId,
    path: "a.txt",
    content: "hello",
    atomic: true,
    create_parents: true,
  })
  assertOk(a.name, write.ok, `fs/write failed (${write.status})`)
  assertOk(a.name, asObj(write.data)?.ok === true, "fs/write ok=false")

  const read = await jsonReq(a, "/v1/fs/read", { sessionId, path: "a.txt" })
  assertOk(a.name, read.ok, `fs/read failed (${read.status})`)
  assertOk(a.name, asObj(read.data)?.ok === true, "fs/read ok=false")
  const content = clean(asObj(asObj(read.data)?.result)?.content ?? "")
  assertOk(a.name, content === "hello", "fs/read content mismatch")

  const del = await jsonReq(a, "/v1/fs/delete", { sessionId, path: "a.txt", recursive: false, to_trash: true })
  assertOk(a.name, del.ok, `fs/delete failed (${del.status})`)
  assertOk(a.name, asObj(del.data)?.ok === true, "fs/delete ok=false")

  const stat = await jsonReq(a, "/v1/fs/stat", { sessionId, path: "a.txt" })
  assertOk(a.name, stat.ok, `fs/stat failed (${stat.status})`)
  assertOk(a.name, asObj(stat.data)?.ok === true, "fs/stat ok=false")
  const exists = asObj(asObj(stat.data)?.result)?.exists === true
  assertOk(a.name, !exists, "fs/stat exists after delete")

  const purge = await jsonReq(a, "/v1/fs/purge", { sessionId })
  assertOk(a.name, purge.ok, `fs/purge failed (${purge.status})`)
  assertOk(a.name, asObj(purge.data)?.ok === true, "fs/purge ok=false")
}

const runProjectSuite = async (a: AgentProc, sessionId: string) => {
  const mk = await jsonReq(a, "/v1/fs/mkdir", { sessionId, path: "proj", parents: true })
  assertOk(a.name, mk.ok, `fs/mkdir failed (${mk.status})`)
  assertOk(a.name, asObj(mk.data)?.ok === true, "fs/mkdir ok=false")

  const pkg = JSON.stringify(
    {
      name: "parity-fixture",
      private: true,
      version: "1.0.0",
      scripts: { test: "node -e \"console.log('ok')\"" },
    },
    null,
    2,
  )

  const w = await jsonReq(a, "/v1/fs/write", {
    sessionId,
    path: "proj/package.json",
    content: `${pkg}\n`,
    atomic: true,
    create_parents: true,
  })
  assertOk(a.name, w.ok, `fs/write package.json failed (${w.status})`)
  assertOk(a.name, asObj(w.data)?.ok === true, "fs/write package.json ok=false")

  const det = await jsonReq(a, "/v1/project/detect", { sessionId, root: "proj" })
  assertOk(a.name, det.ok, `project/detect failed (${det.status})`)
  assertOk(a.name, asObj(det.data)?.ok === true, "project/detect ok=false")
  const kind = clean(asObj(asObj(det.data)?.result)?.type ?? "")
  assertOk(a.name, kind === "node", `project/detect type mismatch (${kind})`)

  const setup = await jsonReq(a, "/v1/project/setup", { sessionId, root: "proj" })
  assertOk(a.name, setup.ok, `project/setup failed (${setup.status})`)
  assertOk(a.name, asObj(setup.data)?.ok === true, "project/setup ok=false")

  const install = await jsonReq(a, "/v1/project/install", { sessionId, root: "proj", locked: false, network: false })
  assertOk(a.name, !install.ok, "project/install should fail when network=false")
  assertOk(a.name, clean(asObj(install.data)?.error ?? "") === "Network disabled", "project/install wrong error")

  const isRoot = typeof (process as unknown as { getuid?: () => number }).getuid === "function" && (process as unknown as { getuid: () => number }).getuid() === 0
  const hasRunuser = !!Bun.which("runuser")

  if (!isRoot || !hasRunuser) {
    return
  }

  const test = await jsonReq(a, "/v1/project/test", { sessionId, root: "proj", timeout_s: 60 })
  assertOk(a.name, test.ok, `project/test failed (${test.status})`)
  assertOk(a.name, asObj(test.data)?.ok === true, "project/test ok=false")
}

const runTerminalSuite = async (a: AgentProc, sessionId: string) => {
  const health = await jsonReq(a, "/v1/health")
  const tmuxOk = asObj(health.data)?.tmux_available === true
  const isRoot = typeof (process as unknown as { getuid?: () => number }).getuid === "function" && (process as unknown as { getuid: () => number }).getuid() === 0
  const hasRunuser = !!Bun.which("runuser")

  if (!tmuxOk || !isRoot || !hasRunuser) {
    return
  }

  const ensured = await jsonReq(a, "/v1/session/ensure", { sessionId })
  assertOk(a.name, ensured.ok, `session/ensure failed (${ensured.status})`)

  const exec0 = await jsonReq(a, "/v1/terminal/exec", { sessionId, command: "echo hello", timeoutMs: 8000, maxChars: 4000 })
  assertOk(a.name, exec0.ok, `terminal/exec failed (${exec0.status})`)
  const row = asObj(exec0.data)
  assertOk(a.name, typeof row?.output === "string", "terminal/exec missing output")
  assertOk(a.name, clean(row?.output ?? "") === "hello", "terminal/exec output mismatch")
  assertOk(a.name, row?.exitCode === 0, "terminal/exec exitCode mismatch")
}

const main = async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "term-agent-parity-"))
  const projects = path.join(tmp, "projects")
  const operator = path.join(projects, "operator")
  const home = path.join(tmp, "home")
  const trash = path.join(tmp, "trash")
  fs.mkdirSync(operator, { recursive: true })
  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(trash, { recursive: true })

  const token = "parity-token"
  const portPy = intFrom(process.env.TERM_AGENT_PARITY_PORT_PY, 17682)
  const portTs = intFrom(process.env.TERM_AGENT_PARITY_PORT_TS, 17683)
  const root = path.resolve(import.meta.dir)
  const py = path.join(root, "term-agent.py")
  const ts = path.join(root, "term-agent-server.ts")

  const aPy = spawnAgent({ name: "python", cmd: ["python", py], port: portPy, token, projects, operator, home, trash })
  const aTs = spawnAgent({ name: "ts", cmd: ["bun", ts], port: portTs, token, projects, operator, home, trash })

  const healthPy = await waitHealth(aPy, 12000)
  const healthTs = await waitHealth(aTs, 12000)

  if (!healthPy || !healthTs) {
    await Promise.all([stopAgent(aPy), stopAgent(aTs)])
    const outPy = Buffer.from(aPy.out.toBytes()).toString("utf8")
    const errPy = Buffer.from(aPy.err.toBytes()).toString("utf8")
    const outTs = Buffer.from(aTs.out.toBytes()).toString("utf8")
    const errTs = Buffer.from(aTs.err.toBytes()).toString("utf8")
    console.error("term-agent parity failed: health not ready")
    console.error("python stdout:\n" + outPy)
    console.error("python stderr:\n" + errPy)
    console.error("ts stdout:\n" + outTs)
    console.error("ts stderr:\n" + errTs)
    process.exit(1)
  }

  await runFsSuite(aPy, "py")
  await runFsSuite(aTs, "ts")
  await runProjectSuite(aPy, "py")
  await runProjectSuite(aTs, "ts")
  await runTerminalSuite(aPy, "py")
  await runTerminalSuite(aTs, "ts")
  await Promise.all([stopAgent(aPy), stopAgent(aTs)])
  console.log("term-agent parity passed")
}

await main().catch(async (err) => {
  console.error(err)
  process.exit(1)
})

