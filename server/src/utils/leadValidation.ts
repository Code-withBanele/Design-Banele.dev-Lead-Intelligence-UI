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

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && LEAD_STATUSES.includes(value as LeadStatus)
}

export function normalizeLeadInput(input: {
  name: string
  industry?: string
  location?: string
  status?: LeadStatus
}) {
  const name = input.name.trim()

  if (!name) {
    throw new Error("Business name is required.")
  }

  const normalizedStatus = input.status ?? "NEW"

  if (!isLeadStatus(normalizedStatus)) {
    throw new Error("Invalid lead status.")
  }

  return {
    name,
    industry: input.industry?.trim() || "",
    location: input.location?.trim() || "",
    status: normalizedStatus,
  }
}
