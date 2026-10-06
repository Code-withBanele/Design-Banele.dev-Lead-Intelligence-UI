import { env } from "../config/env.js"
import { supabase } from "../db/supabase.js"

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

export async function getSystemHealthStatus(): Promise<SystemHealthResponse> {
  const checkedAt = new Date().toISOString()
  const services: SystemHealthResponse["services"] = {
    api: {
      status: "CONNECTED",
      detail: "The API process is reachable.",
    },
    database: {
      status: "UNKNOWN",
      detail: "Database checks have not run yet.",
    },
    audit: {
      status: "AVAILABLE",
      detail: "Deterministic digital audit service is available.",
    },
    scoring: {
      status: "AVAILABLE",
      detail: "Deterministic opportunity scoring is available.",
    },
    digitalIntelligence: {
      status: "AVAILABLE",
      detail: "Digital intelligence collection is available.",
    },
    ai: {
      status: process.env.OPENROUTER_API_KEY ? "CONFIGURED" : "NOT_CONFIGURED",
      detail: process.env.OPENROUTER_API_KEY
        ? "OpenRouter is configured for AI business analysis."
        : "OpenRouter credentials are not configured.",
    },
    n8n: {
      status: "NOT_CONFIGURED",
      detail: "n8n orchestration is not configured for this workspace.",
    },
  }

  try {
    const { data, error } = await supabase
      .from("businesses")
      .select("id")
      .limit(1)

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

  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    services.database = {
      status: "ERROR",
      detail: "Supabase environment variables are not configured.",
    }

    return {
      status: "error",
      services,
      checkedAt,
    }
  }

  if (services.ai.status === "ERROR") {
    return {
      status: "error",
      services,
      checkedAt,
    }
  }

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
