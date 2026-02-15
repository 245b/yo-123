import { CleanupPathSchema } from "../../../../../packages/contracts/src/http"

const pre = "/api/chats/"
const post = "/cleanup"

export const parseCleanupPath = (pathname: string) => {
  const raw = pathname.slice(pre.length, Math.max(pre.length, pathname.length - post.length))
  const chatId = raw.trim()
  return CleanupPathSchema.safeParse({ chatId })
}