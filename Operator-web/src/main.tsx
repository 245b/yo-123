import ReactDOM from "react-dom/client"
import App from "./App"
import { fromBase, toBase } from "./lib/route"
import { probeApiBase } from "./lib/api"
import "./index.css"

const el = document.getElementById("root")

if (el) {
  const saved0 = window.sessionStorage.getItem("gh:path") ?? ""
  const saved = saved0.trim()

  if (saved) {
    window.sessionStorage.removeItem("gh:path")
    window.history.replaceState(null, "", toBase(saved))
  }

  const p = fromBase(window.location.pathname)
  const ok = p === "/" || p.startsWith("/t/")

  if (!ok) {
    window.history.replaceState(null, "", toBase("/"))
  }

  probeApiBase().finally(() => {
    ReactDOM.createRoot(el).render(<App />)
  })
}
