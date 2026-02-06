export type OverlayDeps = {
  doc: Document
  tdoc: Document
  win: Window
  top: Window
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

const near = (t: EventTarget | null) => {
  const n = t as Node | null

  if (!n) {
    return null as Element | null
  }

  if (n.nodeType === 1) {
    return n as Element
  }

  return (n as { parentElement?: Element | null }).parentElement ?? null
}

export const initChatOverlays = (deps: OverlayDeps) => {
  const mid = "__ms_task_row_operator"
  const did = "__ms_task_row_del"
  const kid = "data-ms-del-id"
  var lastId = ""

  const hide = () => {
    const m0 = deps.doc.getElementById(mid) ?? null
    const m = m0?.tagName === "DIV" ? (m0 as HTMLDivElement) : null

    if (m) {
      m.style.setProperty("display", "none", "important")
      m.removeAttribute("data-ms-id")
    }

    const d0 = deps.tdoc.getElementById(did) ?? null
    const d = d0?.tagName === "DIV" ? (d0 as HTMLDivElement) : null

    if (d) {
      d.style.setProperty("display", "none", "important")
      d.removeAttribute("data-ms-id")
    }

    deps.tdoc.documentElement.removeAttribute(kid)
  }

  const body = deps.doc.body ?? null
  const m0 = deps.doc.getElementById(mid) ?? null
  const m1 = m0?.tagName === "DIV" ? (m0 as HTMLDivElement) : null
  var menu = m1

  if (!menu && body) {
    const div = deps.doc.createElement("div")
    div.id = mid
    div.className =
      "bg-[var(--background-operator-white)] rounded-xl border-[0.5px] border-[var(--border-dark)] min-w-[110px] p-1 fixed z-[2147483647]"
    div.style.position = "fixed"
    div.style.zIndex = "2147483647"
    div.style.display = "none"
    div.style.left = "0px"
    div.style.top = "0px"
    div.style.boxShadow = "0 4px 11px 0 var(--shadow-S, rgba(0,0,0,0.25))"
    div.innerHTML =
      '<div data-ms-act="edit" class="flex items-center gap-2 w-full p-2 rounded-[8px] hover:bg-[var(--fill-tsp-white-main)] cursor-pointer text-[var(--text-primary)] text-sm">' +
      '<div class="size-5 flex items-center justify-center">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--icon-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path></svg>' +
      "</div>" +
      '<div class="flex-1 flex items-center gap-2 min-w-0">Edit</div>' +
      "</div>" +
      '<div data-ms-act="delete" class="flex items-center gap-2 w-full p-2 rounded-[8px] hover:bg-[var(--fill-tsp-white-main)] cursor-pointer text-sm text-[var(--function-error)]">' +
      '<div class="size-5 flex items-center justify-center">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--function-error)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 lucide-trash-2" aria-hidden="true"><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>' +
      "</div>" +
      '<div class="flex-1 flex items-center gap-2 min-w-0">Delete</div>' +
      "</div>"
    body.appendChild(div)
    menu = div
  }

  const d0 = deps.tdoc.getElementById(did) ?? null
  const d1 = d0?.tagName === "DIV" ? (d0 as HTMLDivElement) : null
  var del = d1

  const tbody = deps.tdoc.body ?? null

  if (!del && tbody) {
    const div = deps.tdoc.createElement("div")
    div.id = did
    div.style.display = "none"
    div.innerHTML =
      '<div data-ms-act="bg" style="position: fixed; inset: 0; z-index: 2147483646; background: rgba(0,0,0,0.3); backdrop-filter: blur(4px);"></div>' +
      '<div data-ms-act="dlg" role="dialog" style="position: fixed; z-index: 2147483647; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 440px; max-width: calc(100vw - 80px); max-height: calc(100vh - 80px); overflow: auto; border-radius: 20px; background: var(--background-operator-gray, rgb(24 24 27)); border: 1px solid rgba(255,255,255,0.06);">' +
      '<div style="display: flex; gap: 12px; padding: 20px 16px 12px 20px;">' +
      '<div style="flex: 1; display: flex; align-items: center;"><h3 style="color: var(--text-primary, #fff); font-size: 18px; line-height: 24px; font-weight: 600; margin: 0;">Delete Task</h3></div>' +
      '<div data-ms-act="x" style="display: flex; height: 28px; width: 28px; align-items: center; justify-content: center; cursor: pointer; border-radius: 8px;">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>' +
      "</div>" +
      "</div>" +
      '<div style="padding: 0 20px; color: var(--text-tertiary, rgba(244,244,245,0.7)); font-size: 14px;">Are you sure you want to delete this task?</div>' +
      '<div style="padding: 20px; display: flex; justify-content: flex-end; gap: 8px;">' +
      '<div data-ms-act="cancel" style="height: 36px; min-width: 72px; cursor: pointer; display: flex; background: rgba(0,0,0,0.001);">' +
      '<div style="flex: 1; height: 36px; min-width: 72px; padding: 0 12px; border-radius: 10px; font-size: 14px; display: flex; align-items: center; justify-content: center; background: transparent; color: var(--text-primary, #fff); border: 1px solid var(--border-btn-main, rgba(255,255,255,0.12));">Cancel</div>' +
      "</div>" +
      '<div data-ms-act="ok" style="height: 36px; min-width: 72px; cursor: pointer; display: flex; background: rgba(0,0,0,0.001);">' +
      '<div style="flex: 1; height: 36px; min-width: 72px; padding: 0 12px; border-radius: 10px; font-size: 14px; display: flex; align-items: center; justify-content: center; background: var(--function-error, rgb(239 68 68)); color: var(--text-primary, #fff); border: 0;">Delete</div>' +
      "</div>" +
      "</div>" +
      "</div>"
    tbody.appendChild(div)
    del = div
  }

  if (del && del.getAttribute("data-ms-init") !== "1") {
    const d = del
    d.setAttribute("data-ms-init", "1")

    const hit = (ev: Event) => {
      const inline = d.style.display ?? ""
      const win = deps.tdoc.defaultView ?? null
      const cs = win ? win.getComputedStyle(d) : null
      const visible = inline ? inline !== "none" : cs?.display !== "none"

      if (!visible) {
        return
      }

      var act = ""
      var hitId = ""
      const path = (ev as PointerEvent).composedPath?.() ?? []

      for (var i = 0; i < path.length; i++) {
        const el = path[i] as { getAttribute?: (s: string) => string | null } | null
        const v0 = (el?.getAttribute?.("data-ms-act") ?? "").trim()
        const pid0 = (el?.getAttribute?.("data-ms-id") ?? "").trim()

        if (!hitId && pid0) {
          hitId = pid0
        }

        if (!v0) {
          continue
        }

        act = v0
        break
      }

      if (!act) {
        const t0 = near(ev.target)
        const it = t0?.closest?.("[data-ms-act]") ?? null
        act = (it?.getAttribute?.("data-ms-act") ?? "").trim()

        if (!hitId) {
          const pid0 = (it?.getAttribute?.("data-ms-id") ?? "").trim()
          hitId = pid0
        }
      }

      if (!act || act === "dlg") {
        return
      }

      ev.preventDefault()
      ev.stopPropagation()

      if (act === "bg" || act === "x" || act === "cancel") {
        hide()
        return
      }

      if (act !== "ok") {
        return
      }

      var id = (d.getAttribute("data-ms-id") ?? "").trim()

      if (!id) {
        id = lastId
      }

      if (!id) {
        const did0 = deps.tdoc.documentElement.getAttribute(kid) ?? ""
        id = did0.trim()
      }

      if (!id) {
        const cur0 = deps.win.localStorage.getItem("ms_chat_active") ?? ""
        id = cur0.trim()
      }

      if (!id) {
        id = hitId
      }

      if (!id) {
        const cur = deps.doc.querySelector('[data-ms-chat][aria-current="page"]') ?? null
        const cid0 = cur?.getAttribute?.("data-ms-chat") ?? ""
        id = cid0.trim()
      }

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

      const host = deps.doc.querySelector("browser-mcp-container") ?? null
      const sr = host?.shadowRoot ?? null
      rm(deps.doc)
      rm(sr)
      hide()
      deps.onDelete(id)
    }

    d.addEventListener("pointerdown", hit, true)
    d.addEventListener("click", hit, true)
  }

  if (menu && menu.getAttribute("data-ms-init") !== "1") {
    menu.setAttribute("data-ms-init", "1")

    const run = (ev: Event) => {
      const b0 = (ev as unknown as { button?: unknown } | null)?.button
      const b = typeof b0 === "number" ? b0 : 0

      if (b !== 0) {
        ev.preventDefault()
        ev.stopPropagation()
        return
      }

      ev.preventDefault()
      ev.stopPropagation()

      const t0 = near(ev.target)
      const it = t0?.closest?.("[data-ms-act]") ?? null

      if (!it) {
        return
      }

      const act = (it.getAttribute("data-ms-act") ?? "").trim()
      const id0 = (menu?.getAttribute("data-ms-id") ?? "").trim()
      const id1 = (it.getAttribute("data-ms-id") ?? "").trim()
      const id = id0 || id1
      hide()

      if (!id) {
        return
      }

      if (act === "edit") {
        deps.onEdit(id)
        return
      }

      if (act !== "delete") {
        return
      }

      const m0 = deps.tdoc.getElementById(did) ?? null
      const m1 = m0?.tagName === "DIV" ? (m0 as HTMLDivElement) : null

      if (!m1) {
        return
      }

      lastId = id
      deps.tdoc.documentElement.setAttribute(kid, id)
      m1.style.display = "block"
      m1.setAttribute("data-ms-id", id)
      m1.querySelectorAll<HTMLElement>("[data-ms-act]").forEach((el) => {
        el.setAttribute("data-ms-id", id)
      })
    }

    menu.addEventListener("pointerdown", run, true)
    menu.addEventListener("click", run, true)
  }

  const mk = "data-ms-task-row-operator"
  const okm = deps.doc.documentElement.getAttribute(mk) === "1"

  if (!okm) {
    deps.doc.documentElement.setAttribute(mk, "1")

    const fn = (ev: Event) => {
      const d0 = deps.tdoc.getElementById(did) ?? null
      const d = d0?.tagName === "DIV" ? (d0 as HTMLDivElement) : null
      const don = d?.style.display === "block"

      if (don && d) {
        const n = ev.target as Node | null

        if (n && d.contains(n)) {
          var act = ""
          const path = (ev as PointerEvent).composedPath?.() ?? []

          for (var i = 0; i < path.length; i++) {
            const el = path[i] as { getAttribute?: (s: string) => string | null } | null
            const v0 = (el?.getAttribute?.("data-ms-act") ?? "").trim()

            if (!v0) {
              continue
            }

            act = v0
            break
          }

          if (!act) {
            const t0 = near(ev.target)
            const it = t0?.closest?.("[data-ms-act]") ?? null
            act = (it?.getAttribute?.("data-ms-act") ?? "").trim()
          }

          const x0 = (ev as unknown as { clientX?: unknown } | null)?.clientX
          const y0 = (ev as unknown as { clientY?: unknown } | null)?.clientY
          const x = typeof x0 === "number" ? x0 : Number.NaN
          const y = typeof y0 === "number" ? y0 : Number.NaN

          if ((act === "dlg" || !act) && Number.isFinite(x) && Number.isFinite(y)) {
            const c0 = d.querySelector('[data-ms-act="cancel"]') ?? null
            const o0 = d.querySelector('[data-ms-act="ok"]') ?? null
            const c = c0?.tagName === "DIV" ? (c0 as HTMLDivElement) : null
            const o = o0?.tagName === "DIV" ? (o0 as HTMLDivElement) : null
            const cr = c?.getBoundingClientRect?.()
            const or = o?.getBoundingClientRect?.()
            const inc = cr ? x >= cr.left && x <= cr.right && y >= cr.top && y <= cr.bottom : false
            const ino = or ? x >= or.left && x <= or.right && y >= or.top && y <= or.bottom : false

            if (inc) {
              act = "cancel"
            }

            if (ino) {
              act = "ok"
            }
          }

          if (!act || act === "dlg") {
            const tg = (ev.target as { tagName?: string } | null)?.tagName ?? ""

            if (tg === "BODY" || tg === "HTML") {
              hide()
            }

            return
          }

          ev.preventDefault()
          ev.stopPropagation()

          if (act === "bg" || act === "x" || act === "cancel") {
            hide()
            return
          }

          if (act !== "ok") {
            return
          }

          const id = (d.getAttribute("data-ms-id") ?? "").trim()
          hide()
          deps.onDelete(id)
          return
        }
      }

      const m0 = deps.doc.getElementById(mid) ?? null
      const m = m0?.tagName === "DIV" ? (m0 as HTMLDivElement) : null
      const on = m?.style.display === "block"

      if (!on || !m) {
        return
      }

      const t0 = near(ev.target)
      const mo0 = t0?.closest?.('[data-ms-more="1"]') ?? null

      if (mo0) {
        return
      }

      const t = ev.target as Node | null

      if (t && m.contains(t)) {
        return
      }

      hide()
    }

    const kd = (ev: Event) => {
      const k = (ev as KeyboardEvent).key ?? ""

      if (k !== "Escape") {
        return
      }

      hide()
    }

    deps.win.addEventListener("pointerdown", fn, true)
    deps.win.addEventListener("click", fn, true)
    deps.win.addEventListener("keydown", kd, true)
    deps.top.addEventListener("keydown", kd, true)
  }

  return { menu, del, hide }
}
