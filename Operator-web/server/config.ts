import path from "node:path"

export type ServerConfig = {
  root: string
  dist: string
  pub: string
  corsHeaders: Record<string, string>
}

export const buildConfig = async (root: string): Promise<ServerConfig> => {
  const dist = path.join(root, "dist")
  const pub = path.join(root, "public")
  const cors0 = (process.env.CORS_ORIGIN ?? "").trim()
  const cors = cors0 || "*"
  const corsHeaders = {
    "access-control-allow-origin": cors,
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,accept",
    "access-control-max-age": "86400",
  }

  return {
    root,
    dist,
    pub,
    corsHeaders,
  }
}
