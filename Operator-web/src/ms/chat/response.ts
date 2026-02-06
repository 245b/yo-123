import type { Run, TermEntry } from "./types"

export type ReadResult = {
  stream: false
  ok: boolean
  st: number
  j: unknown
  t: string
}

export type StreamResult = {
  stream: true
  ok: boolean
  text: string
  error?: string
  stalled?: boolean
  terms?: TermEntry[]
}

export const readResponse = (r: Response): Promise<ReadResult> => {
  const ct0 = r.headers.get("content-type") ?? ""
  const ct = ct0.toLowerCase()

  if (!ct.includes("application/json")) {
    return r.text().then((t): ReadResult => ({ stream: false, ok: false, st: r.status, j: null as unknown, t }))
  }

  const c = r.clone()

  return r
    .json()
    .then((j): ReadResult => ({ stream: false, ok: r.ok, st: r.status, j, t: "" }))
    .catch(() =>
      c
        .text()
        .then((t): ReadResult => ({ stream: false, ok: false, st: r.status, j: null as unknown, t }))
        .catch((): ReadResult => ({ stream: false, ok: false, st: r.status, j: null as unknown, t: "" })),
    )
}

export const streamResponse = async (
  r: Response,
  run: Run,
  mark: (el: HTMLElement, txt: string) => void,
  ph: HTMLElement | null,
): Promise<StreamResult> => {
  if (!r.ok) {
    const t0 = await r.text().catch(() => "")
    const t = (t0 ?? "").slice(0, 2000).trim()
    return { stream: true, ok: false, text: "", error: t || `Request failed (${r.status})` }
  }

  const body = r.body

  if (!body) {
    return { stream: true, ok: false, text: "", error: "Empty stream" }
  }

  const doc = ph?.ownerDocument ?? document
  const win = doc.defaultView ?? window
  const rd = body.getReader()
  const dec = new TextDecoder()
  var buf = ""
  var txt = ""
  run.txt = ""
  run.rd = rd
  run.stalled = false
  var err = ""
  var stop = false
  var seenSearch = false
  var seenWork = false
  var searchLabel = ""
  var state = "idle"
  var prev = "thinking"
  var stalled = false
  var last = Date.now()
  var final = false
  const started = Date.now()
  const thinkDelayMs = 3000
  const thinkSpeed = 0.5
  var termOrder: string[] = []
  var termMap: Record<string, TermEntry> = {}
  const nexts: Record<string, string[]> = {
    idle: ["thinking", "tool", "streaming", "done", "error", "stalled"],
    thinking: ["thinking", "tool", "streaming", "done", "error", "stalled"],
    tool: ["thinking", "tool", "streaming", "done", "error", "stalled"],
    streaming: ["streaming", "tool", "done", "error", "stalled"],
    stalled: ["thinking", "tool", "streaming", "done", "error", "stalled"],
    done: ["done"],
    error: ["error"],
  }

  const parseJson = (raw: string) => {
    const t = raw.trim()

    if (!t) {
      return null
    }

    try {
      return JSON.parse(t) as unknown
    } catch {
      return null
    }
  }

  const normSearch = (raw: string) => {
    const s0 = typeof raw === "string" ? raw : ""
    const s1 = s0.trim().toLowerCase()
    const s = s1 || ""

    if (!s) {
      return ""
    }

    if (s === "1" || s === "search") {
      return "search"
    }

    if (s === "ddg" || s === "duck" || s === "duckduckgo") {
      return "ddg"
    }

    if (s === "fallback") {
      return "fallback"
    }

    return s
  }

  const isLegacyStallText = (raw: string) => {
    const t0 = typeof raw === "string" ? raw : ""
    const t = t0.trim().toLowerCase()

    if (!t) {
      return false
    }

    if (t.includes("no response events received")) {
      return true
    }

    if (t.includes("connection may be blocked")) {
      return true
    }

    if (t.includes("server stalled")) {
      return true
    }

    return false
  }

  const draw = () => {
    if (!ph) {
      return
    }

    mark(ph, txt)
    ph.removeAttribute("data-pending")
  }

  const clearStall = () => {
    if (!ph) {
      return
    }

    if (ph.getAttribute("data-ms-stall") !== "1") {
      return
    }

    ph.removeAttribute("data-ms-stall")
    ph.textContent = ""
  }

  const renderStatus = () => {
    if (!ph || txt) {
      return
    }

    if (state !== "thinking" && state !== "tool") {
      return
    }

    if (seenSearch && seenWork) {
      if (searchLabel === "ddg") {
        ph.textContent = "Working & ducking..."
        return
      }

      if (searchLabel === "fallback") {
        ph.textContent = "Working & Searching... (fallback)"
        return
      }

      ph.textContent = "Working & Searching..."
      return
    }

    if (seenSearch) {
      if (searchLabel === "ddg") {
        ph.textContent = "ducking..."
        return
      }

      if (searchLabel === "fallback") {
        ph.textContent = "Searching... (fallback)"
        return
      }

      ph.textContent = "Searching..."
      return
    }

    if (seenWork || state === "tool") {
      ph.textContent = "Working..."
      return
    }

    const elapsed = Date.now() - started

    if (elapsed < thinkDelayMs) {
      ph.textContent = "Thinking..."
      return
    }

    const sec = Math.floor(((elapsed - thinkDelayMs) / 1000) * thinkSpeed)

    if (sec < 1) {
      ph.textContent = "Thinking..."
      return
    }

    const tag = sec >= 60 ? `${Math.floor(sec / 60)}m` : `${sec}s`
    ph.textContent = `Thinking... (${tag})`
  }

  const can = (from: string, to: string) => {
    const list = nexts[from]

    if (!list || !list.length) {
      return false
    }

    return list.includes(to)
  }

  const setState = (next: string) => {
    const n0 = typeof next === "string" ? next : ""
    const n = n0.trim()

    if (!n) {
      return
    }

    if (state === n) {
      renderStatus()
      return
    }

    if (!can(state, n)) {
      return
    }

    if (state === "stalled" && n !== "stalled") {
      clearStall()
    }

    if (state !== "stalled" && n === "stalled") {
      prev = state || "thinking"
    }

    state = n

    if (ph) {
      if (n === "stalled") {
        ph.setAttribute("data-ms-stall", "1")
      }

      if (n !== "stalled") {
        ph.removeAttribute("data-ms-stall")
      }
    }

    renderStatus()
  }

  const touch = () => {
    last = Date.now()

    if (state === "stalled") {
      stalled = false
      run.stalled = false
      setState(prev || "thinking")
    }
  }

  const termWrap = () => {
    if (!ph) {
      return null
    }

    const row0 = ph.closest?.('[data-ms-row="1"]') ?? null
    const row = row0 && (row0 as Node).nodeType === 1 ? (row0 as HTMLElement) : null

    if (!row) {
      return null
    }

    const w0 = row.querySelector('[data-ms-wrap="1"]') ?? null
    const wrap = w0 && (w0 as Node).nodeType === 1 ? (w0 as HTMLElement) : null
    return wrap
  }

  const termBox = (id: string, tool: string) => {
    const wrap = termWrap()

    if (!wrap) {
      return null
    }

    const sel = `[data-ms-term-id="${id}"]`
    const ex0 = wrap.querySelector(sel) ?? null
    const ex = ex0 && (ex0 as Node).nodeType === 1 ? (ex0 as HTMLElement) : null

    if (ex) {
      return ex
    }

    const box = doc.createElement("div")
    box.className = "ms-term"
    box.setAttribute("data-ms-term-id", id)

    const head = doc.createElement("div")
    head.className = "ms-term-head"

    const tag = doc.createElement("div")
    tag.className = "ms-term-tag"
    tag.textContent = tool

    const status = doc.createElement("div")
    status.className = "ms-term-muted"
    status.setAttribute("data-ms-term-status", "1")
    status.textContent = "running"

    head.appendChild(tag)
    head.appendChild(status)

    const body = doc.createElement("div")
    body.className = "ms-term-body"

    const inLabel = doc.createElement("div")
    inLabel.className = "ms-term-label"
    inLabel.textContent = "input"

    const inPre = doc.createElement("div")
    inPre.className = "ms-term-pre"
    inPre.setAttribute("data-ms-term-in", "1")

    const outLabel = doc.createElement("div")
    outLabel.className = "ms-term-label"
    outLabel.textContent = "output"

    const outPre = doc.createElement("div")
    outPre.className = "ms-term-pre ms-term-muted"
    outPre.setAttribute("data-ms-term-out", "1")
    outPre.textContent = "waiting for output..."

    body.appendChild(inLabel)
    body.appendChild(inPre)
    body.appendChild(outLabel)
    body.appendChild(outPre)
    box.appendChild(head)
    box.appendChild(body)

    const tools0 = wrap.querySelector('[data-ms-tools="1"]') ?? null
    const tools = tools0 && (tools0 as Node).nodeType === 1 ? (tools0 as HTMLElement) : null

    if (tools) {
      wrap.insertBefore(box, tools)
      return box
    }

    wrap.appendChild(box)
    return box
  }

  const setTermText = (box: HTMLElement, sel: string, text: string) => {
    const el0 = box.querySelector(sel) ?? null
    const el = el0 && (el0 as Node).nodeType === 1 ? (el0 as HTMLElement) : null

    if (!el) {
      return
    }

    el.textContent = text
  }

  const setTermStatus = (box: HTMLElement, text: string) => {
    setTermText(box, '[data-ms-term-status="1"]', text)
  }

  const formatArgs = (args: { command?: unknown; keys?: unknown; tailLines?: unknown } | null) => {
    if (!args) {
      return ""
    }

    const cmd0 = typeof args.command === "string" ? args.command : ""
    const cmd = cmd0.trim()

    if (cmd) {
      return `command: ${cmd}`
    }

    const keys0 = typeof args.keys === "string" ? args.keys : ""
    const keys = keys0.trim()

    if (keys) {
      return `keys: ${keys}`
    }

    const t0 = args.tailLines
    const t1 = typeof t0 === "number" ? `${t0}` : typeof t0 === "string" ? t0 : ""

    if (t1) {
      return `tailLines: ${t1}`
    }

    return JSON.stringify(args)
  }

  const formatResult = (res: { output?: unknown; text?: unknown; exitCode?: unknown; error?: unknown } | null) => {
    if (!res) {
      return ""
    }

    const err0 = typeof res.error === "string" ? res.error : ""
    const err = err0.trim()

    if (err) {
      return `error: ${err}`
    }

    const out0 = typeof res.output === "string" ? res.output : ""
    const out = out0.trim()

    if (out) {
      const code0 = typeof res.exitCode === "number" ? res.exitCode : null
      const code = code0 === null ? "" : `exitCode: ${code0}\n`
      return `${code}${out}`
    }

    const text0 = typeof res.text === "string" ? res.text : ""
    const text = text0.trim()

    if (text) {
      return text
    }

    return JSON.stringify(res)
  }

  const termStatus = (raw: string) => {
    const s0 = typeof raw === "string" ? raw : ""
    const s = s0.trim()

    if (s === "running" || s === "done" || s === "failed") {
      return s as "running" | "done" | "failed"
    }

    return "done"
  }

  const termSet = (id: string, entry: TermEntry) => {
    const key = id.trim()

    if (!key) {
      return
    }

    if (!termMap[key]) {
      termOrder.push(key)
    }

    termMap[key] = entry
  }

  const termList = () => {
    const out: TermEntry[] = []

    for (var i = 0; i < termOrder.length; i++) {
      const key = termOrder[i] ?? ""
      const row = termMap[key]

      if (!row) {
        continue
      }

      out.push(row)
    }

    return out
  }

  const finalizeTerms = (reason: string) => {
    const msg0 = typeof reason === "string" ? reason : ""
    const msg = msg0.trim() || "tool did not return"

    for (var i = 0; i < termOrder.length; i++) {
      const key = termOrder[i] ?? ""
      const row = termMap[key]

      if (!row) {
        continue
      }

      if (row.status !== "running") {
        continue
      }

      const out0 = typeof row.output === "string" ? row.output : ""
      const out1 = out0.trim()
      const out = !out1 || out1 === "running..." ? msg : out1
      termMap[key] = {
        id: row.id,
        tool: row.tool,
        input: row.input,
        output: out,
        status: "failed",
      }

      const box = termBox(key, row.tool)

      if (box) {
        setTermText(box, '[data-ms-term-out="1"]', out)
        setTermStatus(box, "failed")
      }
    }
  }

  const parse = (raw: string) => {
    const ls = raw.split("\n")
    var ev = ""
    const ds: string[] = []

    for (var i = 0; i < ls.length; i++) {
      const line0 = ls[i] ?? ""
      const line = line0

      if (line.startsWith("event:")) {
        ev = line.slice(6).trim()
        continue
      }

      if (line.startsWith("data:")) {
        var d = line.slice(5)

        if (d.startsWith(" ")) {
          d = d.slice(1)
        }

        ds.push(d)
      }
    }

    const data = ds.join("\n")

    if (ev === "search") {
      const label = normSearch(data)

      if (label) {
        searchLabel = label
      }

      seenSearch = true
      setState("thinking")
      return true
    }

    if (ev === "work") {
      seenWork = true
      setState("thinking")
      return true
    }

    if (ev === "term") {
      const payload = parseJson(data)
      const p0 = (payload && typeof payload === "object" ? payload : null) as {
        id?: unknown
        tool?: unknown
        phase?: unknown
        args?: unknown
        result?: unknown
      } | null

      if (!p0) {
        return false
      }

      const id0 = typeof p0.id === "string" ? p0.id : ""
      const id = id0.trim() || "tool"
      const tool0 = typeof p0.tool === "string" ? p0.tool : ""
      const tool = tool0.trim() || "terminal"
      const phase0 = typeof p0.phase === "string" ? p0.phase : ""
      const phase = phase0.trim()
      const box = termBox(id, tool)

      if (!box) {
        return false
      }

      if (phase === "start") {
        const a0 = (p0.args && typeof p0.args === "object" ? p0.args : null) as {
          command?: unknown
          keys?: unknown
          tailLines?: unknown
        } | null
        const input = formatArgs(a0)
        const entry: TermEntry = {
          id,
          tool,
          input,
          output: "running...",
          status: "running",
        }
        termSet(id, entry)
        setTermText(box, '[data-ms-term-in="1"]', input)
        setTermText(box, '[data-ms-term-out="1"]', "running...")
        setTermStatus(box, "running")
        setState("tool")
      }

      if (phase === "done") {
        const r0 = (p0.result && typeof p0.result === "object" ? p0.result : null) as {
          output?: unknown
          text?: unknown
          exitCode?: unknown
          error?: unknown
        } | null
        const output = formatResult(r0)
        const a0 = (p0.args && typeof p0.args === "object" ? p0.args : null) as {
          command?: unknown
          keys?: unknown
          tailLines?: unknown
        } | null
        const input = formatArgs(a0)
        setTermText(box, '[data-ms-term-out="1"]', output || "done")
        const status = r0 && typeof r0.error === "string" && r0.error ? "failed" : "done"
        setTermStatus(box, status)
        termSet(id, {
          id,
          tool,
          input: input || termMap[id]?.input || "",
          output: output || "done",
          status: termStatus(status),
        })

        if (!txt) {
          setState("thinking")
        }
      }

      if (phase === "update") {
        const r0 = (p0.result && typeof p0.result === "object" ? p0.result : null) as {
          output?: unknown
          text?: unknown
          exitCode?: unknown
          error?: unknown
        } | null
        const output = formatResult(r0)
        const a0 = (p0.args && typeof p0.args === "object" ? p0.args : null) as {
          command?: unknown
          keys?: unknown
          tailLines?: unknown
        } | null
        const input = formatArgs(a0)
        setTermText(box, '[data-ms-term-out="1"]', output || "running...")
        setTermStatus(box, "running")
        termSet(id, {
          id,
          tool,
          input: input || termMap[id]?.input || "",
          output: output || "running...",
          status: "running",
        })
        setState("tool")
      }

      if (phase === "error") {
        const r0 = (p0.result && typeof p0.result === "object" ? p0.result : null) as {
          output?: unknown
          text?: unknown
          exitCode?: unknown
          error?: unknown
        } | null
        const output = formatResult(r0)
        const a0 = (p0.args && typeof p0.args === "object" ? p0.args : null) as {
          command?: unknown
          keys?: unknown
          tailLines?: unknown
        } | null
        const input = formatArgs(a0)
        setTermText(box, '[data-ms-term-out="1"]', output || "failed")
        setTermStatus(box, "failed")
        termSet(id, {
          id,
          tool,
          input: input || termMap[id]?.input || "",
          output: output || "failed",
          status: "failed",
        })

        if (!txt) {
          setState("thinking")
        }
      }

      return true
    }

    if (ev === "delta") {
      if (data) {
        txt += data
        run.txt = txt
        draw()
        setState("streaming")
        return true
      }

      return false
    }

    if (ev === "error") {
      const msg = data || "Request failed"
      const legacy = isLegacyStallText(msg)

      if (legacy) {
        stop = true
        stalled = true
        run.stalled = true
        setState("stalled")
        return true
      }

      err = msg
      stop = true
      final = true
      setState("error")
      return true
    }

    if (ev === "done") {
      stop = true
      final = true
      setState("done")
      return true
    }

    return false
  }

  const stall = 25000
  const tick = () => {
    if (stop || final || run.stop) {
      return
    }

    renderStatus()

    const gap = Date.now() - last

    if (gap < stall) {
      return
    }

    if (stalled) {
      return
    }

    stalled = true
    run.stalled = true
    setState("stalled")
    finalizeTerms("Tool stalled (no output)")
  }
  var tid = win.setInterval(tick, 1000)
  setState("thinking")
  touch()

  for (;;) {
    if (run.stop) {
      rd.cancel().catch(() => {})
      break
    }

    const part = await rd.read().catch(() => null)

    if (!part) {
      if (!run.stop) {
        err = err || "Stream interrupted"
      }
      break
    }

    if (part.done) {
      break
    }

    const chunk = dec.decode(part.value, { stream: true })

    if (!chunk) {
      continue
    }

    buf += chunk
    buf = buf.replace(/\r/g, "")

    for (;;) {
      const idx = buf.indexOf("\n\n")

      if (idx < 0) {
        break
      }

      const raw = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const moved = parse(raw)

      if (moved) {
        touch()
      }

      if (stop) {
        break
      }
    }

    if (stop) {
      break
    }
  }

  if (tid) {
    win.clearInterval(tid)
  }

  run.txt = txt

  if (!final && !err && !run.stop) {
    const hasText = !!txt.trim()

    if (hasText) {
      final = true
      setState("done")
    }

    if (!final) {
      stalled = true
      run.stalled = true
      setState("stalled")
    }
  }

  if (final && !err && !run.stop && !txt.trim()) {
    stalled = true
    run.stalled = true
    setState("stalled")
  }

  if (err) {
    finalizeTerms(err)
    return { stream: true, ok: false, text: txt, error: err, stalled, terms: termList() }
  }

  if (stalled) {
    finalizeTerms("Tool run ended before assistant response")
    return { stream: true, ok: false, text: txt, stalled, terms: termList() }
  }

  if (final || run.stop) {
    finalizeTerms("Tool run ended before completion")
  }

  return { stream: true, ok: true, text: txt, terms: termList() }
}
