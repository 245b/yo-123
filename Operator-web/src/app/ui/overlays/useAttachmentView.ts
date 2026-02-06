import { useEffect } from "react"
import type { DraftFile } from "../../lib/store"
import { openAttachmentViewer } from "./attachmentViewer"

type Set<T> = (v: T | ((p: T) => T)) => void

type At = DraftFile
type W = Window & typeof globalThis

type ViewDeps = {
  ia: { current: HTMLIFrameElement | null }
  at: At[]
  setAt: Set<At[]>
  ur: { current: Record<string, string> }
  wr: { current: W | null }
}

const filePng = new URL("../../../../file.png", import.meta.url).href

export const useAttachmentView = (d: ViewDeps) => {
  useEffect(() => {
    const at = d.at
    const ur = d.ur
    const wr = d.wr
    const setAt = d.setAt
    const set = () => {
      const fr0 = d.ia.current ?? window.document.querySelector('iframe[data-kind="snapshot"]') ?? null
      const fr = fr0 instanceof HTMLIFrameElement ? fr0 : null
      const doc = fr?.contentDocument ?? null

      if (!doc) {
        return false
      }

      const win0 = doc.defaultView ?? null
      const win = win0 as W | null

      if (wr.current !== win) {
        const w = wr.current
        const m = ur.current
        wr.current = win
        ur.current = {}

        if (w) {
          const ks = Object.keys(m)

          for (var i = 0; i < ks.length; i++) {
            const k = ks[i] ?? ""
            const u = m[k] ?? ""

            if (!u) {
              continue
            }

            w.URL.revokeObjectURL(u)
          }
        }
      }

      const sr = doc.querySelector("browser-mcp-container")?.shadowRoot ?? null
      const root0 = doc.getElementById("chat-home-view-container") ?? sr?.querySelector("#chat-home-view-container") ?? null
      const root = root0 ? (root0 as HTMLElement) : null
      const q = root ?? doc

      var box: Element | null = doc.querySelector('[data-ms-chatbox="1"]') ?? sr?.querySelector('[data-ms-chatbox="1"]') ?? null

      if (!box) {
        const row = q.querySelector("div.px-3.flex.gap-2.item-center, div.px-3.flex.gap-2.items-center") ?? null
        box = row?.closest?.('div.rounded-\\[22px\\], div.rounded-\\[24px\\], form') ?? null
      }

      if (!box) {
        return false
      }

      const has = at.length > 0

      if (win) {
        const need: Record<string, 1> = {}

        for (var i = 0; i < at.length; i++) {
          const it = at[i]

          if (!it) {
            continue
          }

          need[it.id] = 1

          const ok = ur.current[it.id] ?? ""

          if (ok) {
            continue
          }

          ur.current[it.id] = win.URL.createObjectURL(it.file)
        }

        const ks = Object.keys(ur.current)

        for (var i = 0; i < ks.length; i++) {
          const k = ks[i] ?? ""

          if (need[k]) {
            continue
          }

          const u = ur.current[k] ?? ""

          if (u) {
            win.URL.revokeObjectURL(u)
          }

          delete ur.current[k]
        }
      }

      const id = "__ms_att"
      const r0 = box.getRootNode?.() ?? doc
      const nt = (r0 as Node).nodeType
      const r = nt === 9 || nt === 11 ? (r0 as Document | ShadowRoot) : doc
      const host1 = r.querySelector<HTMLDivElement>(`#${id}`) ?? null

      if (!has) {
        host1?.remove()
        return true
      }

      const host = host1 ?? doc.createElement("div")
      host.id = id
      host.className = "w-full relative rounded-md overflow-hidden flex-shrink-0 pb-3 -mb-3"

      if (!host1) {
        const ta = box.querySelector<HTMLTextAreaElement>("textarea") ?? null

        if (ta) {
          ta.insertAdjacentElement("beforebegin", host)
        }

        if (!ta) {
          const row = box.querySelector("div.px-3.flex.gap-2.item-center, div.px-3.flex.gap-2.items-center") ?? null

          if (row) {
            row.insertAdjacentElement("beforebegin", host)
          }

          if (!row) {
            box.insertAdjacentElement("afterbegin", host)
          }
        }
      }

      host.textContent = ""

      const sc = doc.createElement("div")
      sc.id = "__ms_att_sc"
      sc.className = "w-full h-full overflow-y-hidden overflow-x-auto scrollbar-hide pb-[10px] -mb-[10px] pl-[10px] pr-2 flex"
      sc.style.setProperty("scrollbar-width", "none")
      sc.style.setProperty("-ms-overflow-style", "none")

      const list = doc.createElement("div")
      list.className = "flex gap-3"
      sc.appendChild(list)

      for (var i = 0; i < at.length; i++) {
        const it = at[i]

        if (!it) {
          continue
        }

        const url = ur.current[it.id] ?? ""

        const item = doc.createElement("div")
        item.className =
          "rounded-[12px] h-[54px] w-[54px] border border-[var(--border-main)] group/attach relative flex justify-center items-center flex-shrink-0 cursor-pointer"
        item.setAttribute("data-ms-att-open", "1")
        item.setAttribute("data-ms-att-id", it.id)
        item.setAttribute("data-ms-att-url", url)
        item.setAttribute("data-ms-att-name", it.name)
        item.setAttribute("data-ms-att-type", it.type)

        const img = it.type.startsWith("image/")

        if (img && url) {
          const el = doc.createElement("img")
          el.className =
            "max-h-full max-w-full object-cover w-full h-full border border-[var(--border-light)] rounded-[12px]"
          el.alt = it.name
          el.src = url
          item.appendChild(el)
        }

        if (!img || !url) {
          const el = doc.createElement("img")
          el.className =
            "max-h-full max-w-full object-contain w-full h-full border border-[var(--border-light)] rounded-[12px]"
          el.alt = it.name || "file"
          el.src = filePng
          item.appendChild(el)
        }

        const btn = doc.createElement("button")
        btn.type = "button"
        btn.setAttribute("data-ms-att-x", "1")
        btn.setAttribute("data-ms-att-id", it.id)
        btn.className =
          "hidden touch-device:flex group-hover/attach:flex rounded-full p-[2px] bg-[var(--icon-tertiary)] transition-all duration-200 hover:opacity-85 absolute right-1 top-1"
        btn.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x text-white" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>'
        item.appendChild(btn)

        list.appendChild(item)
      }

      host.appendChild(sc)

      const ok = doc.documentElement.getAttribute("data-ms-att") === "1"

      if (ok) {
        return true
      }

      doc.documentElement.setAttribute("data-ms-att", "1")

      const fn = (ev: Event) => {
        const t = ev.target as { closest?: (s: string) => Element | null } | null
        const b0 = t?.closest?.('button[data-ms-att-x="1"]') ?? null
        const b = b0 ? (b0 as HTMLButtonElement) : null

        if (!b) {
          const el0 = t?.closest?.('[data-ms-att-open="1"]') ?? null
          const el = el0 ? (el0 as HTMLElement) : null

          if (!el) {
            return
          }

          const url0 = el.getAttribute("data-ms-att-url") ?? ""
          const url = url0.trim()

          if (!url) {
            return
          }

          const tp0 = el.getAttribute("data-ms-att-type") ?? ""

          if (!tp0.startsWith("image/")) {
            return
          }

          const nm0 = el.getAttribute("data-ms-att-name") ?? ""
          const nm = nm0.trim()

          ev.preventDefault()
          ev.stopPropagation()

          const root = el.ownerDocument
          const r0 = el.getRootNode?.() ?? root
          const nt = (r0 as Node).nodeType
          const sr = nt === 11 ? (r0 as ShadowRoot) : null
          openAttachmentViewer({ root, sr, url, name: nm })

          return
        }
        const id0 = b.getAttribute("data-ms-att-id") ?? ""
        const id = id0.trim()

        if (!id) {
          return
        }

        ev.preventDefault()
        ev.stopPropagation()

        setAt((xs) => {
          const it = xs.find((x) => x.id === id) ?? null

          if (!it) {
            return xs
          }

          const root = b.ownerDocument
          const r0 = b.getRootNode?.() ?? root
          const nt = (r0 as Node).nodeType
          const sr = nt === 11 ? (r0 as ShadowRoot) : null
          const q = sr ?? root
          const v = q.querySelector<HTMLImageElement>("#__ms_view img[data-ms-view-img]") ?? null
          const u = ur.current[id] ?? ""

          if (u && v?.src === u) {
            v.closest("#__ms_view")?.remove()
          }

          if (u && wr.current) {
            wr.current.URL.revokeObjectURL(u)
            delete ur.current[id]
          }

          return xs.filter((x) => x.id !== id)
        })
      }

      doc.addEventListener("pointerdown", fn, true)
      sr?.addEventListener("pointerdown", fn, true)
      return true
    }

    const ok = set()

    if (ok) {
      return
    }

    if (!at.length) {
      return
    }

    var rid = 0
    var n = 0

    const step = () => {
      rid = 0
      n++

      const ok = set()

      if (ok) {
        return
      }

      if (n > 900) {
        return
      }

      rid = window.requestAnimationFrame(step)
    }

    step()

    return () => {
      if (!rid) {
        return
      }

      window.cancelAnimationFrame(rid)
    }
  }, [d.at, d.ia])
}
