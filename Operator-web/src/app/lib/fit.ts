export const fit = (ta: HTMLTextAreaElement | null) => {
  if (!ta) {
    return
  }

  const mh0 = Math.round(window.innerHeight * 0.6)
  const mh1 = Math.max(140, Math.min(900, mh0))
  const min = 100

  ta.style.setProperty("resize", "none", "important")
  ta.style.setProperty("height", "0px", "important")

  const h0 = ta.scrollHeight
  const h = Math.max(min, Math.min(mh1, h0))
  ta.style.setProperty("height", `${h}px`, "important")

  const over = h0 > mh1
  ta.style.setProperty("overflow-y", over ? "auto" : "hidden", "important")
  ta.style.setProperty("overflow-x", "hidden", "important")
}

