import { initChatOverlays } from "./chats/overlays"
import { loadChats, saveChats, type ChatItem } from "./chats/store"
import { apiBaseCandidates, apiUrlWithBase, probeApiBase, rememberApiBase } from "../../lib/api"

export const chats = (doc: Document) => {
  const win = doc.defaultView

  if (!win) {
    return false
  }

  const tw = win.parent && win.parent !== win ? win.parent : win
  const tdoc = tw.document ?? doc
  const host = doc.querySelector("browser-mcp-container") ?? null
  const sr = host?.shadowRoot ?? null
  const roots: ParentNode[] = sr ? [doc, sr] : [doc]

  const pad = 12
  const ck = "ms_chats"
  const ak = "ms_chat_active"
  const pk = "ms_chat_"
  const ap = "ms_chat_att_"
  const tk = "ms_chat_term_"
  const hk = "ms_chat_title_"
  const nk = "ms_chat_title_name_"

  const load = () => loadChats(win, ck)
  const save = (cs: ChatItem[]) => saveChats(win, ck, cs)
  const cleanupRemote = (id: string) => {
    const path = `/api/chats/${encodeURIComponent(id)}/cleanup`
    const payload = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }
    const call = async () => {
      const tryFetch = async (bases: string[]) => {
        for (var i = 0; i < bases.length; i++) {
          const b = bases[i] ?? ""
          const url = apiUrlWithBase(path, b)
          const res = await win.fetch(url, payload).catch(() => null)

          if (!res) {
            continue
          }

          if (res.status === 404) {
            continue
          }

          if (b) {
            rememberApiBase(b)
          }

          return true
        }

        return false
      }
      const first = apiBaseCandidates()
      const list = first.length ? first.concat("") : [""]
      const ok = await tryFetch(list)

      if (ok) {
        return
      }

      await probeApiBase()
      const second = apiBaseCandidates()
      const list2 = second.length ? second.concat("") : [""]
      await tryFetch(list2)
    }

    void call()
  }

  const drop = (id0: string) => {
    const id = (id0 ?? "").trim()

    if (!id) {
      return
    }

    const cs = load()
    const out = cs.filter((c) => c.id !== id)
    save(out)
    cleanupRemote(id)
    win.localStorage.removeItem(`${pk}${id}`)
    win.localStorage.removeItem(`${ap}${id}`)
    win.localStorage.removeItem(`${tk}${id}`)
    win.localStorage.removeItem(`${hk}${id}`)
    win.localStorage.removeItem(`${nk}${id}`)

    const rm = (root: ParentNode | null) => {
      if (!root) {
        return
      }

      const nodes = root.querySelectorAll("[data-ms-chat]")

      for (var i = 0; i < nodes.length; i++) {
        const n = nodes[i]
        const v = (n?.getAttribute?.("data-ms-chat") ?? "").trim()

        if (v !== id) {
          continue
        }

        n?.remove()
      }
    }

    rm(doc)
    rm(sr)

    const cur = (win.localStorage.getItem(ak) ?? "").trim()

    if (cur === id) {
      const next = (out[0]?.id ?? "").trim()

      if (next) {
        win.localStorage.setItem(ak, next)
        win.requestAnimationFrame(() => chats(doc))
        return
      }

      win.localStorage.removeItem(ak)
    }

    win.requestAnimationFrame(() => chats(doc))
  }

  const watch = () => {
    const ww = win as unknown as { __ms_chats_watch?: number; __ms_chats_last?: string }

    if (ww.__ms_chats_watch) {
      return
    }

    ww.__ms_chats_last = win.localStorage.getItem(ck) ?? ""

    const tick = () => {
      ww.__ms_chats_watch = 0
      const cur = win.localStorage.getItem(ck) ?? ""
      const last = ww.__ms_chats_last ?? ""

      if (cur !== last) {
        ww.__ms_chats_last = cur
        win.requestAnimationFrame(() => chats(doc))
      }

      ww.__ms_chats_watch = win.setTimeout(tick, 300)
    }

    ww.__ms_chats_watch = win.setTimeout(tick, 300)
  }

  const edit = (id: string) => {
    const cs = load()
    const idx = cs.findIndex((c) => c.id === id)

    if (idx < 0) {
      return
    }

    const cur = cs[idx]?.name ?? ""
    const next0 = win.prompt("Edit name", cur) ?? ""
    const next = next0.replace(/[\t\r\n]+/g, " ").trim()

    if (!next) {
      return
    }

    const at = cs[idx]?.at ?? 0
    cs[idx] = { id, name: next, at }
    save(cs)
    win.requestAnimationFrame(() => chats(doc))
  }

  const ov = initChatOverlays({ doc, tdoc, win, top: tw, onEdit: edit, onDelete: drop })
  const menu = ov.menu
  const hide = ov.hide

  var btn: HTMLElement | null = null
  var list: HTMLElement | null = null

  for (var ri = 0; ri < roots.length; ri++) {
    const root = roots[ri]
    const qs = Array.from(
      root.querySelectorAll<HTMLElement>('div.inline-flex.w-max.items-center.gap-1.px-3.py-0.clickable[aria-haspopup="dialog"]'),
    )

    for (var i = 0; i < qs.length; i++) {
      const d = qs[i]
      const txt0 = d?.textContent ?? ""
      const txt = txt0.replace(/\s+/g, " ").trim()

      if (txt !== "All tasks") {
        continue
      }

      btn = d
      break
    }

    if (!btn) {
      const hs = Array.from(root.querySelectorAll<HTMLElement>('[aria-haspopup="dialog"]'))

      for (var i = 0; i < hs.length; i++) {
        const d = hs[i]
        const txt0 = d?.textContent ?? ""
        const txt = txt0.replace(/\s+/g, " ").trim()

        if (txt !== "All tasks") {
          continue
        }

        btn = d
        break
      }
    }

    if (!btn) {
      const ns = Array.from(root.querySelectorAll<HTMLElement>(".clickable"))

      for (var i = 0; i < ns.length; i++) {
        const d = ns[i]
        const txt0 = d?.textContent ?? ""
        const txt = txt0.replace(/\s+/g, " ").trim()

        if (txt !== "All tasks") {
          continue
        }

        btn = d
        break
      }
    }

    if (!btn) {
      continue
    }

    const n0 = btn.nextElementSibling ?? null
    const n1 = n0 ? (n0 as HTMLElement) : null

    if (n1) {
      list = n1
      break
    }

    const p = btn.parentElement

    if (!p) {
      break
    }

    const cs = Array.from(p.children)
    const idx = cs.indexOf(btn)

    if (idx < 0) {
      break
    }

    for (var j = idx + 1; j < cs.length; j++) {
      const el0 = cs[j]
      const el = el0 ? (el0 as HTMLElement) : null

      if (!el) {
        continue
      }

      list = el
      break
    }

    break
  }

  if (!btn) {
    return false
  }

  if (!list) {
    const div = doc.createElement("div")
    div.className = "flex flex-col"
    btn.insertAdjacentElement("afterend", div)
    list = div
  }

  list.style.display = "flex"
  list.style.flexDirection = "column"
  list.style.gap = "4px"
  list.style.overflowY = "auto"
  list.style.overscrollBehavior = "contain"

  const br = list.getBoundingClientRect?.()
  const h0 = Math.round((win.innerHeight ?? 0) - (br?.top ?? 0) - 12)
  const h = Math.max(120, h0)
  list.style.maxHeight = `${h}px`

  const id = "__ms_chats"
  const bx0 = list.querySelector(`#${id}`) ?? null
  const bx1 = bx0?.tagName === "DIV" ? (bx0 as HTMLDivElement) : null
  const gx0 = doc.getElementById(id) ?? null
  const gx1 = gx0?.tagName === "DIV" ? (gx0 as HTMLDivElement) : null
  const gx2 = sr?.querySelector?.(`#${id}`) ?? null
  const gx3 = gx2?.tagName === "DIV" ? (gx2 as HTMLDivElement) : null
  var box: HTMLDivElement | null = bx1 ?? gx1 ?? gx3

  if (!box) {
    const div = doc.createElement("div")
    div.id = id
    list.appendChild(div)
    box = div
  }

  if (box.parentElement !== list) {
    list.appendChild(box)
  }

  const xs0 = Array.from(doc.querySelectorAll(`#${id}`))
  const xs1 = sr ? Array.from(sr.querySelectorAll(`#${id}`)) : []
  const xs = xs0.concat(xs1)

  for (var i = 0; i < xs.length; i++) {
    const el0 = xs[i]

    if (el0 === box) {
      continue
    }

    el0.remove()
  }

  box.textContent = ""
  box.style.display = "flex"
  box.style.flexDirection = "column"
  box.style.gap = "4px"

  const cs = load()
  const cur = (win.localStorage.getItem(ak) ?? "").trim()

  for (var i = 0; i < cs.length; i++) {
    const c = cs[i]
    const row = doc.createElement("div")
    row.className =
      "flex items-center rounded-[10px] clickable cursor-pointer transition-colors w-full gap-3 h-[36px] hover:bg-[var(--fill-tsp-white-light)] pointer-events-auto px-3 py-[7.5px] group"

    if (c.id === cur) {
      row.className += " bg-[var(--fill-tsp-white-main)]"
      row.setAttribute("aria-current", "page")
    }

    row.setAttribute("data-ms-chat", c.id)

    row.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) {
        return
      }

      ev.preventDefault()
      ev.stopPropagation()

      const id = c.id

      if (!id) {
        return
      }

      win.localStorage.setItem(ak, id)
      win.requestAnimationFrame(() => chats(doc))
    })

    const icon = doc.createElement("div")
    icon.className = "shrink-0 size-[18px] flex items-center justify-center text-[var(--icon-secondary)]"
    icon.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>'

    const text = doc.createElement("div")
    text.className = "flex-1 min-w-0 flex gap-[4px] items-center text-[14px] text-[var(--text-primary)]"
    text.style.opacity = "1"
    text.style.width = "auto"

    const span = doc.createElement("span")
    span.className = "truncate"
    span.textContent = c.name
    span.title = c.name

    text.appendChild(span)
    row.appendChild(icon)
    row.appendChild(text)

    const more = doc.createElement("div")
    more.setAttribute("data-ms-more", "1")
    more.style.width = "28px"
    more.style.height = "28px"
    more.style.display = "flex"
    more.style.alignItems = "center"
    more.style.justifyContent = "center"
    more.style.borderRadius = "8px"
    more.style.opacity = "0"
    more.style.transition = "opacity 120ms, background-color 120ms"
    more.style.flexShrink = "0"
    more.style.cursor = "pointer"
    more.style.background = "transparent"
    more.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--icon-secondary, var(--icon-tertiary))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-ellipsis" aria-hidden="true"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>'

    more.addEventListener("pointerenter", () => {
      more.style.background = "var(--fill-tsp-white-main)"
    })

    more.addEventListener("pointerleave", () => {
      more.style.background = "transparent"
    })

    row.addEventListener("pointerenter", () => {
      more.style.opacity = "1"
    })

    row.addEventListener("pointerleave", () => {
      more.style.opacity = "0"
    })

    more.addEventListener("pointerdown", (ev) => {
      ev.preventDefault()
      ev.stopPropagation()

      if (ev.button !== 0) {
        return
      }

      if (!menu) {
        return
      }

      const cid = (c.id ?? "").trim()

      if (!cid) {
        return
      }

      const open = (menu.getAttribute("data-ms-id") ?? "").trim()

      if (open === cid && menu.style.display === "block") {
        hide()
        return
      }

      menu.setAttribute("data-ms-id", cid)
      const its = menu.querySelectorAll<HTMLElement>("[data-ms-act]")

      for (var i = 0; i < its.length; i++) {
        its[i]?.setAttribute("data-ms-id", cid)
      }

      menu.style.display = "block"
      menu.style.left = "0px"
      menu.style.top = "0px"

      const b = more.getBoundingClientRect()
      const cx = Math.round(b.left + b.width / 2)
      const top = Math.round(b.top)
      const bot = Math.round(b.bottom)

      const mw = Math.max(110, menu.offsetWidth)
      const mh = Math.max(80, menu.offsetHeight)
      const x0 = Math.round(cx - mw / 2)
      const x1 = Math.max(pad, Math.min(x0, win.innerWidth - mw - pad))
      const y0 = Math.round(bot + 6)
      const ok = y0 + mh <= win.innerHeight - pad
      const y1 = ok ? y0 : Math.max(pad, Math.round(top - mh - 6))

      menu.style.left = `${x1}px`
      menu.style.top = `${y1}px`
    })

    row.appendChild(more)
    box.appendChild(row)
  }

  watch()
  return true
}
