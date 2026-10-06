import type { LeadStatus } from "./lead"

export type AnalyticsMetrics = {
  conversionRate: number | null
  outreachSent: number | null
  meetingsBooked: number | null
  replyRate: number | null
  auditCount: number | null
  opportunityScoreCount: number | null
  pipeline: Record<LeadStatus, number> | null
  leadSources: Array<{ source: string; count: number }> | null
}