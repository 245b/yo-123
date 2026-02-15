/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createInterface } from "node:readline"
import { decodeRuntimeEnvelope, makeRuntimeFrameBase, type RuntimeEnvelope, type RuntimeRequest } from "@operator/contracts/runtime-ipc"
import type { AgentWsServerEvent } from "../../types"

const sessionId = "operator"
const id = "lsp-host-v1"
const INIT_TIMEOUT_MS = 15000
var initialized = false

const emit = (envelope: RuntimeEnvelope) => {
  process.stdout.write(`${JSON.stringify(envelope)}\n`)
}

const emitEvent = (event: string, message: string) => {
  const payload: AgentWsServerEvent = {
    type: "warning",
    chat_id: sessionId,
    message,
  }
  emit({
    ...makeRuntimeFrameBase({
      role: "lsp-host",
      channel: "lsp",
      method: event,
      sessionId,
    }),
    version: "v1",
    kind: "event",
    event,
    chat_id: sessionId,
    payload,
  })
}

const sendHeartbeat = () => {
  emitEvent("heartbeat", "lsp_host_heartbeat")
}

const sendReady = () => {
  emitEvent("ready", "lsp_host_ready")
}

const sendInitialized = () => {
  emitEvent("initialized", "lsp_host_initialized")
}

const respond = (req: RuntimeRequest, ok: boolean, result?: unknown, error?: string) => {
  emit({
    ...makeRuntimeFrameBase({
      id: req.id,
      requestId: req.requestId,
      sessionId: req.sessionId,
      role: "lsp-host",
      channel: req.channel,
      method: req.method,
    }),
    version: "v1",
    kind: "response",
    ok,
    result,
    error,
  })
}

const initParams = (req: RuntimeRequest) => {
  const row = req.params && typeof req.params === "object" ? (req.params as { hostRole?: unknown; version?: unknown; capabilities?: unknown } | null) : null
  const role0 = typeof row?.hostRole === "string" ? row.hostRole : ""
  const role = role0.trim()
  const version0 = typeof row?.version === "string" ? row.version : ""
  const version = version0.trim()
  const capabilities =
    row?.capabilities && typeof row.capabilities === "object" ? (row.capabilities as Record<string, boolean>) : {}
  return { role, version, capabilities }
}

const handle = async (req: RuntimeRequest) => {
  if (req.method === "heartbeat") {
    respond(req, true, { ok: true })
    return
  }

  if (req.method === "initialize_host") {
    const params = initParams(req)

    if (params.role !== "lsp-host") {
      respond(req, false, null, "initialize_host role mismatch")
      return
    }

    if (params.version !== "v1") {
      respond(req, false, null, "initialize_host version mismatch")
      return
    }

    initialized = true
    respond(req, true, {
      lspHostId: id,
      version: "v1",
      acceptedCapabilities: params.capabilities,
    })
    sendInitialized()
    return
  }

  if (!initialized) {
    respond(req, false, null, "lsp-host is not initialized")
    return
  }

  if (req.method === "list_sessions") {
    respond(req, true, { sessions: [] })
    return
  }

  respond(req, true, { ignored: true, method: req.method })
}

const safeParse = (raw: string) => {
  const text0 = typeof raw === "string" ? raw : ""
  const text = text0.trim()

  if (!text) {
    return null
  }

  var parsed: unknown = null

  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return null
  }

  const out = decodeRuntimeEnvelope(parsed)

  if (!out.success) {
    return null
  }

  if (out.data.kind !== "request") {
    return null
  }

  return out.data as RuntimeRequest
}

const main = async () => {
  sendReady()
  const initTimer = setTimeout(() => {
    if (initialized) {
      return
    }

    process.exit(81)
  }, INIT_TIMEOUT_MS)
  const beat = setInterval(() => {
    sendHeartbeat()
  }, 3000)
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

  for await (const line of rl) {
    const parsed = safeParse(line)

    if (!parsed) {
      continue
    }

    await handle(parsed)
  }

  clearTimeout(initTimer)
  clearInterval(beat)
}

await main()

