type Ref<T> = { current: T }
type Set<T> = (v: T | ((p: T) => T)) => void

export type MsWin = Window & {
  __ms_app_side?: (() => void) | null
  __ms_app_snap?: (() => void) | null
}

export type BootDeps = {
  pad: number
  dur: number
  open: boolean
  w: number
  shift: Ref<number>
  setOpen: Set<boolean>
  setX: Set<number>
  setW: Set<number>
  ia: Ref<HTMLIFrameElement | null>
  ca: Ref<(() => void) | null>
  cb: Ref<(() => void) | null>
  sd: Ref<Document | null>
  vr: Ref<string>
}
