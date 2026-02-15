const wsUrl = process.env.WS_URL || "ws://127.0.0.1:3000/api/chat/ws"
const q = process.argv.slice(2).join(" ").trim() || "Search current U.S. news for today and summarize 3 headlines with sources."
const mode = process.env.BENCH_MODE || "operator-main"
const timeoutMsRaw = Number.parseInt(process.env.BENCH_TIMEOUT_MS || "420000", 10)
const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 1000 ? timeoutMsRaw : 420000
const chatId = `bench-${Date.now()}`
const sessionId = chatId
const ws = new WebSocket(wsUrl)
let turnStartedAt = 0
let done = false
let submitted = false
let assistant = ""
const errors = []
const statuses = []
const cmds = []
const cmdEnds = []
const marks = { openedAt: Date.now(), configuredAt: 0, submittedAt: 0, firstDeltaAt: 0, completedAt: 0 }
const out = (code, data) => {
  if (done) {
    return
  }
  done = true
  console.log(JSON.stringify(data, null, 2))
  try {
    ws.close()
  } catch {}
  process.exit(code)
}
const submit = () => {
  if (submitted) {
    return
  }
  submitted = true
  marks.submittedAt = Date.now()
  turnStartedAt = Date.now()
  ws.send(
    JSON.stringify({
      type: "submit_turn",
      chatId,
      sessionId,
      mode,
      allow_terminal_exec: true,
      messages: [{ role: "user", content: q }],
    }),
  )
}
const t = setTimeout(() => {
  out(2, {
    ok: false,
    error: `timeout after ${timeoutMs}ms`,
    wsUrl,
    chatId,
    sessionId,
    mode,
    query: q,
    marks,
    statuses,
    errors,
    cmds,
    cmdEnds,
    assistant_preview: assistant.slice(0, 1000),
  })
}, timeoutMs)
ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ type: "configure", chatId, sessionId, mode, allow_terminal_exec: true }))
})
ws.addEventListener("message", (ev) => {
  let row = null
  try {
    row = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data))
  } catch {
    return
  }
  const type = typeof row?.type === "string" ? row.type : ""
  if (!type) {
    return
  }
  if (type === "session_configured") {
    marks.configuredAt = Date.now()
    submit()
    return
  }
  if (type === "turn_status") {
    statuses.push({ atMs: turnStartedAt ? Date.now() - turnStartedAt : 0, status: row.status || "", detail: row.detail || "" })
    return
  }
  if (type === "exec_command_begin") {
    cmds.push({ atMs: turnStartedAt ? Date.now() - turnStartedAt : 0, callId: row.call_id || "", command: row.command || "", tool: row.tool_name || "" })
    return
  }
  if (type === "exec_command_end") {
    cmdEnds.push({
      atMs: turnStartedAt ? Date.now() - turnStartedAt : 0,
      callId: row.call_id || "",
      exitCode: typeof row.exit_code === "number" ? row.exit_code : null,
      wallTimeMs: typeof row.wall_time_ms === "number" ? row.wall_time_ms : null,
      outputPreview: typeof row.output === "string" ? row.output.slice(0, 300) : "",
    })
    return
  }
  if (type === "agent_message_content_delta") {
    if (!marks.firstDeltaAt) {
      marks.firstDeltaAt = Date.now()
    }
    const d = typeof row.delta === "string" ? row.delta : ""
    if (d) {
      assistant += d
    }
    return
  }
  if (type === "error") {
    errors.push({ atMs: turnStartedAt ? Date.now() - turnStartedAt : 0, message: row.message || "" })
    return
  }
  if (type === "turn_complete") {
    marks.completedAt = Date.now()
    clearTimeout(t)
    const totalMs = turnStartedAt ? marks.completedAt - turnStartedAt : 0
    const firstDeltaMs = marks.firstDeltaAt && turnStartedAt ? marks.firstDeltaAt - turnStartedAt : null
    const mcpCalls = cmds.filter((x) => (x.command || "").includes("mcp-search"))
    out(0, {
      ok: true,
      wsUrl,
      chatId,
      sessionId,
      mode,
      query: q,
      totalMs,
      firstDeltaMs,
      commandCount: cmds.length,
      mcpCallCount: mcpCalls.length,
      mcpCommands: mcpCalls,
      cmdEnds,
      statuses,
      errors,
      assistant_preview: assistant.slice(0, 2000),
    })
  }
})
ws.addEventListener("close", () => {
  if (done) {
    return
  }
})
