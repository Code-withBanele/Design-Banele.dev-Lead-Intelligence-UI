import { supabase } from "../db/supabase.js"
import { getLeads } from "./leadService.js"

export type LeadShortlistClassification = "LOW" | "MEDIUM" | "HIGH"

export type LeadShortlistCandidate = {
  leadId: string
  businessName: string
  websiteUrl: string | null
  status: string
  createdAt: string
  opportunityScore: number
  qualificationStatus: string | null
  classification: LeadShortlistClassification
  shortlistReason: string
  aiSummary: string | null
}

export type LeadShortlistResult = {
  generatedAt: string
  count: number
  recommendations: Array<LeadShortlistCandidate & { priority: number }>
}

const classificationRank: Record<LeadShortlistClassification, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

const qualificationRank: Record<string, number> = {
  QUALIFIED: 3,
  REVIEW_REQUIRED: 2,
  UNQUALIFIED: 0,
}

function normalizeClassification(value: string | null | undefined): LeadShortlistClassification {
  if (value === "HIGH" || value === "MEDIUM" || value === "LOW") return value
  return "LOW"
}

export function buildLeadShortlist(candidates: LeadShortlistCandidate[]): LeadShortlistResult {
  const sorted = [...candidates]
    .filter((candidate) => {
      const status = candidate.qualificationStatus ?? "UNQUALIFIED"
      return status === "QUALIFIED" || status === "REVIEW_REQUIRED"
    })
    .filter((candidate) => Number(candidate.opportunityScore ?? 0) >= 45)
    .sort((left, right) => {
      const classificationDelta =
        classificationRank[normalizeClassification(right.classification)] -
        classificationRank[normalizeClassification(left.classification)]
      if (classificationDelta !== 0) return classificationDelta

      const scoreDelta = Number(right.opportunityScore ?? 0) - Number(left.opportunityScore ?? 0)
      if (scoreDelta !== 0) return scoreDelta

      const qualificationDelta =
        (qualificationRank[right.qualificationStatus ?? "UNQUALIFIED"] ?? 0) -
        (qualificationRank[left.qualificationStatus ?? "UNQUALIFIED"] ?? 0)
      if (qualificationDelta !== 0) return qualificationDelta

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    })
    .map((candidate, index) => ({
      ...candidate,
      priority: index + 1,
      shortlistReason:
        candidate.shortlistReason?.trim() ||
        (candidate.qualificationStatus === "QUALIFIED"
          ? "Qualified lead with a strong deterministic score."
          : "Review-required lead with a strong deterministic score."),
      aiSummary: candidate.aiSummary?.trim() || null,
    }))

  return {
    generatedAt: new Date().toISOString(),
    count: sorted.length,
    recommendations: sorted,
  }
}

export async function getLeadShortlist() {
  const leads = await getLeads()

  const [scoresResult, qualificationsResult, analysesResult] = await Promise.all([
    supabase
      .from("lead_opportunity_scores")
      .select("lead_id, score, classification, calculated_at")
      .order("calculated_at", { ascending: false }),
    supabase
      .from("lead_qualifications")
      .select("lead_id, status, classification, evaluated_at")
      .order("evaluated_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("ai_analyses")
      .select("lead_id, analysis_output, created_at")
      .order("created_at", { ascending: false }),
  ])

  if (scoresResult.error) throw scoresResult.error
  if (qualificationsResult.error) throw qualificationsResult.error
  if (analysesResult.error) throw analysesResult.error

  const latestScores = new Map<string, { score: number; classification: string }>()
  for (const row of scoresResult.data ?? []) {
    if (!latestScores.has(row.lead_id)) {
      latestScores.set(row.lead_id, {
        score: Number(row.score ?? 0),
        classification: String(row.classification ?? "LOW"),
      })
    }
  }

  const latestQualifications = new Map<string, { status: string; classification: string }>()
  for (const row of qualificationsResult.data ?? []) {
    if (!latestQualifications.has(row.lead_id)) {
      latestQualifications.set(row.lead_id, {
        status: String(row.status ?? "UNQUALIFIED"),
        classification: String(row.classification ?? "LOW"),
      })
    }
  }

  const latestAiSummary = new Map<string, string | null>()
  for (const row of analysesResult.data ?? []) {
    if (!latestAiSummary.has(row.lead_id)) {
      const analysis = row.analysis_output ?? {}
      latestAiSummary.set(row.lead_id, typeof analysis.summary === "string" ? analysis.summary : null)
    }
  }

  const candidates: LeadShortlistCandidate[] = leads
    .filter((lead) => Boolean(lead.id))
    .map((lead) => {
      const score = latestScores.get(lead.id)
      const qualification = latestQualifications.get(lead.id)
      const status = qualification?.status ?? lead.qualificationStatus ?? "UNQUALIFIED"
      const classification = normalizeClassification(score?.classification ?? qualification?.classification ?? "LOW")

      return {
        leadId: lead.id,
        businessName: lead.name,
        websiteUrl: lead.websiteUrl,
        status: lead.status,
        createdAt: lead.createdAt,
        opportunityScore: Number(score?.score ?? lead.opportunityScore ?? 0),
        qualificationStatus: status,
        classification,
        shortlistReason:
          status === "QUALIFIED"
            ? "Qualified by deterministic score and evidence rules."
            : status === "REVIEW_REQUIRED"
              ? "Qualified pending human review of evidence and risk."
              : "Excluded from the shortlist because it does not meet the deterministic threshold.",
        aiSummary: latestAiSummary.get(lead.id) ?? null,
      }
    })

  return buildLeadShortlist(candidates)
}

export async function getLeadShortlistEntry(leadId: string) {
  const shortlist = await getLeadShortlist()
  const recommendation = shortlist.recommendations.find((entry) => entry.leadId === leadId)
  if (!recommendation) {
    const notFound = new Error("Lead is not on the shortlist.") as Error & { statusCode?: number }
    notFound.statusCode = 404
    throw notFound
  }

  return { ...shortlist, count: 1, recommendations: [recommendation] }
}
