import { env } from "../config/env.js"
import { supabase } from "../db/supabase.js"
import {
  OPPORTUNITY_SCORE_RULESET_VERSION,
  OPPORTUNITY_SCORE_WEIGHTS,
} from "./opportunityScoreService.js"

export type ServiceHealthStatus =
  | "CONNECTED"
  | "AVAILABLE"
  | "CONFIGURED"
  | "NOT_CONFIGURED"
  | "DEGRADED"
  | "ERROR"
  | "UNKNOWN"

export type ServiceHealth = {
  status: ServiceHealthStatus
  detail?: string
}

export type SystemHealthResponse = {
  status: "healthy" | "degraded" | "error" | "unknown"
  services: {
    api: ServiceHealth
    database: ServiceHealth
    audit: ServiceHealth
    scoring: ServiceHealth
    digitalIntelligence: ServiceHealth
    ai: ServiceHealth
    n8n: ServiceHealth
  }
  checkedAt: string
}

type DatabaseProbe = () => Promise<{
  data: unknown
  error: { message?: string } | null
}>

const probeDatabase: DatabaseProbe = async () => {
  const result = await supabase.from("businesses").select("id").limit(1)
  return { data: result.data, error: result.error }
}

export async function getSystemHealthStatus(
  databaseProbe: DatabaseProbe = probeDatabase,
): Promise<SystemHealthResponse> {
  const checkedAt = new Date().toISOString()
  const services: SystemHealthResponse["services"] = {
    api: {
      status: "CONNECTED",
      detail: "The API process is reachable.",
    },
    database: {
      status: !env.supabaseUrl || !env.supabaseServiceRoleKey ? "NOT_CONFIGURED" : "UNKNOWN",
      detail: !env.supabaseUrl || !env.supabaseServiceRoleKey
        ? "Supabase environment variables are not configured."
        : "Database checks have not run yet.",
    },
    audit: {
      status: "AVAILABLE",
      detail: "Deterministic digital audit service is available.",
    },
    scoring: {
      status: "AVAILABLE",
      detail: `Deterministic scoring ruleset ${OPPORTUNITY_SCORE_RULESET_VERSION} is available with ${Object.keys(OPPORTUNITY_SCORE_WEIGHTS).length} factors.`,
    },
    digitalIntelligence: {
      status: "AVAILABLE",
      detail: "Digital intelligence collection is available.",
    },
    ai: {
      status: env.openRouterApiKey ? "CONFIGURED" : "NOT_CONFIGURED",
      detail: env.openRouterApiKey
        ? "OpenRouter is configured for AI business analysis."
        : "OpenRouter credentials are not configured.",
    },
    n8n: {
      status: "NOT_CONFIGURED",
      detail: "n8n orchestration is not configured for this workspace.",
    },
  }

  if (env.supabaseUrl && env.supabaseServiceRoleKey) try {
    const { data, error } = await databaseProbe()

    if (error) {
      services.database = {
        status: "ERROR",
        detail: error.message ?? "Supabase query failed.",
      }
    } else {
      services.database = {
        status: "CONNECTED",
        detail: data ? "Supabase query succeeded." : "Supabase connection is reachable.",
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database validation failed."
    services.database = {
      status: "ERROR",
      detail: message,
    }
  }

  const databaseOk = services.database.status === "CONNECTED"
  const apiOk = services.api.status === "CONNECTED"
  const hasOperationalCore = apiOk && databaseOk

  const status: SystemHealthResponse["status"] =
    !apiOk || !databaseOk ? "degraded" : "healthy"

  if (hasOperationalCore) {
    return {
      status: "healthy",
      services,
      checkedAt,
    }
  }

  return {
    status: "degraded",
    services,
    checkedAt,
  }
}
