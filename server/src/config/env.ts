import { config } from "dotenv"

import { fileURLToPath } from "node:url"

config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
})

export const env = {
  get port() {
    return Number(process.env.PORT ?? 4000)
  },

  get supabaseUrl() {
    return process.env.SUPABASE_URL ?? ""
  },

  get supabaseServiceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
  },

  get openRouterApiKey() {
    return process.env.OPENROUTER_API_KEY ?? ""
  },

  get nodeEnv() {
    return process.env.NODE_ENV ?? "development"
  },
}

export function requireServerEnv() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.",
    )
  }
}
