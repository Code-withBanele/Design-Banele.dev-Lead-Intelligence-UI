import { normalizeSourceUrl, validateSafeUrl } from "./safeHttp.js"

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

export type CreateLeadInput = {
  name: string

  industry?: string

  location?: string

  websiteUrl?: string

  status?: LeadStatus
}

export function isLeadStatus(value: unknown): value is LeadStatus {
  return (
    typeof value === "string" && LEAD_STATUSES.includes(value as LeadStatus)
  )
}

export function normalizeLeadInput(input: CreateLeadInput) {
  const name = input.name.trim()

  if (!name) {
    throw new Error("Business name is required.")
  }

  const normalizedStatus = input.status ?? "NEW"

  if (!isLeadStatus(normalizedStatus)) {
    throw new Error("Invalid lead status.")
  }

  const websiteUrl = input.websiteUrl?.trim()

  const normalizedWebsiteUrl = websiteUrl ? validateSafeUrl(normalizeSourceUrl(websiteUrl)) : null

  return {
    name,

    industry: input.industry?.trim() || "",

    location: input.location?.trim() || "",

    ...(normalizedWebsiteUrl ? { websiteUrl: normalizedWebsiteUrl } : {}),

    status: normalizedStatus,
  }
}
