/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { makeRuntimeFrameBase, type RuntimeEnvelope } from "@operator/contracts/runtime-ipc"
import type { HostSupervisor } from "@operator/runtime-core/host-supervisor"

type HandshakeRole = "extension-host" | "lsp-host"
type HandshakeStage = "starting" | "ready" | "initialized"

type HandshakeRow = {
  role: HandshakeRole
  stage: HandshakeStage
  readyTimer: ReturnType<typeof setTimeout> | null
  initTimer: ReturnType<typeof setTimeout> | null
}

type HostHandshakeInput = {
  host: HostSupervisor
  onWarning: (role: HandshakeRole, message: string) => void
}

const READY_TIMEOUT_MS = 15000
const INIT_TIMEOUT_MS = 15000

const nowId = () => {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 10)
  return `${t}-${r}`
}

const toRole = (raw: string) => {
  const t0 = typeof raw === "string" ? raw : ""
  const t = t0.trim()

  if (t === "extension-host" || t === "lsp-host") {
    return t
  }

  return ""
}

const isOkResponse = (envelope: RuntimeEnvelope, method: string) => {
  if (envelope.kind !== "response") {
    return false
  }

  if (envelope.method !== method) {
    return false
  }

  return envelope.ok === true
}

const initCapabilities = (role: HandshakeRole) => {
  if (role === "extension-host") {
    return {
      commandRegistration: true,
      terminalAccess: true,
      workspaceRead: true,
      workspaceWrite: true,
      diagnostics: true,
    }
  }

  return {
    diagnostics: true,
    workspaceRead: true,
    commandRegistration: false,
    terminalAccess: false,
    workspaceWrite: false,
  }
}

export class HostHandshakeCoordinator {
  private readonly host: HostSupervisor
  private readonly onWarning: (role: HandshakeRole, message: string) => void
  private readonly rows = new Map<HandshakeRole, HandshakeRow>()

  constructor(input: HostHandshakeInput) {
    this.host = input.host
    this.onWarning = input.onWarning
  }

  start(role: HandshakeRole) {
    this.clear(role)
    const row: HandshakeRow = {
      role,
      stage: "starting",
      readyTimer: null,
      initTimer: null,
    }
    this.rows.set(role, row)
    row.readyTimer = setTimeout(() => {
      this.onReadyTimeout(role)
    }, READY_TIMEOUT_MS)
  }

  stopAll() {
    const keys = Array.from(this.rows.keys())

    for (var i = 0; i < keys.length; i++) {
      const role = keys[i]

      if (!role) {
        continue
      }

      this.clear(role)
    }
  }

  onEnvelope(roleRaw: string, envelope: RuntimeEnvelope) {
    const role = toRole(roleRaw)

    if (!role) {
      return
    }

    const row = this.rows.get(role)

    if (!row) {
      return
    }

    if (envelope.kind === "event") {
      this.onEvent(row, envelope.event)
      return
    }

    if (!isOkResponse(envelope, "initialize_host")) {
      return
    }

    row.stage = "initialized"

    if (row.initTimer) {
      clearTimeout(row.initTimer)
      row.initTimer = null
    }
  }

  private onEvent(row: HandshakeRow, eventRaw: string) {
    const event0 = typeof eventRaw === "string" ? eventRaw : ""
    const event = event0.trim().toLowerCase()

    if (event !== "ready" && event !== "initialized") {
      return
    }

    if (event === "ready") {
      row.stage = "ready"

      if (row.readyTimer) {
        clearTimeout(row.readyTimer)
        row.readyTimer = null
      }

      this.sendInitialize(row.role)
      return
    }

    row.stage = "initialized"

    if (row.initTimer) {
      clearTimeout(row.initTimer)
      row.initTimer = null
    }
  }

  private sendInitialize(role: HandshakeRole) {
    const id = nowId()
    const sent = this.host.send(role, {
      ...makeRuntimeFrameBase({
        id,
        requestId: id,
        role: "runtime-supervisor",
        channel: role === "extension-host" ? "extension" : "lsp",
        method: "initialize_host",
        sessionId: "operator",
      }),
      version: "v1",
      kind: "request",
      method: "initialize_host",
      params: {
        hostRole: role,
        version: "v1",
        capabilities: initCapabilities(role),
      },
    })

    if (!sent) {
      this.onWarning(role, `${role} initialize_host dispatch failed`)
      this.host.restart(role, "initialize_dispatch_failed")
      this.start(role)
      return
    }

    const row = this.rows.get(role)

    if (!row) {
      return
    }

    if (row.initTimer) {
      clearTimeout(row.initTimer)
    }

    row.initTimer = setTimeout(() => {
      this.onInitTimeout(role)
    }, INIT_TIMEOUT_MS)
  }

  private onReadyTimeout(role: HandshakeRole) {
    this.onWarning(role, `${role} did not send Ready within ${READY_TIMEOUT_MS}ms`)
    this.host.restart(role, "ready_timeout")
    this.start(role)
  }

  private onInitTimeout(role: HandshakeRole) {
    this.onWarning(role, `${role} did not complete Initialized within ${INIT_TIMEOUT_MS}ms`)
    this.host.restart(role, "initialize_timeout")
    this.start(role)
  }

  private clear(role: HandshakeRole) {
    const row = this.rows.get(role)

    if (!row) {
      return
    }

    if (row.readyTimer) {
      clearTimeout(row.readyTimer)
    }

    if (row.initTimer) {
      clearTimeout(row.initTimer)
    }

    this.rows.delete(role)
  }
}
