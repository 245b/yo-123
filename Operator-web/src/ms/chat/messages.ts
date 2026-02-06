import { copySvg, copyTxt } from "./constants"
import type { Att } from "./types"

export type MessagesApi = {
  add: (
    ta: HTMLTextAreaElement | null,
    role: "user" | "assistant",
    txt: string,
    err?: boolean,
    pending?: boolean,
    atts?: Att[],
  ) => HTMLElement | null
  mark: (el: HTMLElement, txt: string) => void
  copyButton: () => HTMLDivElement
  handleCopyEvent: (ev: Event) => void
}

export const setupMessages = (
  doc: Document,
  win: Window,
  host: (ta?: HTMLTextAreaElement | null) => HTMLDivElement | null,
): MessagesApi => {
  const doCopy = (d: HTMLElement, v: string) => {
    d.setAttribute("data-ms-copied", "1")
    d.innerHTML = copyTxt
    d.style.width = "auto"
    d.style.paddingLeft = "10px"
    d.style.paddingRight = "10px"
    const tp0 = d.getAttribute("data-ms-copy-style") ?? ""
    const tp = tp0.trim()
    const bar = tp === "toolbar"
    const svg = bar
      ? `<span class="flex items-center justify-center touch:w-10 h-8 w-8">${copySvg}</span>`
      : copySvg

    if (bar) {
      d.style.display = "flex"
      d.style.alignItems = "center"
      d.style.justifyContent = "center"
      d.style.height = "32px"
    }

    win.setTimeout(() => {
      d.removeAttribute("data-ms-copied")
      d.innerHTML = svg
      d.style.removeProperty("width")
      d.style.removeProperty("padding-left")
      d.style.removeProperty("padding-right")

      if (bar) {
        d.style.removeProperty("display")
        d.style.removeProperty("align-items")
        d.style.removeProperty("justify-content")
        d.style.removeProperty("height")
      }
    }, 2000)

    const nav = win.navigator as { clipboard?: { writeText?: (s: string) => Promise<void> } } | null
    const cb = nav?.clipboard ?? null
    const wt = cb?.writeText

    if (typeof wt === "function") {
      wt.call(cb, v).catch(() => {})
      return
    }
  }

  const copyButton = () => {
    const div = doc.createElement("div")
    div.className =
      "flex h-7 w-7 items-center justify-center cursor-pointer rounded-md hover:bg-[var(--fill-tsp-gray-main)]"
    div.setAttribute("role", "button")
    div.setAttribute("aria-label", "Copy")
    div.setAttribute("data-ms-copy", "1")
    div.innerHTML = copySvg

    const run = (ev: Event) => {
      const b0 = (ev as PointerEvent).button
      const ok = typeof b0 !== "number" || b0 === 0

      if (!ok) {
        return
      }

      const cop = (div.getAttribute("data-ms-copied") ?? "").trim()

      if (cop === "1") {
        return
      }

      const row0 = div.closest('[data-ms-row="1"]') ?? null
      const row = row0 && (row0 as Node).nodeType === 1 ? (row0 as HTMLElement) : null
      const msg0 = row?.querySelector('[data-ms-msg="1"]') ?? null
      const msg = msg0 && (msg0 as Node).nodeType === 1 ? (msg0 as HTMLElement) : null
      const v0 = msg?.textContent ?? ""
      const v = v0.trim()

      if (!v) {
        return
      }

      ev.preventDefault()
      ev.stopPropagation()
      doCopy(div, v)
    }

    div.addEventListener("pointerdown", run, true)
    div.addEventListener("click", run, true)
    return div
  }

  const bar = () => {
    const row = doc.createElement("div")
    row.className = "flex items-center justify-start gap-[2px] overflow-hidden invisible group-hover:visible"

    const copy = doc.createElement("button")
    copy.type = "button"
    copy.className = "text-token-text-secondary hover:bg-token-bg-secondary rounded-lg relative group"
    copy.setAttribute("aria-label", "Copy")
    copy.setAttribute("aria-pressed", "false")
    copy.setAttribute("data-testid", "copy-turn-action-button")
    copy.setAttribute("data-state", "closed")
    copy.innerHTML =
      `<span class="flex items-center justify-center touch:w-10 h-8 w-8" style="transform: translateX(-12%);">${copySvg}</span><span class="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[12px] text-[var(--text-primary)] bg-[var(--fill-tsp-gray-main)] px-2 py-1 rounded-md whitespace-nowrap">Copy</span>`
    copy.setAttribute("data-ms-copy", "1")
    copy.setAttribute("data-ms-copy-style", "toolbar")

    const next = doc.createElement("button")
    next.type = "button"
    next.className = "text-token-text-secondary hover:bg-token-bg-secondary rounded-lg"
    next.setAttribute("aria-label", "Action")
    next.setAttribute("aria-pressed", "false")
    next.setAttribute("data-state", "closed")
    next.innerHTML =
      '<span class="flex items-center justify-center touch:w-10 h-8 w-8"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon"><use href="/cdn/assets/sprites-core-k5zux585.svg#ce3544" fill="currentColor"></use></svg></span>'

    row.appendChild(copy)
    row.appendChild(next)
    return row
  }

  const mark = (el: HTMLElement, txt: string) => {
    const raw0 = typeof txt === "string" ? txt : ""
    const raw = raw0
    el.textContent = ""

    if (!raw) {
      return
    }

    const frag = doc.createDocumentFragment()
    var i = 0

    for (;;) {
      const j = raw.indexOf("**", i)

      if (j < 0) {
        if (i < raw.length) {
          frag.appendChild(doc.createTextNode(raw.slice(i)))
        }
        break
      }

      if (j > i) {
        frag.appendChild(doc.createTextNode(raw.slice(i, j)))
      }

      const k = raw.indexOf("**", j + 2)

      if (k < 0) {
        frag.appendChild(doc.createTextNode(raw.slice(j)))
        break
      }

      const seg = raw.slice(j + 2, k)

      if (seg) {
        const span = doc.createElement("span")
        span.className = "ms-strong"
        span.textContent = seg
        frag.appendChild(span)
      }

      i = k + 2
    }

    el.appendChild(frag)
  }

  const add = (
    ta: HTMLTextAreaElement | null,
    role: "user" | "assistant",
    txt: string,
    err?: boolean,
    pending?: boolean,
    atts?: Att[],
  ) => {
    const h = host(ta)

    if (!h) {
      return null
    }

    const list0 = h.querySelector("#__ms_ds_list") ?? null
    const list = list0?.tagName === "DIV" ? (list0 as HTMLDivElement) : null

    if (!list) {
      return null
    }

    if (role === "user") {
      const row = doc.createElement("div")
      row.className = "flex w-full max-w-[768px] mx-auto px-5 flex-col items-end justify-end group"
      row.setAttribute("data-ms-user", "1")
      row.setAttribute("data-ms-row", "1")

      const w = doc.createElement("div")
      w.className = "flex flex-col items-end max-w-[90%]"

      const ww = doc.createElement("div")
      ww.className = "flex relative flex-col gap-2 items-end"

      var out: HTMLElement | null = null
      const t0 = txt ?? ""
      const t1 = t0.trim()
      const a0 = Array.isArray(atts) ? atts : []
      const a1 = a0.filter((it) => {
        const u0 = it?.url ?? ""
        const u = u0.trim()
        return !!u
      })
      const has = a1.length > 0

      if (t1) {
        const b = doc.createElement("div")
        b.className =
          "relative flex items-center rounded-[12px] overflow-hidden bg-[var(--fill-white)] dark:bg-[var(--fill-tsp-white-main)] p-3 ltr:rounded-br-none rtl:rounded-bl-none border border-[var(--border-main)] dark:border-0"

        const k = doc.createElement("div")
        k.className = "transition-all duration-300"

        const t = doc.createElement("span")
        t.className = "text-[var(--text-primary)] u-break-words whitespace-pre-wrap"
        t.textContent = txt
        t.setAttribute("data-ms-msg", "1")

        out = t
        k.appendChild(t)
        b.appendChild(k)
        ww.appendChild(b)
      }

      if (has) {
        const wrap = doc.createElement("div")
        wrap.className = "w-full flex flex-col flex-wrap gap-2 justify-start items-end"

        const row1 = doc.createElement("div")
        row1.className = "justify-end flex flex-wrap flex-row gap-2"

        for (var i = 0; i < a1.length; i++) {
          const it = a1[i]

          if (!it) {
            continue
          }

          const url = it.url ?? ""

          if (!url) {
            continue
          }

          const item = doc.createElement("div")
          item.className = "relative inline-flex max-w-[calc(min(100%,400px))] group/image"

          const img = doc.createElement("img")
          img.className =
            "rounded-lg overflow-hidden border border-[var(--border-light)] object-cover min-w-[80px] min-h-[80px] select-none max-h-[400px] max-w-[calc(min(100%,540px))] cursor-pointer"
          img.alt = it.name ?? "image"
          img.draggable = false
          img.src = url
          img.setAttribute("data-ms-obj-url", url)

          const btn = doc.createElement("button")
          btn.type = "button"
          btn.className =
            "flex items-center justify-center absolute bottom-[8px] right-[8px] opacity-0 group-hover/image:opacity-100 transition-opacity size-[32px] rounded-[8px] clickable bg-[var(--background-mask-black)] hover:!opacity-85"
          btn.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" width="20" height="20" color="var(--text-white)"><path d="M3.45734 8.8606C3.98122 8.58202 4.57636 8.46514 5.16672 8.52455C5.75702 8.584 6.31637 8.8171 6.77418 9.19445C7.23199 9.57182 7.56761 10.0763 7.73864 10.6444C7.90965 11.2125 7.90844 11.8185 7.73506 12.3859C7.56163 12.9533 7.22383 13.4566 6.76445 13.832C6.30502 14.2074 5.74454 14.4384 5.15398 14.4954L2.8314 14.7191C2.56897 14.7447 2.30486 14.6918 2.07245 14.5672C1.83971 14.4425 1.64913 14.2514 1.52509 14.0182C1.4011 13.7852 1.34936 13.5202 1.37593 13.2576C1.40182 13.0023 1.50129 12.7606 1.66129 12.5603C1.82874 12.3431 1.90648 12.0699 1.8801 11.7969C1.82321 11.2063 1.9424 10.6121 2.22315 10.0894C2.50391 9.56685 2.93359 9.13919 3.45734 8.8606ZM3.21569 11.7833C3.24359 12.3549 3.06713 12.9192 2.71623 13.3744C2.71163 13.3803 2.70702 13.3863 2.70223 13.3921L5.02611 13.1682C5.35412 13.1365 5.66552 13.0086 5.92071 12.8001C6.17592 12.5915 6.3637 12.3118 6.46008 11.9966C6.55641 11.6815 6.55728 11.3446 6.46235 11.029C6.36734 10.7134 6.18056 10.4329 5.92622 10.2232C5.67186 10.0136 5.36085 9.8838 5.03287 9.85079C4.70496 9.81783 4.37452 9.88301 4.08354 10.0377C3.79255 10.1925 3.5538 10.4302 3.39781 10.7206C3.24189 11.0109 3.17569 11.341 3.20729 11.669L3.21569 11.7833Z" fill="currentColor"></path><path d="M13.3477 1.27466C13.8492 1.27466 14.3305 1.47412 14.685 1.82869C15.0393 2.18324 15.2384 2.66401 15.2384 3.16528C15.2384 3.66655 15.0393 4.14733 14.685 4.50187L7.33407 11.8515L6.43954 10.8606L13.7416 3.55916C13.8461 3.45466 13.905 3.31311 13.905 3.16528C13.905 3.01746 13.8461 2.87591 13.7416 2.7714C13.6371 2.6669 13.4955 2.60799 13.3477 2.60799C13.2001 2.60803 13.0583 2.66694 12.9539 2.7714L5.6928 10.0325L4.79957 9.04093L12.0112 1.82869C12.3656 1.47416 12.8464 1.2747 13.3477 1.27466Z" fill="currentColor"></path><path d="M12.2603 11.0332L12.6816 12.1715L13.8199 12.5927L12.6816 13.014L12.2603 14.1523L11.8391 13.014L10.7008 12.5927L11.8391 12.1715L12.2603 11.0332Z" fill="currentColor" stroke="currentColor" stroke-width="0.8316" stroke-linecap="round" stroke-linejoin="round"></path><path d="M4.19513 1.27466L4.82098 2.966L6.51233 3.59186L4.82098 4.21771L4.19513 5.90906L3.56928 4.21771L1.87793 3.59186L3.56928 2.966L4.19513 1.27466Z" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"></path></svg>'

          item.appendChild(img)
          item.appendChild(btn)
          row1.appendChild(item)
        }

        wrap.appendChild(row1)
        ww.appendChild(wrap)
      }

      w.appendChild(ww)

      const tools = doc.createElement("div")
      tools.className = "flex items-center justify-end gap-[2px] overflow-hidden invisible group-hover:visible"
      tools.appendChild(copyButton())
      w.appendChild(tools)

      row.appendChild(w)
      list.appendChild(row)
      list.scrollTop = list.scrollHeight
      return out
    }

    if (role === "assistant") {
      const row = doc.createElement("div")
      row.className = "flex w-full max-w-[768px] mx-auto px-5 flex-col gap-2 group group/turn-messages mt-3"
      row.setAttribute("data-ms-row", "1")

      const top = doc.createElement("div")
      top.className = "flex items-center justify-between h-[26px] group"

      const left = doc.createElement("div")
      left.className = "flex items-center gap-[6px] -ms-[2px]"

      const name = doc.createElement("span")
      name.className = "text-[var(--text-tertiary)] text-sm leading-[22px]"
      name.textContent = "Operator 1.5 Lite"

      left.appendChild(name)
      top.appendChild(left)
      row.appendChild(top)

      const md = doc.createElement("div")
      md.className =
        "max-w-none p-0 m-0 text-[16px] leading-[1.5] text-[var(--text-primary)] manus-markdown"
      md.setAttribute("dir", "auto")

      const a = doc.createElement("div")
      a.className = "my-[1px]"

      const t = doc.createElement("div")
      t.className = "py-[3px] whitespace-pre-wrap u-break-words"
      t.setAttribute("data-ms-msg", "1")
      mark(t, txt)

      if (err) {
        t.setAttribute("data-err", "1")
      }

      if (pending) {
        t.setAttribute("data-pending", "1")
      }

      a.appendChild(t)
      const wrap = doc.createElement("div")
      wrap.className = "flex flex-col items-start"
      wrap.setAttribute("data-ms-wrap", "1")
      wrap.appendChild(a)

      const tools = bar()
      tools.setAttribute("data-ms-tools", "1")
      wrap.appendChild(tools)
      md.appendChild(wrap)
      row.appendChild(md)

      list.appendChild(row)
      list.scrollTop = list.scrollHeight
      return t
    }

    list.scrollTop = list.scrollHeight
    return null
  }

  const handleCopyEvent = (ev: Event) => {
    const b0 = (ev as PointerEvent).button
    const ok = typeof b0 !== "number" || b0 === 0

    if (!ok) {
      return
    }

    const path = (ev as PointerEvent).composedPath?.() ?? []
    var div: HTMLElement | null = null

    for (var i = 0; i < path.length; i++) {
      const n = path[i]
      const el = n as { getAttribute?: (s: string) => string | null } | null
      const v = el?.getAttribute?.("data-ms-copy") ?? ""

      if (v !== "1") {
        continue
      }

      div = n as unknown as HTMLElement
      break
    }

    if (!div) {
      const t = ev.target as { closest?: (s: string) => Element | null } | null
      const d0 = t?.closest?.('[data-ms-copy="1"]') ?? null
      div = d0 && (d0 as Node).nodeType === 1 ? (d0 as HTMLElement) : null
    }

    if (!div) {
      return
    }

    const d = div
    const cop = (d.getAttribute("data-ms-copied") ?? "").trim()

    if (cop === "1") {
      return
    }

    const row0 = d.closest('[data-ms-row="1"]') ?? null
    const row = row0 && (row0 as Node).nodeType === 1 ? (row0 as HTMLElement) : null
    const msg0 = row?.querySelector('[data-ms-msg="1"]') ?? null
    const msg = msg0 && (msg0 as Node).nodeType === 1 ? (msg0 as HTMLElement) : null
    const v0 = msg?.textContent ?? ""
    const v = v0.trim()

    if (!v) {
      return
    }

    ev.preventDefault()
    ev.stopPropagation()
    doCopy(d, v)
  }

  return { add, mark, copyButton, handleCopyEvent }
}
