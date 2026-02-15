export type Att = { name: string; url: string }
export type Msg = { role: "user" | "assistant"; content: string; atts?: Att[] }
export type Req = { messages: Msg[]; mode: string; chatId: string; allow_terminal_exec?: boolean }
export type Ch = { id: string; name: string; at: number }
export type TermEntry = {
  id: string
  tool: string
  input: string
  output: string
  status: "running" | "done" | "failed"
}
export type Run = {
  ph: HTMLElement | null
  txt: string
  ta: HTMLTextAreaElement | null
  box: Element | null
  rd?: ReadableStreamDefaultReader<Uint8Array> | null
  ws?: WebSocket | null
  stop?: boolean
  stalled?: boolean
}
export type DsWin = Window & {
  __ms_ds_busy?: boolean
  __ms_ds_msgs?: Msg[]
  __ms_ds_id?: string
  __ms_ds_ta?: HTMLTextAreaElement | null
  __ms_ds_abort?: AbortController | null
  __ms_ds_run?: Run | null
  __ms_ds_reset?: ((keep?: boolean) => void) | null
  __ms_ds_new?: ((name?: string) => string) | null
  __ms_ds_stop?: ((why?: string) => void) | null
}
