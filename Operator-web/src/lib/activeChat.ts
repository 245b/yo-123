export const activeChatKey = "ms_chat_active"

const ss = (win: Window) => {
  return win.sessionStorage
}

const ls = (win: Window) => {
  return win.localStorage
}

export const readActiveChat = (win: Window) => {
  const s = ss(win)
  const cur0 = s.getItem(activeChatKey) ?? ""
  const cur = cur0.trim()

  if (cur) {
    return cur
  }

  const l = ls(win)
  const old0 = l.getItem(activeChatKey) ?? ""
  const old = old0.trim()

  if (!old) {
    return ""
  }

  s.setItem(activeChatKey, old)
  l.removeItem(activeChatKey)
  return old
}

export const writeActiveChat = (win: Window, id: string) => {
  const s = ss(win)
  const l = ls(win)
  const cur = id.trim()

  if (cur) {
    s.setItem(activeChatKey, cur)
    l.removeItem(activeChatKey)
    return
  }

  s.removeItem(activeChatKey)
  l.removeItem(activeChatKey)
}

export const clearActiveChat = (win: Window) => {
  writeActiveChat(win, "")
}
