import { config } from "dotenv"

import { fileURLToPath } from "node:url"

config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
})

export const env = {
  port: Number(process.env.PORT ?? 4000),

  supabaseUrl: process.env.SUPABASE_URL ?? "",

  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",

  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",

  nodeEnv: process.env.NODE_ENV ?? "development",
}

export function requireServerEnv() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.",
    )
  }
}
