import { supabase } from "../db/supabase.js"

import { LEAD_STATUSES, type LeadStatus } from "../utils/leadValidation.js"

export type AnalyticsLead = {
  status: LeadStatus
  source: string | null
  firstContactedAt: string | null
}

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

export function calculateAnalyticsMetrics(leads: AnalyticsLead[]): AnalyticsMetrics {
  if (leads.length === 0) {
    return {
      conversionRate: null,
      outreachSent: null,
      meetingsBooked: null,
      replyRate: null,
      auditCount: null,
      opportunityScoreCount: null,
      pipeline: null,
      leadSources: null,
    }
  }

  const pipeline = Object.fromEntries(
    LEAD_STATUSES.map((status) => [status, 0]),
  ) as Record<LeadStatus, number>
  const sources = new Map<string, number>()

  for (const lead of leads) {
    pipeline[lead.status] += 1
    const source = lead.source?.trim() || "unknown"
    sources.set(source, (sources.get(source) ?? 0) + 1)
  }

  const contacted = leads.filter((lead) => lead.firstContactedAt !== null)
  const replied = contacted.filter((lead) => lead.status === "REPLIED").length

  return {
    conversionRate: (pipeline.WON / leads.length) * 100,
    outreachSent: contacted.length > 0 ? contacted.length : null,
    meetingsBooked: pipeline.MEETING,
    replyRate:
      contacted.length > 0 ? (replied / contacted.length) * 100 : null,
    auditCount: null,
    opportunityScoreCount: null,
    pipeline,
    leadSources: [...sources.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((left, right) => left.source.localeCompare(right.source)),
  }
}

export async function getAnalyticsMetrics(): Promise<AnalyticsMetrics> {
  const [leadsResult, auditsResult, scoresResult] = await Promise.all([
    supabase.from("leads").select("status, source, first_contacted_at"),
    supabase.from("lead_digital_audits").select("id", { count: "exact", head: true }),
    supabase.from("lead_opportunity_scores").select("id", { count: "exact", head: true }),
  ])

  if (leadsResult.error) throw leadsResult.error
  if (auditsResult.error) throw auditsResult.error
  if (scoresResult.error) throw scoresResult.error

  return {
    ...calculateAnalyticsMetrics(
      (leadsResult.data ?? []).map((lead) => ({
        status: lead.status as LeadStatus,
        source: lead.source,
        firstContactedAt: lead.first_contacted_at,
      })),
    ),
    auditCount: leadsResult.data?.length ? auditsResult.count ?? 0 : null,
    opportunityScoreCount: leadsResult.data?.length ? scoresResult.count ?? 0 : null,
  }
}