type ViewerDeps = {
  root: Document
  sr: ShadowRoot | null
  url: string
  name: string
}

export const openAttachmentViewer = (d: ViewerDeps) => {
  const root = d.root
  const sr = d.sr
  const url = d.url
  const nm = d.name
  const sid = "__ms_view"
  const q = sr ?? root
  q.querySelector(`#${sid}`)?.remove()

  const ov = root.createElement("div")
  ov.id = sid
  ov.className = "fixed inset-0 flex items-center justify-center opacity-0"
  ov.style.opacity = "1"
  ov.style.zIndex = "2147483647"
  ov.style.setProperty("--icon-white", "rgb(255,255,255)")
  ov.style.setProperty("--text-white", "rgb(255,255,255)")
  ov.style.setProperty("--border-white", "rgba(255,255,255,0.3)")
  ov.style.setProperty("--border-light", "rgba(255,255,255,0.12)")
  ov.style.setProperty("--background-preview-mask", "rgba(0,0,0,0.85)")

  const bg = root.createElement("div")
  bg.className = "absolute inset-0 -z-10"
  ov.appendChild(bg)

  const wrap = root.createElement("div")
  wrap.className = "size-full transform scale-95 transition-[width,height] duration-200 ease-in-out"
  wrap.style.transform = "scale(1)"
  ov.appendChild(wrap)

  const box = root.createElement("div")
  box.className =
    "overflow-hidden shadow-[0px_0px_8px_0px_rgba(0,0,0,0.02)] ltr:border-l rtl:border-r border-black/8 dark:border-[var(--border-light)] flex flex-col h-full w-full relative bg-[var(--background-preview-mask)]"
  box.style.backdropFilter = "blur(12px)"
  ;(box.style as { webkitBackdropFilter?: string }).webkitBackdropFilter = "blur(12px)"
  wrap.appendChild(box)

  const row = root.createElement("div")
  row.className = "flex flex-1 min-h-0 w-full relative"
  box.appendChild(row)

  const col = root.createElement("div")
  col.className = "w-full h-full flex flex-col"
  row.appendChild(col)

  const top = root.createElement("div")
  top.className = "absolute top-0 left-0 right-0 flex items-center justify-center ps-3 pe-5 py-3 w-full z-20"
  col.appendChild(top)

  const bar = root.createElement("div")
  bar.className = "backdrop-blur-2xl bg-[rgba(0,0,0,0.65)] rounded-[12px] flex items-center gap-3 ps-1 pe-3 py-1"
  top.appendChild(bar)

  const dl = root.createElement("button")
  dl.type = "button"
  dl.setAttribute("data-ms-view-dl", "1")
  dl.className = "clickable size-7 flex items-center justify-center cursor-pointer hover:bg-[rgba(255,255,255,0.1)] rounded transition-colors"
  dl.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--icon-white)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download" aria-hidden="true"><path d="M12 15V3"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m7 10 5 5 5-5"></path></svg>'
  bar.appendChild(dl)

  const div = root.createElement("div")
  div.className = "h-4 w-px bg-[var(--border-white)]"
  bar.appendChild(div)

  const zc = root.createElement("div")
  zc.className = "flex items-center gap-1.5"
  bar.appendChild(zc)

  const zi = root.createElement("button")
  zi.type = "button"
  zi.setAttribute("data-ms-view-zi", "1")
  zi.className = "clickable size-7 flex items-center justify-center hover:bg-[rgba(255,255,255,0.1)] rounded transition-colors"
  zi.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--icon-white)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-zoom-in" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" x2="16.65" y1="21" y2="16.65"></line><line x1="11" x2="11" y1="8" y2="14"></line><line x1="8" x2="14" y1="11" y2="11"></line></svg>'
  zc.appendChild(zi)

  const pct = root.createElement("span")
  pct.className = "text-sm text-[var(--text-white)] font-normal leading-5 tracking-[-0.154px] min-w-[40px] text-center"
  pct.textContent = "100%"
  zc.appendChild(pct)

  const zo = root.createElement("button")
  zo.type = "button"
  zo.setAttribute("data-ms-view-zo", "1")
  zo.className = "clickable size-7 flex items-center justify-center hover:bg-[rgba(255,255,255,0.1)] rounded transition-colors"
  zo.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--icon-white)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-zoom-out" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" x2="16.65" y1="21" y2="16.65"></line><line x1="8" x2="14" y1="11" y2="11"></line></svg>'
  zc.appendChild(zo)

  const x = root.createElement("button")
  x.type = "button"
  x.setAttribute("data-ms-view-close", "1")
  x.className =
    "absolute end-5 clickable size-7 flex items-center justify-center cursor-pointer hover:bg-[rgba(255,255,255,0.1)] rounded transition-colors"
  x.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--icon-white)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>'
  top.appendChild(x)

  const mid = root.createElement("div")
  mid.className =
    "flex items-center justify-center px-[24px] relative flex-1 min-h-0 pt-[68px] pb-[32px] max-w-[min(760px,100%-160px)] mx-auto w-full"
  col.appendChild(mid)

  const img = root.createElement("img")
  img.className = "max-h-full max-w-full touch-none inline-flex rounded-[8px] overflow-hidden select-none object-contain"
  img.alt = nm || "image"
  img.draggable = false
  img.src = url
  img.setAttribute("data-ms-view-img", "1")
  img.style.transform = "scale(1) translate(0px, 0px)"
  img.style.transformOrigin = "center center"
  img.style.cursor = "grab"
  img.style.transition = "transform 0.1s ease-out"
  img.style.willChange = "transform"
  img.style.width = "760px"
  img.style.maxWidth = "100%"
  mid.appendChild(img)

  const mount = sr ?? root.body

  if (!mount) {
    return
  }

  mount.appendChild(ov)

  var z = 1
  var dx = 0
  var dy = 0
  var on = false
  var sx = 0
  var sy = 0
  var ox = 0
  var oy = 0

  const draw = () => {
    img.style.transform = `scale(${z}) translate(${dx}px, ${dy}px)`
    pct.textContent = `${Math.round(z * 100)}%`
  }

  const end = () => {
    if (!on) {
      return
    }

    on = false
    img.style.cursor = "grab"
    root.removeEventListener("pointermove", mv, true)
    root.removeEventListener("pointerup", up, true)
    root.removeEventListener("pointercancel", up, true)
  }

  const close = () => {
    end()
    root.removeEventListener("keydown", kd, true)
    ov.remove()
  }

  const kd = (ev: Event) => {
    const k = (ev as KeyboardEvent).key ?? ""

    if (k !== "Escape") {
      return
    }

    ev.preventDefault()
    ev.stopPropagation()
    close()
  }

  const mv = (ev: Event) => {
    if (!on) {
      return
    }

    const e = ev as PointerEvent
    dx = ox + (e.clientX - sx) / z
    dy = oy + (e.clientY - sy) / z
    draw()
    e.preventDefault()
  }

  const up = () => end()

  root.addEventListener("keydown", kd, true)

  x.addEventListener(
    "pointerdown",
    (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      close()
    },
    true,
  )

  mid.addEventListener(
    "pointerdown",
    (ev) => {
      if (ev.target !== mid) {
        return
      }

      ev.preventDefault()
      ev.stopPropagation()
      close()
    },
    true,
  )

  const save = () => {
    const a = root.createElement("a")
    a.href = url
    a.download = nm || "image"
    a.rel = "noopener"
    a.style.display = "none"
    const mount = root.body ?? root.documentElement
    mount?.appendChild(a)
    a.click()
    a.remove()
  }

  dl.addEventListener(
    "pointerdown",
    (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
    },
    true,
  )

  dl.addEventListener(
    "click",
    (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      save()
    },
    true,
  )

  zi.addEventListener(
    "pointerdown",
    (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      z = Math.min(5, z * 1.25)
      draw()
    },
    true,
  )

  zo.addEventListener(
    "pointerdown",
    (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      z = Math.max(0.25, z / 1.25)
      draw()
    },
    true,
  )

  img.addEventListener(
    "pointerdown",
    (ev) => {
      if (ev.button !== 0) {
        return
      }

      on = true
      sx = ev.clientX
      sy = ev.clientY
      ox = dx
      oy = dy
      img.style.cursor = "grabbing"
      root.addEventListener("pointermove", mv, true)
      root.addEventListener("pointerup", up, true)
      root.addEventListener("pointercancel", up, true)
      ev.preventDefault()
      ev.stopPropagation()
    },
    true,
  )
}
