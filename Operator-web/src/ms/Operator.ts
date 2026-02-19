import type { Mid } from "./types"

const list = [
  {
    id: "operator-1-5-lite",
    label: "Operator 1.5 Lite",
    name: "Operator 1.5 Lite",
    desc: "A lightweight agent for everyday tasks.",
    badge: "",
  },
  {
    id: "operator-1-7-pro",
    label: "Operator 1.7 Pro",
    name: "Operator 1.7",
    desc: "High-performance agent designed for complex tasks.",
    badge: "Pro",
  },
]

const def = list[0]?.id ?? "operator-1-5-lite"
const modelSel =
  '[data-testid="model-selector-dropdown"], [data-ms-model-btn="1"], [aria-haspopup="dialog"][aria-expanded]'

const pickModelBtn = (doc: Document) => {
  const xs = Array.from(doc.querySelectorAll<HTMLElement>(modelSel))

  for (var i = 0; i < xs.length; i++) {
    const x = xs[i]

    if (!x) {
      continue
    }

    const id = (x.getAttribute("data-testid") ?? "").trim()

    if (id === "model-selector-dropdown") {
      return x
    }

    const ms = (x.getAttribute("data-ms-model-btn") ?? "").trim()

    if (ms === "1") {
      return x
    }

    const t0 = x.textContent ?? ""
    const t = t0.trim().toLowerCase()

    if (t.startsWith("operator")) {
      return x
    }
  }

  return null
}

const pick = (raw: string) => {
  const t = raw.trim()

  for (var i = 0; i < list.length; i++) {
    const it = list[i]

    if (!it) {
      continue
    }

    if (it.id === t) {
      return it
    }

    if (it.label === t) {
      return it
    }
  }

  return list[0] ?? {
    id: def,
    label: "Operator 1.5 Lite",
    name: "Operator 1.5 Lite",
    desc: "A lightweight agent for everyday tasks.",
    badge: "",
  }
}

