export const LEAD_STATUSES = [
  "NEW",

  "QUALIFIED",

  "AUDITED",

  "CONTACTED",

  "REPLIED",

  "MEETING",

  "PROPOSAL",

  "WON",

  "LOST",

  "ARCHIVED",
] as const

export const LEAD_QUALIFICATION_STATUSES = [
  "qualified",
  "needs_review",
  "unqualified",
] as const

export type LeadStatus = typeof LEAD_STATUSES[number]

export type LeadQualificationStatus =
  (typeof LEAD_QUALIFICATION_STATUSES)[number]

export type LeadQualification = {
  id: string
  leadId: string
  status: LeadQualificationStatus
  score: number
  classification: "LOW" | "MEDIUM" | "HIGH"
  reasons: string[]
  evidence: string[]
  calculatedAt: string
}

export type Lead = {
  id: string

  businessId: string

  name: string

  industry: string | null

  location: string | null

  status: LeadStatus

  priority: string | null

  source: string | null

  opportunityScore: number | null

  qualificationStatus: string | null

  createdAt: string

  updatedAt: string
}

export type CreateLeadInput = {
  name: string

  industry?: string

  location?: string

  status?: LeadStatus
}

export type UpdateLeadInput = {
  status: LeadStatus
}
