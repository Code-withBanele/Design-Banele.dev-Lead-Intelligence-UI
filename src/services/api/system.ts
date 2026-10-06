import { fetchJson } from "./client"

import type { SystemHealthResponse } from "@/types"

export async function getSystemHealth(): Promise<SystemHealthResponse> {
  return fetchJson<SystemHealthResponse>(`/system/health`)
}
