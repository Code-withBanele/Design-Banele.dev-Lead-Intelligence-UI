import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import {
  env,
  hasSupabaseConfiguration,
  requireServerEnv,
} from "../config/env.js"

function createMissingSupabaseClient(): SupabaseClient {
  const throwMissingConfig = () => {
    throw new Error(
      "Supabase configuration is missing. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before using database operations.",
    )
  }

  const builder = () => ({
    select: () => {
      throwMissingConfig()
    },
    insert: () => {
      throwMissingConfig()
    },
    update: () => {
      throwMissingConfig()
    },
    delete: () => {
      throwMissingConfig()
    },
    upsert: () => {
      throwMissingConfig()
    },
    eq: () => {
      throwMissingConfig()
    },
    order: () => {
      throwMissingConfig()
    },
    limit: () => {
      throwMissingConfig()
    },
    single: () => {
      throwMissingConfig()
    },
    maybeSingle: () => {
      throwMissingConfig()
    },
    range: () => {
      throwMissingConfig()
    },
    csv: () => {
      throwMissingConfig()
    },
    ilike: () => {
      throwMissingConfig()
    },
    textSearch: () => {
      throwMissingConfig()
    },
    then: undefined,
  })

  return {
    from: () => builder(),
  } as unknown as SupabaseClient
}

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!hasSupabaseConfiguration()) {
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

export const supabase = hasSupabaseConfiguration()
  ? getSupabaseClient()
  : createMissingSupabaseClient()
