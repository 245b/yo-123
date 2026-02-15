import { LegacyChatRequestSchema } from "../../../../../packages/contracts/src/http"

export const parseLegacyChatBody = (raw: unknown) => LegacyChatRequestSchema.safeParse(raw)