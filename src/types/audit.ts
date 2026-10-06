export const DIGITAL_AUDIT_FACTORS = [
  "hasWebsite",
  "hasGoogleBusinessProfile",
  "hasActiveSocial",
  "hasOnlineOrdering",
  "hasOnlineBooking",
  "hasWhatsApp",
  "hasContactMethod",
  "hasMobileFriendlyWebsite",
  "hasStrongCTA",
  "hasBasicSEO",
  "hasVisibleBusinessInformation",
] as const

export type DigitalAuditFactorKey = typeof DIGITAL_AUDIT_FACTORS[number]

export type DigitalAuditFactorStatus = "KNOWN" | "UNKNOWN"

export type DigitalAuditFactor = {
  key: DigitalAuditFactorKey
  value: boolean | null
  status: DigitalAuditFactorStatus
  evidence?: string | null
}

export type DigitalAudit = {
  id: string
  leadId: string
  auditVersion: string
  createdAt: string
  factors: DigitalAuditFactor[]
}

export type DigitalAuditInput = Partial<
  Record<DigitalAuditFactorKey, boolean | null | { value: boolean | null; status?: DigitalAuditFactorStatus; evidence?: string | null }>
>

export type OpportunityScoreClassification = "LOW" | "MEDIUM" | "HIGH"

export type OpportunityScoreResult = {
  score: number
  classification: OpportunityScoreClassification
  rulesetVersion: string
  calculatedAt: string
  contributingFactors: string[]
}

export type LeadQualificationStatus =
  | "QUALIFIED"
  | "REVIEW_REQUIRED"
  | "UNQUALIFIED"

export type LeadQualificationResult = {
  id?: string
  leadId?: string
  status: LeadQualificationStatus
  evidenceSufficiency: "SUFFICIENT" | "PARTIAL" | "INSUFFICIENT"
  opportunityScore: number
  classification: OpportunityScoreClassification
  rulesetVersion: string
  evaluatedAt: string
  reasons: string[]
  blockingFactors: string[]
}

export type AiBusinessAnalysisSummary = {
  summary: string
  problems: string[]
  opportunities: string[]
  recommendations: string[]
  digitalSolution: string
  outreachAngle: string
}

export type AiAnalysisRecord = {
  id: string
  leadId: string
  provider: string
  model: string
  promptVersion: string
  analysis: AiBusinessAnalysisSummary
  routingMetadata: {
    requestedModel: string
    selectedModel: string
    provider: string
    fallbackUsed: boolean
    attemptCount: number
    failureReason?: string
  }
  createdAt: string
}

export type DigitalEvidenceSourceType = "website" | "google" | "social" | "external"

export type DigitalEvidenceConfidence = "high" | "medium" | "low"

export type DigitalEvidence = {
  id?: string
  leadId: string
  runId?: string
  category: string
  key: string
  value: unknown
  sourceUrl?: string | null
  sourceType: DigitalEvidenceSourceType
  confidence: DigitalEvidenceConfidence
  collectedAt: string
  metadata?: Record<string, unknown>
}

export type DigitalIntelligenceStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"

export type DigitalIntelligenceRun = {
  id: string
  leadId: string
  status: DigitalIntelligenceStatus
  startedAt: string
  completedAt: string | null
  pagesCrawled: number
  requestsMade: number
  evidenceCount: number
  errorCount: number
  warnings: string[]
  errorMessages: string[]
  collectorVersion: string
  sourceUrl?: string | null
  evidence: DigitalEvidence[]
}

export type DigitalIntelligenceResult = DigitalIntelligenceRun & {
  audit: Record<string, unknown>
  score: {
    score: number
    classification: "LOW" | "MEDIUM" | "HIGH"
    rulesetVersion: string
    calculatedAt: string
    contributingFactors: string[]
  }
}
