import type { ChatCleanupService } from "../../../chat/cleanup"

export type CleanupService = {
  request: (chatId: string) => Promise<{
    ok: boolean
    chatId: string
    removedPaths: string[]
    removedFiles: string[]
    errors: string[]
  }>
}

export const createCleanupService = (cleanup: ChatCleanupService): CleanupService => {
  return {
    request: (chatId: string) => cleanup.request(chatId),
  }
}