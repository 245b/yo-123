import { HealthQuerySchema } from "../../../../packages/contracts/src/http"

export const parseHealthQuery = (url: URL) => {
  const row = Object.fromEntries(url.searchParams.entries())
  return HealthQuerySchema.safeParse(row)
}