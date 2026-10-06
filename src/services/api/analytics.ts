import { fetchJson } from "./client"

import type { AnalyticsMetrics } from "@/types"

export function getAnalytics(): Promise<AnalyticsMetrics> {
  return fetchJson<AnalyticsMetrics>("/analytics")
}