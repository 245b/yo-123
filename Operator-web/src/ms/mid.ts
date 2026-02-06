import type { Mid } from "./types"
import { chat } from "./chat"
import { chatbox } from "./chatbox"
import { layout } from "./layout"
import { Operator } from "./Operator"
import { styles } from "./styles"

export const mid = (doc: Document, win: Window, o: Mid) => {
  layout(doc, win, o)
  chatbox(doc)
  Operator(doc, win, o)
  chat(doc, win, o)
  styles(doc, win)
}

