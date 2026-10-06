import { supabase } from "../db/supabase.js"

import { getLatestAiAnalysis } from "./aiAnalysisService.js"
import { getLatestLeadAudit } from "./digitalAuditService.js"
import { getLeadById } from "./leadService.js"
import { getLatestLeadOpportunityScore } from "./opportunityScoreService.js"

export const LEAD_QUALIFICATION_STATUSES = [
  "qualified",
  "needs_review",
  "unqualified",
] as const

export type LeadQualificationStatus =
  (typeof LEAD_QUALIFICATION_STATUSES)[number]

export type LeadQualificationResult = {
  id: string
  leadId: string
  status: LeadQualificationStatus
  score: number
  classification: "LOW" | "MEDIUM" | "HIGH"
  reasons: string[]
  evidence: string[]
  calculatedAt: string
}

function collectFactorValue(
  factors: Array<{ key?: string; value?: boolean | null }> = [],
  key: string,
): boolean {
  const match = factors.find((factor) => factor.key === key)
  return match?.value === true
}

export function determineLeadQualification(input: {
  score: number
  classification: "LOW" | "MEDIUM" | "HIGH"
  hasWebsite: boolean
  hasContactMethod: boolean
  hasBusinessIdentity: boolean
  hasGoogleBusinessProfile: boolean
  hasStrongCTA: boolean
  hasBasicSEO: boolean
  hasAiInterpretation: boolean
}): LeadQualificationResult & { reasons: string[]; evidence: string[] } {
  const reasons: string[] = []
  const evidence: string[] = []

  if (input.hasWebsite) {
    evidence.push("Website present")
  }
  if (input.hasContactMethod) {
    evidence.push("Contact signal present")
  }
  if (input.hasBusinessIdentity) {
    evidence.push("Business identity available")
  }
  if (input.hasGoogleBusinessProfile) {
    evidence.push("Google Business Profile present")
  }
  if (input.hasStrongCTA) {
    evidence.push("Strong conversion intent present")
  }
  if (input.hasBasicSEO) {
    evidence.push("Basic SEO signals present")
  }
  if (input.hasAiInterpretation) {
    evidence.push("AI interpretation available")
  }

  if (input.score >= 80 && input.hasWebsite && input.hasContactMethod && input.hasBusinessIdentity) {
    return {
      id: "",
      leadId: "",
      status: "qualified",
      score: input.score,
      classification: input.classification,
      reasons: [
        "Score is high enough to qualify as a strong opportunity.",
        "A usable website and verified contact route are present.",
      ],
      evidence,
      calculatedAt: new Date().toISOString(),
    }
  }

  if (input.score >= 45 && (input.hasWebsite || input.hasGoogleBusinessProfile || input.hasContactMethod)) {
    reasons.push("The opportunity is promising but still needs review before outreach.")
    evidence.push("Qualification remains conditional")

    if (!input.hasWebsite) {
      reasons.push("No verified website was observed for this lead.")
    }
    if (!input.hasContactMethod) {
      reasons.push("No direct contact method was found.")
    }

    return {
      id: "",
      leadId: "",
      status: "needs_review",
      score: input.score,
      classification: input.classification,
      reasons,
      evidence,
      calculatedAt: new Date().toISOString(),
    }
  }

  reasons.push("The lead does not meet the minimum deterministic qualification threshold.")
  if (!input.hasWebsite) {
    reasons.push("No verified website evidence is available.")
  }
  if (!input.hasContactMethod) {
    reasons.push("No direct contact signal is available.")
  }
  if (!input.hasBusinessIdentity) {
    reasons.push("Business identity details are incomplete.")
  }

  return {
    id: "",
    leadId: "",
    status: "unqualified",
    score: input.score,
    classification: input.classification,
    reasons,
    evidence,
    calculatedAt: new Date().toISOString(),
  }
}

export async function getLatestLeadQualification(leadId: string): Promise<LeadQualificationResult> {
  const { data, error } = await supabase
    .from("lead_qualifications")
    .select("*")
    .eq("lead_id", leadId)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (error.code === "PGRST116") {
      const notFound = new Error("Lead qualification not found.") as Error & {
        statusCode?: number
      }

      notFound.statusCode = 404
      throw notFound
    }

    throw error
  }

  if (!data) {
    const notFound = new Error("Lead qualification not found.") as Error & {
      statusCode?: number
    }

    notFound.statusCode = 404
    throw notFound
  }

  const status = data.status

  return {
    id: data.id,
    leadId: data.lead_id,
    status: status === "qualified" || status === "needs_review" || status === "unqualified" ? status : "unqualified",
    score: Number(data.score ?? 0),
    classification: data.classification ?? "LOW",
    reasons: Array.isArray(data.reasons) ? data.reasons : [],
    evidence: Array.isArray(data.evidence) ? data.evidence : [],
    calculatedAt: data.calculated_at,
  }
}

export async function calculateLeadQualification(
  leadId: string,
): Promise<LeadQualificationResult> {
  await getLeadById(leadId)

  const [audit, score, aiAnalysis] = await Promise.all([
    getLatestLeadAudit(leadId).catch(() => null),
    getLatestLeadOpportunityScore(leadId).catch(() => null),
    getLatestAiAnalysis(leadId).catch(() => null),
  ])

  const auditFactors = Array.isArray(audit?.factors) ? audit.factors : []

  const nextScore = Number(score?.score ?? 0)
  const nextClassification = (score?.classification ?? "LOW") as "LOW" | "MEDIUM" | "HIGH"

  const qualification = determineLeadQualification({
    score: nextScore,
    classification: nextClassification,
    hasWebsite: collectFactorValue(auditFactors, "hasWebsite"),
    hasContactMethod: collectFactorValue(auditFactors, "hasContactMethod"),
    hasBusinessIdentity: collectFactorValue(auditFactors, "hasVisibleBusinessInformation"),
    hasGoogleBusinessProfile: collectFactorValue(auditFactors, "hasGoogleBusinessProfile"),
    hasStrongCTA: collectFactorValue(auditFactors, "hasStrongCTA"),
    hasBasicSEO: collectFactorValue(auditFactors, "hasBasicSEO"),
    hasAiInterpretation: Boolean(aiAnalysis && aiAnalysis.analysis && aiAnalysis.analysis.summary),
  })

  const payload = {
    lead_id: leadId,
    status: qualification.status,
    score: nextScore,
    classification: nextClassification,
    reasons: qualification.reasons,
    evidence: qualification.evidence,
    calculated_at: qualification.calculatedAt,
  }

  const { data, error } = await supabase
    .from("lead_qualifications")
    .insert(payload)
    .select()
    .single()

  if (error) {
    throw error
  }

  await supabase
    .from("leads")
    .update({ qualification_status: qualification.status })
    .eq("id", leadId)

  return {
    id: data.id,
    leadId: data.lead_id,
    status: qualification.status,
    score: Number(data.score ?? nextScore),
    classification: data.classification ?? nextClassification,
    reasons: Array.isArray(data.reasons) ? data.reasons : qualification.reasons,
    evidence: Array.isArray(data.evidence) ? data.evidence : qualification.evidence,
    calculatedAt: data.calculated_at,
  }
}
