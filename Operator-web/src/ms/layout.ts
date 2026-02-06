import type { Mid } from "./types"

const txt = `
;(function () {
  var num = function (s) {
    var v = parseInt((s || "").trim(), 10)
    return Number.isFinite(v) ? v : 0
  }

  var run = function () {
    var html = document.documentElement
    var bw = num(html.getAttribute("data-ms-w"))
    var pad = num(html.getAttribute("data-ms-pad"))
    var w = Math.max(0, Math.round(bw))
    var p = Math.max(0, Math.round(pad))
    var max = Math.round(window.innerWidth - pad)
    var tight = max <= Math.round(bw + pad)

    html.setAttribute("data-ms-tight", tight ? "1" : "0")
    html.style.setProperty("--ms-side-w", w + "px")
    html.style.setProperty("--ms-side-pad", p + "px")
  }

  var mo = typeof MutationObserver !== "undefined"
    ? new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i]
        if (m.type !== "attributes") {
          continue
        }
        run()
        return
      }
    })
    : null

  if (mo) {
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ms-side", "data-ms-w", "data-ms-pad"],
    })
  }

  addEventListener("resize", run, { passive: true })
  run()
})();`.trim()

export const layout = (doc: Document, win: Window, o: Mid) => {
  doc.documentElement.setAttribute("data-ms-side", o.open ? "1" : "0")
  doc.documentElement.setAttribute("data-ms-w", `${Math.round(o.w)}`)
  doc.documentElement.setAttribute("data-ms-pad", `${Math.round(o.pad)}`)
  doc.documentElement.setAttribute("data-ms-dur", `${Math.round(o.dur)}`)

  const head = doc.head

  if (!head) {
    return
  }

  const lid = "__ms_lay_if"
  const sc0 = doc.getElementById(lid)
  const sc = sc0?.tagName === "SCRIPT" ? (sc0 as HTMLScriptElement) : doc.createElement("script")

  if (sc0?.tagName === "SCRIPT") {
    return
  }

  sc.id = lid
  sc.textContent = txt
  head.appendChild(sc)
}
