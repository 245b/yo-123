import type { AgentWsServerEvent } from "./types"

export const encodeAgentEvent = (event: AgentWsServerEvent) => {
  return JSON.stringify(event)
}

export const sendAgentEvent = (ws: Bun.ServerWebSocket<unknown>, event: AgentWsServerEvent) => {
  const raw = encodeAgentEvent(event)
  ws.send(raw)
}
