import { ids } from "./icons/ids"
import { setA } from "./icons/set-a"
import { setB } from "./icons/set-b"
import { setC } from "./icons/set-c"
import { setD } from "./icons/set-d"

const map = { ...setA, ...setB, ...setC, ...setD } as Record<string, (sz: number) => JSX.Element>

export { ids }

export const ico = (id: string, sz: number) => {
  const pick = map[id] ?? map.folder
  return pick ? pick(sz) : null
}
