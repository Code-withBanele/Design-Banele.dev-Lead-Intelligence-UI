import { fetchJson } from "./client"

import type {
  AiAnalysisRecord,
  DigitalAudit,
  DigitalAuditInput,
  DigitalIntelligenceResult,
  DigitalIntelligenceRun,
  OpportunityScoreResult,
} from "@/types"

export async function getLeadAudit(leadId: string): Promise<DigitalAudit> {
  return fetchJson<DigitalAudit>(`/leads/${leadId}/audit`)
}

export async function createLeadAudit(
  leadId: string,
  input: DigitalAuditInput = {},
): Promise<DigitalAudit> {
  return fetchJson<DigitalAudit>(`/leads/${leadId}/audit`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function getOpportunityScore(
  leadId: string,
): Promise<OpportunityScoreResult> {
  return fetchJson<OpportunityScoreResult>(`/leads/${leadId}/opportunity-score`)
}

export async function calculateOpportunityScore(
  leadId: string,
  input: DigitalAuditInput = {},
): Promise<OpportunityScoreResult> {
  return fetchJson<OpportunityScoreResult>(`/leads/${leadId}/opportunity-score`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function getAiAnalysis(leadId: string): Promise<AiAnalysisRecord> {
  return fetchJson<AiAnalysisRecord>(`/leads/${leadId}/ai-analysis`)
}

export async function createAiAnalysis(
  leadId: string,
): Promise<AiAnalysisRecord> {
  return fetchJson<AiAnalysisRecord>(`/leads/${leadId}/ai-analysis`, {
    method: "POST",
  })
}

export async function getDigitalIntelligence(
  leadId: string,
): Promise<DigitalIntelligenceRun> {
  return fetchJson<DigitalIntelligenceRun>(`/leads/${leadId}/digital-intelligence`)
}

export async function collectDigitalIntelligence(
  leadId: string,
  input: { website?: string; sourceUrl?: string } = {},
): Promise<DigitalIntelligenceResult> {
  return fetchJson<DigitalIntelligenceResult>(`/leads/${leadId}/digital-intelligence`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}
