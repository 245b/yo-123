import { clean } from "../utils/text"
import { kind } from "../web"
import { parseJson, stripFence } from "./helpers-core"
import type { PlanOut, PlanReq, PlanStep, ToolRequest } from "./helpers-core"


const pickMode = (raw: string) => {
  const list = ["none", "web", "terminal", "both"]

  for (var i = 0; i < list.length; i++) {
    const it = list[i] ?? ""

    if (raw === it) {
      return it
    }
  }

  return ""
}

const pickType = (raw: string) => {
  const list = ["web", "news", "docs", "time"]

  for (var i = 0; i < list.length; i++) {
    const it = list[i] ?? ""

    if (raw === it) {
      return it
    }
  }

  return ""
}

const pickNeed = (raw: string) => {
  const list = ["none", "web", "terminal"]

  for (var i = 0; i < list.length; i++) {
    const it = list[i] ?? ""

    if (raw === it) {
      return it
    }
  }

  return ""
}

const pickTask = (raw: string) => {
  const list = ["reasoning", "retrieval", "execution", "mixed"]

  for (var i = 0; i < list.length; i++) {
    const it = list[i] ?? ""

    if (raw === it) {
      return it
    }
  }

  return ""
}

const sessionTag = (raw: string) => {
  const t0 = clean(raw)
  const t1 = t0.replace(/[^a-zA-Z0-9_.-]+/g, "_")
  const t = clean(t1)

  if (!t) {
    return "operator"
  }

  return t
}

const splitPathParts = (raw: string) => {
  const t0 = clean(raw)

  if (!t0) {
    return []
  }

  const t1 = t0.replace(/\\/g, "/").replace(/^[a-zA-Z]:\//, "").replace(/^\/+/, "")
  const list0 = t1.split("/")
  const list: string[] = []

  for (var i = 0; i < list0.length; i++) {
    const part0 = clean(list0[i] ?? "")

    if (!part0 || part0 === "." || part0 === "..") {
      continue
    }

    list.push(part0)
  }

  return list
}

const scopeSessionPath = (session: string, raw: string) => {
  const sid = sessionTag(session)
  const parts0 = splitPathParts(raw)

  if (!parts0.length) {
    return sid
  }

  const enforced0 = typeof process.env.OPERATOR_ENFORCED_ROOT === "string" ? process.env.OPERATOR_ENFORCED_ROOT : ""
  const wd0 = typeof process.env.VNC_WORKDIR === "string" ? process.env.VNC_WORKDIR : ""
  const wd1 = wd0 || (typeof process.env.OPERATOR_VNC_WORKDIR === "string" ? process.env.OPERATOR_VNC_WORKDIR : "")
  const wd2 = clean(enforced0) || clean(wd1) || "/projects/_workspaces"
  const wd = clean(wd2)
  const base0 = splitPathParts(wd)
  const base: string[] = []

  for (var i = 0; i < base0.length; i++) {
    const it0 = base0[i] ?? ""
    const it = it0.toLowerCase()

    if (!it) {
      continue
    }

    base.push(it)
  }

  const lower: string[] = []

  for (var i = 0; i < parts0.length; i++) {
    const it0 = parts0[i] ?? ""
    lower.push(it0.toLowerCase())
  }

  var from = 0

  if (base.length && lower.length >= base.length) {
    var ok = true

    for (var i = 0; i < base.length; i++) {
      if ((lower[i] ?? "") !== (base[i] ?? "")) {
        ok = false
        break
      }
    }

    if (ok) {
      from = base.length
    }
  }

  const p0 = lower[0] ?? ""
  const p1 = lower[1] ?? ""

  if (p0 === "projects" && p1 === "operator") {
    from = 2
  }

  if (!from && p0 === "operator") {
    from = 1
  }

  const last = base.length ? (base[base.length - 1] ?? "") : ""

  if (!from && last && p0 === last) {
    from = 1
  }

  var tail = parts0.slice(from)

  if (tail.length && (tail[0] ?? "") === sid) {
    tail = tail.slice(1)
  }

  if (!tail.length) {
    return sid
  }

  return [sid].concat(tail).join("/")
}

const isJsonish = (raw: string) => {
  const t = stripFence(raw).trim()

  if (!t) {
    return false
  }

  if (!t.startsWith("{") || !t.endsWith("}")) {
    return false
  }

  return true
}

const parseToolRequest = (raw: string): ToolRequest | null => {
  const t = stripFence(raw).trim()

  if (!t.startsWith("{") || !t.endsWith("}")) {
    return null
  }

  const out = parseJson(t)

  if (!out || typeof out !== "object") {
    return null
  }

  const o = out as { tool_request?: unknown }
  const tr0 = (o.tool_request && typeof o.tool_request === "object" ? o.tool_request : null) as {
    mode?: unknown
    type?: unknown
    reason?: unknown
    draft?: unknown
    queries?: unknown
  } | null

  if (!tr0) {
    return null
  }

  const mode0 = typeof tr0.mode === "string" ? tr0.mode : ""
  const mode1 = mode0.trim()
  const mode2 = pickMode(mode1)

  if (!mode2) {
    return null
  }

  const type0 = typeof tr0.type === "string" ? tr0.type : ""
  const type1 = type0.trim()
  const type2 = pickType(type1)
  const reason0 = typeof tr0.reason === "string" ? tr0.reason : ""
  const draft0 = typeof tr0.draft === "string" ? tr0.draft : ""
  const queries0 = Array.isArray(tr0.queries) ? tr0.queries : []
  const qs: string[] = []

  for (var i = 0; i < queries0.length; i++) {
    const it = queries0[i]
    const s0 = typeof it === "string" ? it : ""
    const s1 = clean(s0)

    if (!s1) {
      continue
    }

    qs.push(s1)
  }

  const outReq: ToolRequest = {
    mode: mode2 as ToolRequest["mode"],
  }

  if (type2) {
    outReq.type = type2 as ToolRequest["type"]
  }

  const reason = clean(reason0)

  if (reason) {
    outReq.reason = reason
  }

  const draft = clean(draft0)

  if (draft) {
    outReq.draft = draft
  }

  if (qs.length) {
    outReq.queries = qs
  }

  return outReq
}

const numPick = (v: unknown) => {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.floor(v)
  }

  if (typeof v === "string") {
    const n0 = Number.parseInt(v, 10)
    const n1 = Number.isFinite(n0) ? n0 : 0
    return n1
  }

  return 0
}

