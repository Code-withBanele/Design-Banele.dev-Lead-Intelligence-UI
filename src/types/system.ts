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
