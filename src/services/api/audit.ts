import { fetchJson } from "./client"

import type {
  AiAnalysisRecord,
  DigitalAudit,
  DigitalAuditInput,
  DigitalIntelligenceResult,
  DigitalIntelligenceRun,
  LeadQualificationResult,
  OpportunityScoreResult,
} from "@/types"

export async function getLeadQualification(
  leadId: string,
): Promise<LeadQualificationResult | null> {
  try {
    return await fetchJson<LeadQualificationResult>(`/leads/${leadId}/qualification`)
  } catch (error) {
    if (error instanceof Error && error.message === "Lead qualification not found.") {
      return null
    }

    throw error
  }
}

export async function evaluateLeadQualification(
  leadId: string,
): Promise<LeadQualificationResult> {
  return fetchJson<LeadQualificationResult>(`/leads/${leadId}/qualification`, {
    method: "POST",
  })
}

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
