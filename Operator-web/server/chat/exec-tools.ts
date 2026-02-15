import { clean } from "../utils/text"
import { now, web } from "../web"
import type { NowCtx } from "../web"
import type { ToolRun } from "./deepseek"
import { hasIsoDate, isRecencyQuery } from "./helpers-core"
import type { PlanOut, ToolResult } from "./helpers-core"
import { needSessionList } from "./helpers-diagnostics"
import { pickDate } from "./helpers-plan"
import { allowTool, applyLookupMeta, normTool, pickQueries, toolKind } from "./helpers-style"

type ExecToolsInput = {
  plan: PlanOut | null
  mark?: () => void
  runTool: ToolRun | null
  terminalOnly: boolean
  allowExec: boolean
  webBudget: number
  termBudget: number
  query: string
}

const nextId = () => {
  const rid0 = globalThis.crypto?.randomUUID?.() ?? ""
  const rid = rid0 || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  return rid
}

const normalizeSearchQuery = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text1 = text0.replace(/\r/g, " ").replace(/\n/g, " ")
  const text2 = clean(text1)

  if (!text2) {
    return ""
  }

  var text = text2

  for (;;) {
    const first = text[0] || ""
    const last = text[text.length - 1] || ""
    const pair = (first === `"` && last === `"`) || (first === `'` && last === `'`)

    if (!pair) {
      break
    }

    if (text.length < 2) {
      break
    }

    text = clean(text.slice(1, -1))

    if (!text) {
      break
    }
  }

  return text
}