export const Operator = (doc: Document, win: Window, o: Mid) => {
  const pad = o.pad
  const body = doc.body

  const mn0 = doc.getElementById("__ms_operator")
  const mn = mn0?.tagName === "DIV" ? (mn0 as HTMLDivElement) : null
  const mode0 = doc.documentElement.getAttribute("data-ms-mode") ?? ""
  const pick0 = pick(mode0)
  const mode1 = pick0.id

  if (mode1 !== mode0.trim()) {
    doc.documentElement.setAttribute("data-ms-mode", mode1)
  }

  if (!mn && body) {
    const div = doc.createElement("div")
    div.id = "__ms_operator"
    div.setAttribute("data-open", "0")
    div.setAttribute("role", "dialog")
    div.setAttribute("data-placement", "bottom-start")
    div.setAttribute("tabindex", "-1")
    div.className = "min-w-max inline-block"

    const mk = (it: (typeof list)[number], on: boolean) => {
      const badge = it.badge
        ? `<div class="rounded-[5px] bg-[var(--fill-blue)] inline-flex items-center justify-center text-[var(--text-blue)] text-xs font-[700] font-serif py-[1px] px-[6px]">${it.badge}</div>`
        : ""
      const active = on ? ' data-active="1"' : ""

      return (
        `<button type="button" data-ms-item="${it.id}"${active} class="w-full flex p-[8px] ps-[12px] gap-4 rounded-[8px] clickable hover:bg-[var(--fill-tsp-white-light)]">` +
        `<div class="flex flex-col items-start flex-[5]">` +
        `<div class="text-[var(--text-primary)] text-sm flex gap-[4px] items-center">${it.name}${badge}</div>` +
        `<p class="text-[var(--text-tertiary)] text-xs">${it.desc}</p>` +
        `</div>` +
        `<div class="flex justify-end items-center pr-[8px] flex-1">` +
        `<svg width="18" height="18" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="ms_ck" color="var(--icon-primary)"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.8081 3.57564C14.0424 3.80995 14.0424 4.18985 13.8081 4.42417L6.47478 11.7575C6.24047 11.9918 5.86057 11.9918 5.62626 11.7575L2.29292 8.42417C2.05861 8.18985 2.05861 7.80995 2.29292 7.57564C2.52724 7.34132 2.90714 7.34132 3.14145 7.57564L6.05052 10.4847L12.9596 3.57564C13.1939 3.34132 13.5738 3.34132 13.8081 3.57564Z" fill="currentColor"></path></svg>` +
        `</div>` +
        `</button>`
      )
    }

    const items = list.map((it) => mk(it, it.id === mode1)).join("")
    div.innerHTML =
      '<div class="p-[4px] bg-[var(--background-menu-white)] shadow-[0_4px_11px_0px_var(--shadow-S)] backdrop-blur-[40px] flex flex-col justify-start items-start gap-1 border border-[var(--border-dark)] dark:border-[var(--border-light)] rounded-[12px] w-[334px]">' +
      '<div class="self-stretch flex flex-col justify-start items-start">' +
      items +
      "</div></div>"
    body.appendChild(div)
  }

  const mode = doc.documentElement.getAttribute("data-ms-mode") ?? def
  const pick1 = pick(mode)
  const label = pick1.label
  const m0 = pickModelBtn(doc)
  const txt = m0?.querySelector<HTMLElement>('[data-ms-model-label="1"]') ?? null

  if (txt && txt.textContent !== label) {
    txt.textContent = label
  }

  const ok = doc.documentElement.getAttribute("data-ms-operator") === "1"

  if (!ok) {
    doc.documentElement.setAttribute("data-ms-operator", "1")

    var rid = 0
    var btn: HTMLElement | null = null

    const stop = () => {
      if (!rid) {
        return
      }

      win.cancelAnimationFrame(rid)
      rid = 0
    }

    const step = () => {
      rid = 0

      const mn0 = doc.getElementById("__ms_operator")
      const mn = mn0?.tagName === "DIV" ? (mn0 as HTMLDivElement) : null

      if (!mn) {
        return
      }

      const on = mn.getAttribute("data-open") === "1"

      if (!on) {
        return
      }

      const ok = btn && doc.documentElement.contains(btn)
      const ms = ok ? btn : pickModelBtn(doc)

      if (!ms) {
        rid = win.requestAnimationFrame(step)
        return
      }

      btn = ms
      const r = ms.getBoundingClientRect?.()

      if (!r) {
        rid = win.requestAnimationFrame(step)
        return
      }

      const x0 = Math.round(r.right)
      const y = Math.round(r.bottom + 8)
      mn.style.left = `${x0}px`
      mn.style.top = `${y}px`

      const side0 = doc.documentElement.getAttribute("data-ms-side") === "1"

      const w0 = Number.parseInt(doc.documentElement.getAttribute("data-ms-w") ?? "", 10)
      const bw = Number.isFinite(w0) ? w0 : 0
      const tight = Math.round(win.innerWidth - pad) <= Math.round(bw + pad)
      const side = side0 && !tight

      if (!side) {
        mn.style.removeProperty("transform")
        mn.style.removeProperty("transform-origin")
        mn.style.removeProperty("animation")
        rid = win.requestAnimationFrame(step)
        return
      }
      const mw = mn.offsetWidth
      const need = x0 - mw < bw + pad

      if (!need) {
        mn.style.removeProperty("transform")
        mn.style.removeProperty("transform-origin")
        mn.style.removeProperty("animation")
        rid = win.requestAnimationFrame(step)
        return
      }

      const xl = Math.round(r.left)
      const x = Math.max(xl, bw + pad)
      mn.style.transform = "translateX(0)"
      mn.style.transformOrigin = "0 0"
      mn.style.animation = "none"
      mn.style.left = `${x}px`
      rid = win.requestAnimationFrame(step)
    }

    const fn = (ev: Event) => {
      const t = ev.target as { closest?: (s: string) => Element | null } | null
      const mn0 = doc.getElementById("__ms_operator")
      const mn = mn0?.tagName === "DIV" ? (mn0 as HTMLDivElement) : null

      if (!mn) {
        return
      }

      const on = mn.getAttribute("data-open") === "1"
      const it = t?.closest?.("#__ms_operator [data-ms-item]") ?? null
      const ms0 = t?.closest?.(modelSel) ?? null
      const ms = ms0 instanceof HTMLElement ? ms0 : null
      const in0 = t?.closest?.("#__ms_operator") ?? null

      if (it) {
        const v = it.getAttribute("data-ms-item") ?? ""

        if (!v) {
          return
        }

        const pick2 = pick(v)
        doc.documentElement.setAttribute("data-ms-mode", pick2.id)
        const label = pick2.label
        const m0 = pickModelBtn(doc)
        const txt = m0?.querySelector<HTMLElement>('[data-ms-model-label="1"]') ?? null

        if (txt && txt.textContent !== label) {
          txt.textContent = label
        }

        mn.querySelectorAll("button[data-ms-item]").forEach((b) => {
          const x = b.getAttribute("data-ms-item") ?? ""
          b.removeAttribute("data-active")

          if (x === pick2.id) {
            b.setAttribute("data-active", "1")
          }
        })

        mn.setAttribute("data-open", "0")
        m0?.setAttribute("aria-expanded", "false")
        stop()
        ev.preventDefault()
        ev.stopPropagation()
        return
      }

      if (ms) {
        const mode0 = doc.documentElement.getAttribute("data-ms-mode") ?? def
        const pick3 = pick(mode0)
        doc.documentElement.setAttribute("data-ms-mode", pick3.id)

        mn.querySelectorAll("button[data-ms-item]").forEach((b) => {
          const x = b.getAttribute("data-ms-item") ?? ""
          b.removeAttribute("data-active")

          if (x === pick3.id) {
            b.setAttribute("data-active", "1")
          }
        })

        if (on) {
          mn.setAttribute("data-open", "0")
          ms.setAttribute("aria-expanded", "false")
          stop()
          ev.preventDefault()
          ev.stopPropagation()
          return
        }

        mn.setAttribute("data-open", "1")
        ms.setAttribute("aria-expanded", "true")
        btn = ms
        stop()
        step()
        ev.preventDefault()
        ev.stopPropagation()
        return
      }

      if (in0) {
        return
      }

      if (on) {
        mn.setAttribute("data-open", "0")
        btn?.setAttribute("aria-expanded", "false")
        stop()
      }
    }

    doc.addEventListener("pointerdown", fn, true)
  }

}

