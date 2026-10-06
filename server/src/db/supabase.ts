import { createClient } from "@supabase/supabase-js"

import { env, requireServerEnv } from "../config/env.js"

requireServerEnv()

export const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})
