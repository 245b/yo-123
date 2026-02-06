import * as ms from "../ms"
import type { BootDeps } from "./bootTypes"
import { bootSidebar } from "./bootSidebar"
import { bootSnapshot } from "./bootSnapshot"

export const createBoot = (d: BootDeps) => {
  const boot = (el: HTMLIFrameElement | null) => {
    const doc = el?.contentDocument
    const win = el?.contentWindow

    if (!el || !doc || !win) {
      return false
    }

    ms.vars(doc, win)
    const kind = el.dataset.kind ?? ""

    if (kind === "sidebar") {
      return bootSidebar(d, doc, win)
    }

    if (kind !== "snapshot") {
      return true
    }

    return bootSnapshot(d, doc, win)
  }

  return boot
}
