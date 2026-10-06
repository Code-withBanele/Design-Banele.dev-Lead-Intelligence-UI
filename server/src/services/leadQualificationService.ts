import { supabase } from "../db/supabase.js"

import type { DigitalAuditFactor } from "./digitalAuditService.js"

export const LEAD_QUALIFICATION_RULESET_VERSION = "v1"
export const LEAD_QUALIFICATION_MIN_SCORE = 45
export const LEAD_QUALIFICATION_MIN_KNOWN_FACTORS = 6
export const LEAD_QUALIFICATION_MIN_EVIDENCE = 3

export type LeadQualificationStatus =
  | "QUALIFIED"
  | "REVIEW_REQUIRED"
  | "UNQUALIFIED"

export type EvidenceSufficiency = "SUFFICIENT" | "PARTIAL" | "INSUFFICIENT"

export type LeadQualificationResult = {
  id?: string
  leadId?: string
  status: LeadQualificationStatus
  evidenceSufficiency: EvidenceSufficiency
  opportunityScore: number
  classification: "LOW" | "MEDIUM" | "HIGH"
  rulesetVersion: string
  evaluatedAt: string
  reasons: string[]
  blockingFactors: string[]
}

type ScoreInput = Pick<LeadQualificationResult, "opportunityScore" | "classification">

export function calculateLeadQualification(
  score: { score: number; classification: ScoreInput["classification"] },
  factors: DigitalAuditFactor[],
  evidenceCount: number,
  now: Date = new Date(),
): LeadQualificationResult {
  const knownFactorCount = factors.filter((factor) => factor.value !== null).length
  const contactFactor = factors.find((factor) => factor.key === "hasContactMethod")
  const hasContactMethod = contactFactor?.value === true
  const enoughAuditData = knownFactorCount >= LEAD_QUALIFICATION_MIN_KNOWN_FACTORS
  const enoughEvidence = evidenceCount >= LEAD_QUALIFICATION_MIN_EVIDENCE

  const evidenceSufficiency: EvidenceSufficiency =
    enoughAuditData && enoughEvidence
      ? "SUFFICIENT"
      : knownFactorCount > 0 || evidenceCount > 0
        ? "PARTIAL"
        : "INSUFFICIENT"

  const blockingFactors: string[] = []

  if (score.score < LEAD_QUALIFICATION_MIN_SCORE) {
    blockingFactors.push(
      `Opportunity score ${score.score} is below the qualification threshold of ${LEAD_QUALIFICATION_MIN_SCORE}.`,
    )
  }
  if (!enoughAuditData) {
    blockingFactors.push(
      `Audit coverage is ${knownFactorCount} of ${factors.length} known factors; at least ${LEAD_QUALIFICATION_MIN_KNOWN_FACTORS} are required.`,
    )
  }
  if (!enoughEvidence) {
    blockingFactors.push(
      `Collected evidence count is ${evidenceCount}; at least ${LEAD_QUALIFICATION_MIN_EVIDENCE} items are required.`,
    )
  }
  if (!hasContactMethod) {
    blockingFactors.push(
      contactFactor?.value === false
        ? "No contact method was verified."
        : "Contact method is unknown and requires review.",
    )
  }

  const status: LeadQualificationStatus =
    evidenceSufficiency !== "SUFFICIENT"
      ? "REVIEW_REQUIRED"
      : score.score < LEAD_QUALIFICATION_MIN_SCORE
        ? "UNQUALIFIED"
        : blockingFactors.length === 0
          ? "QUALIFIED"
          : "REVIEW_REQUIRED"

  const reasons = [
    `Deterministic opportunity score is ${score.score} (${score.classification}).`,
    `Evidence sufficiency is ${evidenceSufficiency.toLowerCase()}.`,
    hasContactMethod
      ? "A contact method is verified."
      : "A verified contact method is required.",
  ]

  return {
    status,
    evidenceSufficiency,
    opportunityScore: score.score,
    classification: score.classification,
    rulesetVersion: LEAD_QUALIFICATION_RULESET_VERSION,
    evaluatedAt: now.toISOString(),
    reasons,
    blockingFactors,
  }
}

function mapQualification(row: any): LeadQualificationResult {
  return {
    id: row.id,
    leadId: row.lead_id,
    status: row.status,
    evidenceSufficiency: row.evidence_sufficiency,
    opportunityScore: row.opportunity_score,
    classification: row.classification,
    rulesetVersion: row.ruleset_version,
    evaluatedAt: row.evaluated_at,
    reasons: Array.isArray(row.reasons) ? row.reasons : [],
    blockingFactors: Array.isArray(row.blocking_factors)
      ? row.blocking_factors
      : [],
  }
}

function notFoundError(message: string) {
  return Object.assign(new Error(message), { statusCode: 404 })
}

export async function getLatestLeadQualification(leadId: string) {
  const { data, error } = await supabase
    .from("lead_qualifications")
    .select("*")
    .eq("lead_id", leadId)
    .order("evaluated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) throw notFoundError("Lead qualification not found.")

  return mapQualification(data)
}

export async function evaluateLeadQualification(leadId: string) {
  const { data: score, error: scoreError } = await supabase
    .from("lead_opportunity_scores")
    .select("id, audit_id, score, classification")
    .eq("lead_id", leadId)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (scoreError) throw scoreError
  if (!score) {
    const error = new Error("Calculate a deterministic opportunity score before qualification.") as Error & { statusCode?: number; code?: string }
    error.statusCode = 409
    error.code = "OPPORTUNITY_SCORE_REQUIRED"
    throw error
  }

  let factors: DigitalAuditFactor[] = []

  if (score.audit_id) {
    const { data: audit, error: auditError } = await supabase
      .from("lead_digital_audits")
      .select("factors")
      .eq("id", score.audit_id)
      .maybeSingle()

    if (auditError) throw auditError
    factors = Array.isArray(audit?.factors) ? audit.factors : []
  }

  const { count, error: evidenceError } = await supabase
    .from("digital_evidence")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)

  if (evidenceError) throw evidenceError

  const result = calculateLeadQualification(
    { score: score.score, classification: score.classification },
    factors,
    count ?? 0,
  )

  const { data, error } = await supabase
    .from("lead_qualifications")
    .insert({
      lead_id: leadId,
      opportunity_score_id: score.id,
      audit_id: score.audit_id,
      opportunity_score: result.opportunityScore,
      classification: result.classification,
      status: result.status,
      evidence_sufficiency: result.evidenceSufficiency,
      ruleset_version: result.rulesetVersion,
      evaluated_at: result.evaluatedAt,
      reasons: result.reasons,
      blocking_factors: result.blockingFactors,
    })
    .select("*")
    .single()

  if (error) throw error

  const { error: leadUpdateError } = await supabase
    .from("leads")
    .update({ qualification_status: result.status.toLowerCase() })
    .eq("id", leadId)

  if (leadUpdateError) throw leadUpdateError

  return mapQualification(data)
}