export const execTools = async (input: ExecToolsInput) => {
  const plan = input.plan
  const mark = input.mark
  const runTool = input.runTool
  const terminalOnly = input.terminalOnly
  const allowExec = input.allowExec
  const webBudget = input.webBudget
  const termBudget = input.termBudget
  const query = input.query
  const results: ToolResult[] = []
  const ctxTools: unknown[] = []
  var ctxType = ""
  var webCount = 0
  var termCount = 0
  var now0: NowCtx | null = null
  var autoListed = false
  var autoListOk = false
  const list = Array.isArray(plan?.tool_requests) ? plan?.tool_requests ?? [] : []

  for (var i = 0; i < list.length; i++) {
    const req = list[i]
    const tool0 = typeof req?.tool === "string" ? req.tool : ""
    const tool1 = normTool(tool0)

    if (!tool1) {
      continue
    }

    if (!allowTool(tool1)) {
      results.push({ tool: tool1, ok: false, error: "Tool not allowed", input: req?.inputs })
      continue
    }

    const kind = toolKind(tool1)
    const inputs = (req?.inputs && typeof req.inputs === "object" ? req.inputs : null) as Record<string, unknown> | null
    const input0 = inputs ?? {}

    if (kind) {
      const qs = pickQueries(input0, query)

      if (!qs.length) {
        results.push({ tool: kind, ok: false, error: "Missing query", input: input0 })
        continue
      }

      if (terminalOnly) {
        if (!runTool) {
          results.push({ tool: "terminal_exec", ok: false, error: "Tool runner unavailable", input: { command: "mcp-search" } })
          continue
        }

        if (!allowExec) {
          results.push({ tool: "terminal_exec", ok: false, error: "terminal_exec not allowed", input: { command: "mcp-search" } })
          continue
        }

        if (mark) {
          mark()
        }

        var tag = ""
        const needDate = kind === "news" || kind === "time" || qs.some((q) => isRecencyQuery(q))

        if (needDate) {
          if (termCount >= termBudget) {
            results.push({ tool: "terminal_exec", ok: false, error: "Tool budget exceeded", input: { command: "date -u +%Y-%m-%d" } })
            continue
          }

          termCount++
          const res0 = await runTool("terminal_exec", { command: "date -u +%Y-%m-%d" }, { id: nextId() })
          const ok0 = !!(res0 && typeof res0 === "object" && (res0 as { ok?: unknown }).ok === true)
          results.push({ tool: "terminal_exec", ok: ok0, input: { command: "date -u +%Y-%m-%d" }, result: res0 })
          const row0 = (res0 && typeof res0 === "object" ? res0 : null) as { output?: unknown } | null
          const out0 = typeof row0?.output === "string" ? row0.output : ""
          const line0 = out0.split("\n")[0] ?? ""
          const line1 = clean(line0)

          if (line1) {
            tag = line1
          }
        }

        for (var qi = 0; qi < qs.length; qi++) {
          if (termCount >= termBudget) {
            results.push({ tool: "terminal_exec", ok: false, error: "Tool budget exceeded", input: { command: "mcp-search" } })
            continue
          }

          termCount++
          const q0 = qs[qi] ?? ""
          const needTag = (kind === "news" || kind === "time" || isRecencyQuery(q0)) && tag && !hasIsoDate(q0)
          const q1 = needTag ? `${tag} ${q0}` : q0
          const q2 = normalizeSearchQuery(q1) || q1
          const esc = q2.replace(/"/g, '\\"')
          const cmd = `mcp-search "${esc}"`
          const res1 = await runTool("terminal_exec", { command: cmd }, { id: nextId() })
          const ok1 = !!(res1 && typeof res1 === "object" && (res1 as { ok?: unknown }).ok === true)
          results.push({ tool: "terminal_exec", ok: ok1, input: { command: cmd }, result: res1 })
        }
        continue
      }

      for (var qi = 0; qi < qs.length; qi++) {
        if (webCount >= webBudget) {
          results.push({ tool: kind, ok: false, error: "Tool budget exceeded", input: input0 })
          continue
        }

        webCount++

        if (mark) {
          mark()
        }

        if (!now0) {
          now0 = await now()
        }

        const q0 = qs[qi] ?? ""
        const needTag = (kind === "news" || kind === "time" || isRecencyQuery(q0)) && !hasIsoDate(q0)
        const q1 = needTag ? `${now0.dateIso} ${q0}` : q0
        const min = pickDate(q1)
        const ctx0 = await web(q1, kind, min, now0)

        if (!ctx0 || typeof ctx0 !== "object") {
          results.push({ tool: kind, ok: false, error: "Lookup failed", input: input0 })
          continue
        }

        ctxTools.push(ctx0)

        if (!ctxType) {
          ctxType = kind
        }

        results.push({ tool: kind, ok: true, input: input0, result: ctx0 })
      }
      continue
    }

    if (!runTool) {
      results.push({ tool: tool1, ok: false, error: "Tool runner unavailable", input: input0 })
      continue
    }

    if (tool1.startsWith("terminal_")) {
      if (tool1 === "terminal_exec" || tool1 === "terminal_send") {
        if (!allowExec) {
          results.push({ tool: tool1, ok: false, error: "terminal_exec not allowed", input: input0 })
          continue
        }
      }

      if (termCount >= termBudget) {
        results.push({ tool: tool1, ok: false, error: "Tool budget exceeded", input: input0 })
        continue
      }

      termCount++
    }

    const res = await runTool(tool1, input0, { id: nextId() })
    const ok = !!(res && typeof res === "object" && (res as { ok?: unknown }).ok === true)
    results.push({ tool: tool1, ok, input: input0, result: res })
  }

  if (runTool && needSessionList(results)) {
    if (mark) {
      mark()
    }

    const input0 = { path: ".", recursive: true, max_depth: 2, max_entries: 200 }
    const res = await runTool("fs_list", input0, { id: nextId() })
    const ok = !!(res && typeof res === "object" && (res as { ok?: unknown }).ok === true)
    results.push({ tool: "fs_list", ok, input: input0, result: res })
    autoListed = true
    autoListOk = ok
  }

  var ctx: unknown = null
  var note = ""

  if (ctxTools.length) {
    var min = 0
    var max = 0
    var reject = false

    for (var i = 0; i < ctxTools.length; i++) {
      const row = (ctxTools[i] && typeof ctxTools[i] === "object" ? ctxTools[i] : null) as {
        minDate?: unknown
        maxDate?: unknown
        rejectMissingDate?: unknown
        type?: unknown
      } | null

      if (!row) {
        continue
      }

      const min0 = typeof row.minDate === "number" ? row.minDate : 0
      const max0 = typeof row.maxDate === "number" ? row.maxDate : 0

      if (min0 && (!min || min0 < min)) {
        min = min0
      }

      if (max0 && max0 > max) {
        max = max0
      }

      if (row.rejectMissingDate === true) {
        reject = true
      }

      if (!ctxType) {
        const t0 = typeof row.type === "string" ? row.type : ""
        ctxType = t0.trim()
      }
    }

    const root: Record<string, unknown> = { type: ctxType || "web", tools: ctxTools, rejectMissingDate: reject }

    if (min) {
      root.minDate = min
    }

    if (max) {
      root.maxDate = max
    }

    if (now0) {
      const meta = applyLookupMeta(root, now0)
      ctx = meta.ctx
      note = meta.note
    }

    if (!now0) {
      ctx = root
    }
  }

  if (autoListed && autoListOk) {
    note = note
      ? `${note} Confirm created files using the session folder listing from fs_list in your final reasoning.`
      : "Confirm created files using the session folder listing from fs_list in your final reasoning."
  }

  if (autoListed && !autoListOk) {
    note = note
      ? `${note} A required session folder listing check failed; report that file confirmation could not be verified.`
      : "A required session folder listing check failed; report that file confirmation could not be verified."
  }

  return { results, ctx, note }
}
