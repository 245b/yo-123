export type LayoutApi = {
  host: (ta?: HTMLTextAreaElement | null) => HTMLDivElement | null
  home: (ta?: HTMLTextAreaElement | null) => HTMLElement | null
  tune: (ta: HTMLTextAreaElement, home: boolean) => void
}

export const setupLayout = (
  doc: Document,
  win: Window,
  sr: ShadowRoot | null,
  set: (ta: HTMLTextAreaElement) => void,
): LayoutApi => {
  const dk = "__ms_chat_draft"

  const host = (ta?: HTMLTextAreaElement | null) => {
    const rr = ta?.closest?.("#chat-home-view-container") ?? null
    const root1 = rr && (rr as Node).nodeType === 1 ? (rr as HTMLElement) : null
    const rn0 = ta?.getRootNode?.() ?? null
    const rn = rn0 instanceof Document || rn0 instanceof ShadowRoot ? rn0 : null
    const rs0 = rn?.querySelector?.("#chat-home-view-container") ?? null
    const root2 = rs0 && (rs0 as Node).nodeType === 1 ? (rs0 as HTMLElement) : null
    const sh = sr ?? doc.querySelector("browser-mcp-container")?.shadowRoot ?? null
    const root0 =
      root1 ??
      root2 ??
      doc.getElementById("chat-home-view-container") ??
      sh?.querySelector("#chat-home-view-container") ??
      null
    const root = root0 && (root0 as Node).nodeType === 1 ? (root0 as HTMLElement) : null

    if (!root) {
      return null
    }

    const id = "__ms_ds"
    const cur0 = root.querySelector(`#${id}`) ?? null
    const cur = cur0?.tagName === "DIV" ? (cur0 as HTMLDivElement) : null
    const div = cur ?? doc.createElement("div")
    div.id = id

    const list0 = div.querySelector("#__ms_ds_list") ?? null
    const list = list0?.tagName === "DIV" ? (list0 as HTMLDivElement) : doc.createElement("div")
    list.id = "__ms_ds_list"

    if (!list0) {
      div.appendChild(list)
    }

    const kids = Array.from(root.children)
    const head0 = kids[0] ?? null
    const head = head0 && (head0 as Node).nodeType === 1 ? (head0 as HTMLElement) : null
    const wi = ta ? kids.find((k) => k.contains(ta)) ?? null : null
    const wrap0 = wi ?? kids[kids.length - 1] ?? null
    const wrap = wrap0 && (wrap0 as Node).nodeType === 1 ? (wrap0 as HTMLElement) : null

    if (head) {
      head.style.display = "none"
    }

    if (wrap) {
      wrap.style.setProperty("margin-top", "auto", "important")
      wrap.style.setProperty("width", "100%", "important")
      wrap.style.setProperty("max-width", "768px", "important")
      wrap.style.setProperty("margin-left", "auto", "important")
      wrap.style.setProperty("margin-right", "auto", "important")
    }

    root.style.setProperty("margin-top", "0", "important")
    root.style.setProperty("max-width", "100%", "important")
    root.style.setProperty("min-width", "0", "important")
    root.style.setProperty("width", "100%", "important")
    root.style.setProperty("padding", "0", "important")
    root.style.setProperty("display", "flex", "important")
    root.style.setProperty("flex-direction", "column", "important")
    root.style.setProperty("gap", "0", "important")

    const r = root.getBoundingClientRect()
    const h0 = Math.round(win.innerHeight - r.top)
    const h = Math.max(240, h0)
    root.style.setProperty("height", `${h}px`, "important")

    const before = wrap

    if (!div.parentElement) {
      before ? root.insertBefore(div, before) : root.appendChild(div)
    }

    if (div.parentElement === root && before && div.nextElementSibling !== before) {
      root.insertBefore(div, before)
    }

    return div
  }

  const home = (ta?: HTMLTextAreaElement | null) => {
    const rr = ta?.closest?.("#chat-home-view-container") ?? null
    const root1 = rr && (rr as Node).nodeType === 1 ? (rr as HTMLElement) : null
    const rn0 = ta?.getRootNode?.() ?? null
    const rn = rn0 instanceof Document || rn0 instanceof ShadowRoot ? rn0 : null
    const rs0 = rn?.querySelector?.("#chat-home-view-container") ?? null
    const root2 = rs0 && (rs0 as Node).nodeType === 1 ? (rs0 as HTMLElement) : null
    const sh = sr ?? doc.querySelector("browser-mcp-container")?.shadowRoot ?? null
    const root0 =
      root1 ??
      root2 ??
      doc.getElementById("chat-home-view-container") ??
      sh?.querySelector("#chat-home-view-container") ??
      null
    const root = root0 && (root0 as Node).nodeType === 1 ? (root0 as HTMLElement) : null

    if (!root) {
      return null
    }

    const id = "__ms_ds"
    const cur0 = root.querySelector(`#${id}`) ?? null
    const cur = cur0?.tagName === "DIV" ? (cur0 as HTMLDivElement) : null
    cur?.remove()

    const kids = Array.from(root.children)
    const head0 = kids[0] ?? null
    const head = head0 && (head0 as Node).nodeType === 1 ? (head0 as HTMLElement) : null
    const wi = ta ? kids.find((k) => k.contains(ta)) ?? null : null
    const wrap0 = wi ?? kids[kids.length - 1] ?? null
    const wrap = wrap0 && (wrap0 as Node).nodeType === 1 ? (wrap0 as HTMLElement) : null

    if (head) {
      head.style.removeProperty("display")
    }

    if (wrap) {
      wrap.style.removeProperty("margin-top")
      wrap.style.removeProperty("width")
      wrap.style.removeProperty("max-width")
      wrap.style.removeProperty("margin-left")
      wrap.style.removeProperty("margin-right")
    }

    root.style.removeProperty("margin-top")
    root.style.removeProperty("max-width")
    root.style.removeProperty("min-width")
    root.style.removeProperty("width")
    root.style.removeProperty("padding")
    root.style.removeProperty("display")
    root.style.removeProperty("flex-direction")
    root.style.removeProperty("gap")
    root.style.removeProperty("height")
    return root
  }

  const tune = (ta: HTMLTextAreaElement, home0: boolean) => {
    const v = win.localStorage.getItem(dk) ?? ""
    ta.value = ""

    if (v) {
      ta.value = v
    }

    const ph = home0 ? "Assign a task or ask anything" : "Send message to Manus"
    ta.setAttribute("placeholder", ph)
    ta.rows = home0 ? 2 : 1
    const g = win as unknown as typeof globalThis
    const E = g.Event
    ta.dispatchEvent(new E("input", { bubbles: true }))
    ta.dispatchEvent(new E("change", { bubbles: true }))
    set(ta)
  }

  return { host, home, tune }
}
