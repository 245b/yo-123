import { createAutoGrow } from "./chat/autoGrow"
import { sendCss } from "./chat/constants"
import { setupEvents } from "./chat/events"
import { setupFlow } from "./chat/flow"
import { setupInput } from "./chat/input"
import { setupLayout } from "./chat/layout"
import { setupMessages } from "./chat/messages"
import { setupSession } from "./chat/session"
import { setupStore } from "./chat/storage"
import type { DsWin } from "./chat/types"
import type { Mid } from "./types"

export const chat = (doc: Document, win: Window, o: Mid) => {
  const head = doc.head

  if (head) {
    const sid = "__ms_send"
    const s0 = doc.getElementById(sid)
    const s = s0?.tagName === "STYLE" ? (s0 as HTMLStyleElement) : doc.createElement("style")

    if (!(s0?.tagName === "STYLE")) {
      s.id = sid
      head.appendChild(s)
    }

    s.textContent = sendCss
  }

  const sr = doc.querySelector("browser-mcp-container")?.shadowRoot ?? null

  const ok4 = doc.documentElement.getAttribute("data-ms-chat-send") === "1"

  if (!ok4) {
    doc.documentElement.setAttribute("data-ms-chat-send", "1")

    const fit = createAutoGrow(doc, win, sr)

    const input = setupInput(doc, win, sr, fit)

    const store = setupStore(win)
    const layout = setupLayout(doc, win, sr, input.set)
    const host = layout.host

    const messages = setupMessages(doc, win, host)
    const add = messages.add
    const mark = messages.mark
    const flowUi = { host, add, mark }
    const flow = setupFlow(doc, win, sr, input, store, flowUi)
    const session = setupSession(doc, win, sr, layout, messages, input, store)

    ;(win as DsWin).__ms_ds_reset = session.reset
    ;(win as DsWin).__ms_ds_stop = flow.halt
    ;(win as DsWin).__ms_ds_new = session.fresh

    session.start()
    setupEvents(doc, win, sr, input, flow, messages)
  }
}
