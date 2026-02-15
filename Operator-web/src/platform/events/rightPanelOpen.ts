import { readActiveChat } from "../../lib/activeChat"

type RightPanelOpenReq = {
  type?: unknown
  chatId?: unknown
  reason?: unknown
}

const readChatId = (input: RightPanelOpenReq | null) => {
  const chat0 = typeof input?.chatId === "string" ? input.chatId : ""
  return chat0.trim()
}

export const subscribeRightPanelOpenRequest = (onOpen: () => void) => {
  const onMessage = (ev: MessageEvent) => {
    const row = ev.data as RightPanelOpenReq | null
    const type0 = typeof row?.type === "string" ? row.type : ""
    const type = type0.trim()

    if (type !== "ms-right-panel-open-request") {
      return
    }

    const chat = readChatId(row)
    const active = readActiveChat(window)

    if (chat && active && chat !== active) {
      return
    }

    onOpen()
  }

  window.addEventListener("message", onMessage)
  return () => window.removeEventListener("message", onMessage)
}
