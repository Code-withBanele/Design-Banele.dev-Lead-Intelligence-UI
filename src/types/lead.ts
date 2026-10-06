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

  name: string

  industry: string

  location: string

  status: LeadStatus
}

export type CreateLeadInput = Omit<Lead, "id">

export type UpdateLeadInput = Partial<Lead>
