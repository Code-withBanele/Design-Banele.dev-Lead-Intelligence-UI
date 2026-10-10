import { fetchJson } from "./client"

import type { LeadPipelineStatus, PipelineQueueResult } from "@/types"

export function getLeadPipelineStatus(leadId: string): Promise<LeadPipelineStatus> {
  return fetchJson<LeadPipelineStatus>(`/leads/${encodeURIComponent(leadId)}/pipeline`)
}

export function rerunLeadPipeline(leadId: string): Promise<PipelineQueueResult> {
  return fetchJson<PipelineQueueResult>(`/leads/${encodeURIComponent(leadId)}/pipeline/rerun`, {
    method: "POST",
  })
}

export function runUnprocessedPipelines(): Promise<PipelineQueueResult> {
  return fetchJson<PipelineQueueResult>("/leads/pipeline/run-unprocessed", {
    method: "POST",
  })
}