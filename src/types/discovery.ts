export type DiscoverySourceType = "BUSINESS_WEBSITE" | "DIRECTORY" | "LISTING_PAGE" | "UNKNOWN"

export type DiscoveredBusinessResult = {
  businessId: string | null
  leadId: string | null
  name: string
  category: string | null
  address: string | null
  location: string | null
  phone: string | null
  email: string | null
  socialUrls: string[]
  website: string | null
  profileUrl: string | null
  sourcePageUrl: string
  result: "CREATED" | "UPDATED" | "FAILED"
}

export type DiscoveryRunResult = {
  runId: string
  sourceType: DiscoverySourceType
  confidence: "HIGH" | "MEDIUM" | "LOW"
  reasons: string[]
  status: "COMPLETED" | "PARTIAL" | "FAILED"
  sourceUrl: string
  businessesDiscovered: number
  businessesCreated: number
  businessesUpdated: number
  leadsCreated: number
  leadsUpdated: number
  duplicatesSkipped: number
  pagesVisited: number
  requestsMade: number
  warnings: string[]
  errors: string[]
  businesses: DiscoveredBusinessResult[]
}
