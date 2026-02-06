export type FramesProps = {
  open: boolean
  w: number
  x: number
  dur: number
  live: boolean
  ia: { current: HTMLIFrameElement | null }
  ib: { current: HTMLIFrameElement | null }
  boot: (el: HTMLIFrameElement | null) => void
}

const Frames = (p: FramesProps) => (
  <>
    <iframe
      data-kind="snapshot"
      ref={(el) => {
        p.ia.current = el
        p.boot(el)
      }}
      className="absolute inset-0 block h-full w-full border-0 bg-transparent"
      sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts allow-downloads"
      src="/snapshot.html?ms=1"
      title="snapshot"
      onLoad={(ev) => p.boot(ev.currentTarget)}
    />
    <div
      className={[
        "absolute left-0 top-0 z-50 h-full overflow-hidden bg-transparent",
        p.live ? "pointer-events-auto" : "pointer-events-none",
      ].join(" ")}
      style={{
        width: p.w,
        transitionProperty: "width",
        transitionDuration: `${p.dur}ms`,
        transitionTimingFunction: "ease-in-out",
      }}
    >
      <iframe
        data-kind="sidebar"
        ref={(el) => {
          p.ib.current = el
          p.boot(el)
        }}
        className="block h-full border-0 bg-transparent"
        style={{ width: Math.max(768, Math.round(p.x + p.w)), transform: `translateX(-${p.x}px)` }}
        sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts allow-downloads"
        src="/sidebar.html?ms=1"
        title="sidebar"
        onLoad={(ev) => p.boot(ev.currentTarget)}
      />
    </div>
  </>
)

export default Frames

