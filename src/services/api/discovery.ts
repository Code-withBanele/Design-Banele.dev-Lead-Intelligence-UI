import { fetchJson } from "./client"

import type { DiscoveryRunResult } from "@/types"

export function runDiscovery(sourceUrl: string): Promise<DiscoveryRunResult> {
  return fetchJson<DiscoveryRunResult>("/discovery", {
    method: "POST",
    body: JSON.stringify({ sourceUrl }),
  })
}

export function getDiscoveryRun(runId: string): Promise<DiscoveryRunResult> {
  return fetchJson<DiscoveryRunResult>(`/discovery/${encodeURIComponent(runId)}`)
}
