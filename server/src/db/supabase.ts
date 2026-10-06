import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { env, requireServerEnv } from "../config/env.js"

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    requireServerEnv()
  }

  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }

  return client
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    const activeClient = getSupabaseClient()
    const value = Reflect.get(activeClient, property, receiver)
    return typeof value === "function" ? value.bind(activeClient) : value
  },
})
