export type MsgPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }

export type Msg = {
  role: "system" | "user" | "assistant"
  content: string | MsgPart[]
}
