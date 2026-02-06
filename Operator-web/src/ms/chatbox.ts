const searchSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>'

const closeSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'

const searchHtml = `<span class="ms-search-icon" aria-hidden="true">${searchSvg}</span><span class="ms-search-label">Search</span><span class="ms-search-remove" aria-hidden="true">${closeSvg}</span>`

export const chatbox = (doc: Document) => {
  const win = doc.defaultView

  if (!win) {
    return
  }

  const sr = doc.querySelector("browser-mcp-container")?.shadowRoot ?? null
  const set = () => {
    const root0 =
      doc.getElementById("chat-home-view-container") ?? sr?.querySelector("#chat-home-view-container") ?? null
    const root = root0 instanceof HTMLElement ? root0 : null
    const q = root ?? sr ?? doc

    var plus: HTMLButtonElement | null = null
    const icon =
      root?.querySelector?.(
        "div.px-3.flex.gap-2.item-center svg.lucide-plus, div.px-3.flex.gap-2.items-center svg.lucide-plus",
      ) ?? null
    plus = icon?.closest?.("button") ?? null

    const row =
      plus?.closest?.("div.px-3.flex.gap-2.item-center") ??
      plus?.closest?.("div.px-3.flex.gap-2.items-center") ??
      plus?.parentElement ??
      null

    var box: HTMLElement | null = null

    if (row) {
      const b0 = row.closest("div.rounded-\\[22px\\], div.rounded-\\[24px\\], form") ?? null
      box = b0 instanceof HTMLElement ? b0 : null
    }

    if (!box) {
      const tas = Array.from(q.querySelectorAll<HTMLTextAreaElement>("textarea"))
      var ta: HTMLTextAreaElement | null = null

      for (var i = 0; i < tas.length; i++) {
        const t = tas[i]
        const ph0 = t?.getAttribute?.("placeholder") ?? ""
        const ph = ph0.trim().toLowerCase()
        const ok0 = ph.includes("ask anything")
        const ok1 = ph.includes("assign a task") && ph.includes("ask")

        if (!ok0 && !ok1) {
          continue
        }

        ta = t
        break
      }

      const b1 = ta?.closest?.("div.rounded-\\[22px\\], div.rounded-\\[24px\\], form") ?? null
      box = b1 instanceof HTMLElement ? b1 : null
    }

    if (!box) {
      return false
    }

    box.setAttribute("data-ms-chatbox", "1")

    const row0 =
      row ??
      box.querySelector("div.px-3.flex.gap-2.item-center, div.px-3.flex.gap-2.items-center") ??
      null
    const row1 = row0 instanceof HTMLElement ? row0 : null

    if (!plus) {
      const host = row1 ?? box
      const bs = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      const send = bs.find((b) => {
        const t = (b.getAttribute("type") ?? "").toLowerCase()

        if (t === "submit") {
          return true
        }

        const a = (b.getAttribute("aria-label") ?? "").toLowerCase()

        if (a.includes("send")) {
          return true
        }

        const c = b.getAttribute("class") ?? ""
        const ok0 = c.includes("bg-[var(--Button-primary-black)]") && c.includes("rounded-full")
        const ok1 = c.includes("w-8") || c.includes("h-8")
        return ok0 && ok1
      }) ?? null
      const mdl = bs.find((b) => b.getAttribute("data-testid") === "model-selector-dropdown") ?? null
      plus =
        bs.filter((b) => {
          if (b === send || b === mdl) {
            return false
          }

          const ms = (b.getAttribute("data-ms-search-pill") ?? "").trim()

          if (ms === "1") {
            return false
          }

          return true
        })[0] ?? null
    }

    if (plus) {
      plus.setAttribute("data-ms-plus", "1")
    }

    var searchBtn: HTMLButtonElement | null = null

    if (plus) {
      const host0 = plus.parentElement ?? row1 ?? box
      const host = host0 instanceof HTMLElement ? host0 : box
      const sb0 = host.querySelector<HTMLButtonElement>('button[data-ms-search-pill="1"]') ?? null
      const sb = sb0 ?? doc.createElement("button")

      if (!sb0) {
        sb.type = "button"
        sb.className = "ms-search-pill"
        sb.setAttribute("data-ms-search-pill", "1")
        sb.innerHTML = searchHtml
      }

      if (plus.nextElementSibling !== sb) {
        plus.insertAdjacentElement("afterend", sb)
      }

      const on = (box.getAttribute("data-ms-search") ?? "").trim() === "1"
      const label = on ? "Search, click to remove" : "Search"

      if (on) {
        sb.setAttribute("data-active", "1")
        sb.setAttribute("aria-pressed", "true")
      } else {
        sb.removeAttribute("data-active")
        sb.setAttribute("aria-pressed", "false")
      }

      sb.setAttribute("aria-label", label)
      sb.setAttribute("title", label)
      searchBtn = sb
    }

    if (plus) {
      const base = row1 ?? box
      const r0 = base.getRootNode?.() ?? doc
      const r = r0 instanceof Document || r0 instanceof ShadowRoot ? r0 : doc
      const btns = Array.from(r.querySelectorAll<HTMLButtonElement>('button[data-testid="model-selector-dropdown"]'))
      const btn =
        base.querySelector<HTMLButtonElement>('button[data-testid="model-selector-dropdown"]') ?? btns[0] ?? null
      const anchor = searchBtn ?? plus
      const label = "Operator 1.5 Lite"
      const setBtn = (b: HTMLButtonElement) => {
        b.type = "button"
        b.setAttribute("data-testid", "model-selector-dropdown")
        b.setAttribute("aria-haspopup", "dialog")
        if (!b.getAttribute("aria-expanded")) {
          b.setAttribute("aria-expanded", "false")
        }

        const ok = (b.getAttribute("data-ms-model-btn") ?? "").trim() === "1"

        if (ok) {
          return
        }

        b.setAttribute("data-ms-model-btn", "1")
        b.className =
          "flex h-8 pt-[7px] pr-1.5 pb-[7px] pl-2 justify-center items-center gap-1 rounded-[8px] clickable hover:bg-[var(--fill-tsp-white-main)]"
        b.innerHTML =
          `<span data-ms-model-label="1" class="text-[var(--text-primary)] text-[18px] font-[500] leading-[22px]">${label}</span>` +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 25" fill="none" width="16" height="16" color="var(--text-tertiary)" class="rotate-[90deg]"><path d="M10.1992 18.6367L16.1992 12.6367L10.1992 6.63672" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>'
      }

      if (btn) {
        btns.filter((b) => b !== btn).forEach((b) => b.remove())
        setBtn(btn)
      }

      const p = btn?.parentElement ?? null
      const host = p && (p.getAttribute("data-ms-model-wrap") ?? "").trim() === "1" ? p : null

      if (host && anchor.nextElementSibling !== host) {
        anchor.insertAdjacentElement("afterend", host)
      }

      if (btn && !host) {
        const div = doc.createElement("div")
        div.className = "relative z-20 overflow-hidden items-center flex-shrink-0 flex"
        div.setAttribute("data-ms-model-wrap", "1")
        div.appendChild(btn)
        anchor.insertAdjacentElement("afterend", div)
      }

      if (!btn) {
        const div = doc.createElement("div")
        div.className = "relative z-20 overflow-hidden items-center flex-shrink-0 flex"
        div.setAttribute("data-ms-model-wrap", "1")
        const b = doc.createElement("button")
        setBtn(b)
        div.appendChild(b)
        anchor.insertAdjacentElement("afterend", div)
      }
    }

    if (!plus) {
      return false
    }

    return true
  }

  set()

  const kid = "data-ms-chatbox-init"
  const on = doc.documentElement.getAttribute(kid) === "1"

  if (on) {
    return
  }

  doc.documentElement.setAttribute(kid, "1")

  var rid = 0
  var n = 0
  var mo: MutationObserver | null = null

  const stopLoop = () => {
    if (rid) {
      win.cancelAnimationFrame(rid)
      rid = 0
    }
  }

  const step = () => {
    rid = 0
    n++

    const ok = set()

    if (ok) {
      n = 0
      return
    }

    if (n > 2400) {
      stopLoop()
      return
    }

    rid = win.requestAnimationFrame(step)
  }

  if (typeof MutationObserver !== "undefined") {
    mo = new MutationObserver(() => {
      if (rid) {
        return
      }

      rid = win.requestAnimationFrame(step)
    })

    mo.observe(doc.documentElement, { subtree: true, childList: true, attributes: true })
    sr && mo.observe(sr, { subtree: true, childList: true, attributes: true })
  }

  rid = win.requestAnimationFrame(step)
}
