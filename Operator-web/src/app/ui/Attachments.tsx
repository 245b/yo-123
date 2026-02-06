import { useEffect, useRef } from "react"
import { useAttachments } from "./overlays/useAttachments"

type AttachmentsProps = {
  ia: { current: HTMLIFrameElement | null }
}

type PickWin = Window & { __ms_att_pick?: (() => void) | null }

const Attachments = (p: AttachmentsProps) => {
  const att = useAttachments({ ia: p.ia })
  const push = att.push
  const inp = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const pick = () => {
      inp.current?.click()
    }

    const w = window as PickWin
    w.__ms_att_pick = pick

    var fw: PickWin | null = null
    var rid = 0
    var n = 0

    const bind = () => {
      const w0 = p.ia.current?.contentWindow ?? null
      const w1 = w0 as PickWin | null

      if (!w1) {
        return false
      }

      if (fw === w1) {
        return true
      }

      fw = w1
      fw.__ms_att_pick = pick
      return true
    }

    const step = () => {
      rid = 0
      n++

      const ok = bind()

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
      if (w.__ms_att_pick === pick) {
        w.__ms_att_pick = null
      }

      if (fw?.__ms_att_pick === pick) {
        fw.__ms_att_pick = null
      }

      if (!rid) {
        return
      }

      window.cancelAnimationFrame(rid)
    }
  }, [p.ia])

  return (
    <input
      ref={inp}
      type="file"
      multiple
      className="hidden"
      onChange={(ev) => {
        const fs0 = ev.currentTarget.files
        const fs = fs0 ? Array.from(fs0) : []
        ev.currentTarget.value = ""
        push(fs)
      }}
    />
  )
}

export default Attachments
