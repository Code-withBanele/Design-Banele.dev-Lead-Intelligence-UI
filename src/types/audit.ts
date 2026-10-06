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
