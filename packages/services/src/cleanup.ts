export type CleanupServiceInput = {
  chatId: string
}

export type CleanupServiceResult = {
  ok: boolean
  removedPaths: string[]
  removedFiles: string[]
  errors: string[]
}

export type CleanupServicePort = {
  cleanup: (input: CleanupServiceInput) => Promise<CleanupServiceResult>
}

export const createCleanupService = (port: CleanupServicePort) => {
  const cleanup = async (chatId: string) => {
    const id = (chatId ?? "").trim()

    if (!id) {
      return {
        ok: false,
        removedPaths: [] as string[],
        removedFiles: [] as string[],
        errors: ["Invalid chatId"],
      }
    }

    return port.cleanup({ chatId: id })
  }

  return { cleanup }
}