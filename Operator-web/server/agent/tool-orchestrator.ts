import { unifiedExecManager } from "./unified-exec/manager"

export const runExecCommand = async (input: {
  sessionId: string
  command: string
  workdir?: string
  timeoutMs?: number
  maxChars?: number
  processId?: string
  tty?: boolean
  requestId?: string
}, onDelta?: (chunk: string, processId: string) => void) => {
  return unifiedExecManager.execCommand(
    {
      sessionId: input.sessionId,
      command: input.command,
      workdir: input.workdir,
      timeoutMs: input.timeoutMs,
      maxChars: input.maxChars,
      processId: input.processId,
      tty: input.tty,
      requestId: input.requestId,
    },
    onDelta
      ? (event) => {
          onDelta(event.chunk, event.processId)
        }
      : undefined
  )
}

export const runWriteStdin = async (input: {
  processId: string
  chars: string
  yieldTimeMs?: number
  maxChars?: number
  requestId?: string
}) => {
  return unifiedExecManager.writeStdin({
    processId: input.processId,
    chars: input.chars,
    yieldTimeMs: input.yieldTimeMs,
    maxChars: input.maxChars,
    requestId: input.requestId,
  })
}
