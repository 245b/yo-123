export const createAutoGrow = (doc: Document, win: Window, sr: ShadowRoot | null) => {
  type St = { len: number; at: boolean; max: number }
  const st = new WeakMap<HTMLTextAreaElement, St>()
  const pd = new Set<HTMLTextAreaElement>()
  var raf = 0

  const px = (v: string): number | null => {
    const n = parseFloat((v ?? "").trim())
    return Number.isFinite(n) ? n : null
  }

  const stamp = (ta: HTMLTextAreaElement) => {
    const hk = "data-ms-h0"
    const hv = ta.getAttribute(hk) ?? ""

    if (hv) {
      return
    }

    const h0 = Math.round(ta.getBoundingClientRect().height)

    if (h0 > 0) {
      ta.setAttribute(hk, `${h0}`)
    }
  }

  const minH = (ta: HTMLTextAreaElement): number => {
    const hv = ta.getAttribute("data-ms-h0") ?? ""
    const h0 = px(hv)

    if (h0 && h0 > 0) {
      return Math.max(24, Math.round(h0))
    }

    return 44
  }

  const css = (el: Element, name: string): number | null => {
    const v0 = win.getComputedStyle(el).getPropertyValue(name) ?? ""
    const v = px(v0)

    if (!v) {
      return null
    }

    if (v <= 0) {
      return null
    }

    return v
  }

  const cfg = (ta: HTMLTextAreaElement): number => {
    const a0 = ta.getAttribute("data-ms-autogrow-max") ?? ""
    const a = px(a0)

    if (a && a > 0) {
      return a
    }

    const v0 = css(ta, "--chat-textarea-max-height")
    if (v0) {
      return v0
    }

    var el: Element | null = ta.parentElement
    while (el) {
      const v1 = css(el, "--chat-textarea-max-height")
      if (v1) {
        return v1
      }

      if (el === doc.documentElement) {
        break
      }

      el = el.parentElement
    }

    const v2 = css(doc.documentElement, "--chat-textarea-max-height")
    if (v2) {
      return v2
    }

    const mh0 = Math.round(win.innerHeight * 0.5)
    return Math.max(140, Math.min(640, mh0))
  }

  const anc = (ta: HTMLTextAreaElement): number | null => {
    var el: Element | null = ta.parentElement
    while (el && el !== doc.documentElement) {
      const cs = win.getComputedStyle(el)
      const mh0 = cs.maxHeight ?? ""

      if (mh0 && mh0 !== "none") {
        const mh = px(mh0)

        if (mh && mh > 0) {
          const pt = px(cs.paddingTop ?? "") ?? 0
          const pb = px(cs.paddingBottom ?? "") ?? 0
          var sh = 0
          const kids = el.children

          for (var i = 0; i < kids.length; i++) {
            const k = kids[i]

            if (k.contains(ta)) {
              continue
            }

            const h0 = (k as unknown as { offsetHeight?: number }).offsetHeight
            const h1 = typeof h0 === "number" ? h0 : NaN

            if (!Number.isFinite(h1)) {
              continue
            }

            sh += h1
          }

          const av = mh - pt - pb - sh

          if (av > 0) {
            return av
          }
        }
      }

      el = el.parentElement
    }

    return null
  }

  const g = win as unknown as typeof globalThis
  const RO = g.ResizeObserver
  const ro = RO
    ? new RO((es) => {
        for (var i = 0; i < es.length; i++) {
          const t0 = es[i]?.target ?? null
          const ta =
            (t0 as { tagName?: string } | null)?.tagName === "TEXTAREA" ? (t0 as HTMLTextAreaElement) : null

          if (!ta) {
            continue
          }

          go(ta, true)
        }
      })
    : null

  const un = (ta: HTMLTextAreaElement) => {
    st.delete(ta)
    pd.delete(ta)

    if (ro) {
      ro.unobserve(ta)
    }
  }

  const base = (ta: HTMLTextAreaElement) => {
    const v0 = ta.value ?? ""
    const v = v0.trim()

    if (v) {
      return
    }

    stamp(ta)
    const h = minH(ta)
    ta.style.setProperty("box-sizing", "border-box", "important")
    ta.style.setProperty("height", `${h}px`, "important")
    ta.style.setProperty("min-height", `${h}px`, "important")
    ta.style.setProperty("max-height", `${h}px`, "important")
    ta.style.setProperty("overflow-y", "hidden", "important")
    ta.style.setProperty("overflow-x", "hidden", "important")
  }

  const ms = (ta: HTMLTextAreaElement) => {
    if (!ta.isConnected) {
      un(ta)
      return
    }

    stamp(ta)

    if (ta.getAttribute("data-ms-ag") !== "1") {
      ta.setAttribute("data-ms-ag", "1")

      var w: HTMLElement | null = ta.parentElement
      while (w && w !== doc.body && w !== doc.documentElement) {
        const ok = w.classList.contains("overflow-y-auto")

        if (ok) {
          w.style.setProperty("overflow-y", "hidden", "important")
          break
        }

        w = w.parentElement
      }

      if (ro) {
        ro.observe(ta)
      }
    }

    const min = minH(ta)
    const c = cfg(ta)
    const a0 = anc(ta)
    const a = a0 && a0 > min * 2 ? a0 : null
    const max0 = a ? Math.min(c, a) : c
    const max = Math.max(min, max0)
    const v0 = ta.value ?? ""
    const len = v0.length
    const empty = v0.trim().length === 0

    ta.style.setProperty("resize", "none", "important")
    ta.style.setProperty("overflow-wrap", "anywhere", "important")
    ta.style.setProperty("word-break", "break-word", "important")
    ta.style.setProperty("box-sizing", "border-box", "important")
    ta.style.setProperty("height", "0px", "important")

    if (empty) {
      ta.style.setProperty("height", `${min}px`, "important")
      ta.style.setProperty("max-height", `${min}px`, "important")
      ta.style.setProperty("overflow-y", "hidden", "important")
      ta.style.setProperty("overflow-x", "hidden", "important")

      const s0 = st.get(ta)

      if (s0) {
        s0.at = false
        s0.max = max
        s0.len = len
        return
      }

      st.set(ta, { len, at: false, max })
      return
    }

    const h0 = ta.scrollHeight
    const h = Math.max(min, Math.min(max, h0))
    ta.style.setProperty("height", `${h}px`, "important")
    ta.style.setProperty("max-height", `${max}px`, "important")

    const over = h0 > max
    ta.style.setProperty("overflow-y", over ? "auto" : "hidden", "important")
    ta.style.setProperty("overflow-x", "hidden", "important")

    const s = st.get(ta)

    if (s) {
      s.at = over
      s.max = max
      s.len = len
      return
    }

    st.set(ta, { len, at: over, max })
  }

  const flush = () => {
    raf = 0

    for (const ta of pd) {
      ms(ta)
    }

    pd.clear()
  }

  const go = (ta: HTMLTextAreaElement, force?: boolean) => {
    const v0 = ta.value ?? ""
    const len = v0.length
    const s0 = st.get(ta)

    if (!s0) {
      st.set(ta, { len, at: false, max: 0 })
    }

    if (!force) {
      const s1 = st.get(ta)

      if (s1) {
        const pre = s1.len
        s1.len = len

        if (s1.at && len >= pre) {
          return
        }
      }
    }

    if (force) {
      const s2 = st.get(ta)

      if (s2) {
        s2.len = len
      }
    }

    const empty = v0.trim().length === 0

    if (empty) {
      ms(ta)
      return
    }

    pd.add(ta)

    if (raf) {
      return
    }

    raf = win.requestAnimationFrame(flush)
  }

  const all = (root: ParentNode | null) => {
    if (!root) {
      return
    }

    const ts = root.querySelectorAll<HTMLTextAreaElement>("textarea")

    for (var i = 0; i < ts.length; i++) {
      go(ts[i], true)
    }
  }

  const MO = g.MutationObserver
  const mo = MO
    ? new MO((ms) => {
        for (var i = 0; i < ms.length; i++) {
          const m = ms[i]
          const as = m?.addedNodes ?? []

          for (var j = 0; j < as.length; j++) {
            const n0 = as[j]
            const n = (n0 as Node | null)?.nodeType === 1 ? (n0 as Element) : null

            if (!n) {
              continue
            }

            const ta0 = n.tagName === "TEXTAREA" ? (n as HTMLTextAreaElement) : null

            if (ta0) {
              base(ta0)
              go(ta0, true)
              continue
            }

            const ts = n.querySelectorAll<HTMLTextAreaElement>("textarea")

            for (var k = 0; k < ts.length; k++) {
              base(ts[k])
              go(ts[k], true)
            }
          }

          const rs = m?.removedNodes ?? []

          for (var j = 0; j < rs.length; j++) {
            const n0 = rs[j]
            const n = (n0 as Node | null)?.nodeType === 1 ? (n0 as Element) : null

            if (!n) {
              continue
            }

            const ta0 = n.tagName === "TEXTAREA" ? (n as HTMLTextAreaElement) : null

            if (ta0) {
              un(ta0)
              continue
            }

            const ts = n.querySelectorAll<HTMLTextAreaElement>("textarea")

            for (var k = 0; k < ts.length; k++) {
              un(ts[k])
            }
          }
        }
      })
    : null

  if (mo) {
    mo.observe(doc.documentElement, { childList: true, subtree: true })
    sr && mo.observe(sr, { childList: true, subtree: true })
  }

  win.addEventListener(
    "resize",
    () => {
      all(doc)
      all(sr)
    },
    { passive: true },
  )

  win.requestAnimationFrame(() => {
    all(doc)
    all(sr)
  })

  return go
}