const parsePlan = (raw: string): PlanOut | null => {
  const t = stripFence(raw).trim()

  if (!t.startsWith("{") || !t.endsWith("}")) {
    return null
  }

  const out = parseJson(t)

  if (!out || typeof out !== "object") {
    return null
  }

  const o = out as {
    task_type?: unknown
    steps?: unknown
    tool_requests?: unknown
    answer_draft?: unknown
  }
  const task0 = typeof o.task_type === "string" ? o.task_type : ""
  const task1 = task0.trim()
  const task2 = pickTask(task1)

  if (!task2) {
    return null
  }

  const steps0 = Array.isArray(o.steps) ? o.steps : []
  const steps: PlanStep[] = []

  for (var i = 0; i < steps0.length; i++) {
    const row = (steps0[i] && typeof steps0[i] === "object" ? steps0[i] : null) as {
      id?: unknown
      action?: unknown
      needs?: unknown
    } | null

    if (!row) {
      continue
    }

    const id0 = numPick(row.id)
    const action0 = typeof row.action === "string" ? row.action : ""
    const action1 = clean(action0)
    const needs0 = typeof row.needs === "string" ? row.needs : ""
    const needs1 = needs0.trim()
    const needs2 = pickNeed(needs1)

    if (!id0 || !action1 || !needs2) {
      continue
    }

    steps.push({ id: id0, action: action1, needs: needs2 as PlanStep["needs"] })
  }

  const list0 = Array.isArray(o.tool_requests) ? o.tool_requests : []
  const reqs: PlanReq[] = []

  for (var i = 0; i < list0.length; i++) {
    const row = (list0[i] && typeof list0[i] === "object" ? list0[i] : null) as {
      step_id?: unknown
      tool?: unknown
      why?: unknown
      inputs?: unknown
    } | null

    if (!row) {
      continue
    }

    const tool0 = typeof row.tool === "string" ? row.tool : ""
    const tool1 = clean(tool0)

    if (!tool1) {
      continue
    }

    const step0 = numPick(row.step_id)
    const why0 = typeof row.why === "string" ? row.why : ""
    const why1 = clean(why0)
    const inputs0 = (row.inputs && typeof row.inputs === "object" ? row.inputs : null) as Record<string, unknown> | null
    const req: PlanReq = { step_id: step0, tool: tool1, inputs: inputs0 ?? {} }

    if (why1) {
      req.why = why1
    }

    reqs.push(req)
  }

  const draft0 = typeof o.answer_draft === "string" ? o.answer_draft : ""
  const draft1 = draft0.trim()

  return {
    task_type: task2 as PlanOut["task_type"],
    steps,
    tool_requests: reqs,
    answer_draft: draft1,
  }
}

const lookupType = (raw: string): PlanReq["tool"] | "" => {
  const k0 = kind(raw)
  const k = clean(k0)

  if (k === "web" || k === "news" || k === "docs" || k === "time") {
    return k
  }

  return ""
}

const makeLookupPlan = (q: string, tool: PlanReq["tool"]): PlanOut => ({
  task_type: "retrieval",
  steps: [{ id: 1, action: "Gather current external data for the request.", needs: "terminal" }],
  tool_requests: [
    {
      step_id: 1,
      tool,
      why: "Auto-enforced lookup for explicit web/current-events intent.",
      inputs: { queries: [q] },
    },
  ],
  answer_draft: "",
})

const isLookupTerminalCommand = (raw: string) => {
  const t0 = clean(raw)
  const t = t0.toLowerCase()

  if (!t) {
    return false
  }

  if (t === "mcp-search" || t.startsWith("mcp-search ")) {
    return true
  }

  if (t === "date" || t.startsWith("date ")) {
    return true
  }

  return false
}

const pickDate = (q: string) => {
  const list = q.match(/\b(19|20)\d{2}\b/g) ?? []
  var y = 0

  for (var i = 0; i < list.length; i++) {
    const v0 = list[i] ?? ""
    const v1 = Number.parseInt(v0, 10)

    if (!Number.isFinite(v1)) {
      continue
    }

    if (v1 > y) {
      y = v1
    }
  }

  const now = new Date()
  const by = now.getUTCFullYear()
  const base = new Date(Date.UTC(by - 1, 5, 1))
  const bm = base.getUTCMonth() + 1
  const bd = base.getUTCDate()
  const cut = base.getUTCFullYear() * 10000 + bm * 100 + bd
  var min = cut
  const fixed = 20250101

  if (fixed > min) {
    min = fixed
  }

  if (y > 0) {
    const y0 = y * 10000 + 101

    if (y0 > min) {
      min = y0
    }
  }

  return min
}


export {
  parseToolRequest,
  parsePlan,
  sessionTag,
  scopeSessionPath,
  lookupType,
  makeLookupPlan,
  isLookupTerminalCommand,
  pickDate,
}

