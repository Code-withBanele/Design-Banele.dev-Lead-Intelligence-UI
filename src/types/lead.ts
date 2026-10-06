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

export type LeadStatus = typeof LEAD_STATUSES[number]

export type Lead = {
  id: string

  businessId: string

  name: string

  websiteUrl: string | null

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
