export const vars = (doc: Document, win: Window) => {
  const st = win.getComputedStyle(doc.documentElement)
  const ks = [
    "--background-operator-gray",
    "--background-operator-white",
    "--fill-tsp-gray-main",
    "--fill-tsp-white-main",
    "--fill-tsp-white-dark",
    "--fill-tsp-white-light",
    "--text-primary",
    "--text-tertiary",
    "--text-disable",
    "--icon-tertiary",
    "--icon-primary",
    "--border-dark",
    "--border-btn-main",
    "--Button-primary-black",
    "--text-onblack",
    "--theme-shadow-s2",
    "--theme-shadow-s3",
  ]

  var set = 0

  for (var i = 0; i < ks.length; i++) {
    const k = ks[i]
    const v0 = st.getPropertyValue(k)
    const v = v0.trim()

    if (!v) {
      continue
    }

    doc.documentElement.style.setProperty(k, v)
    set++
  }

  if (!set) {
    return
  }

  doc.documentElement.setAttribute("data-ms-vars", "1")
}

