import { supabase } from "../db/supabase.js"

import {
  type DigitalAuditFactor,
  type DigitalAuditFactorKey,
  normalizeAuditFactors,
  upsertLeadAudit,
} from "./digitalAuditService.js"

export const OPPORTUNITY_SCORE_RULESET_VERSION = "v1"

export const OPPORTUNITY_SCORE_WEIGHTS: Record<DigitalAuditFactorKey, number> = {
  hasWebsite: 18,
  hasGoogleBusinessProfile: 20,
  hasActiveSocial: 12,
  hasOnlineOrdering: 10,
  hasOnlineBooking: 8,
  hasWhatsApp: 8,
  hasContactMethod: 8,
  hasMobileFriendlyWebsite: 7,
  hasStrongCTA: 6,
  hasBasicSEO: 6,
  hasVisibleBusinessInformation: 10,
}

export type OpportunityScoreResult = {
  score: number
  classification: "LOW" | "MEDIUM" | "HIGH"
  rulesetVersion: string
  factorWeights: Record<DigitalAuditFactorKey, number>
  calculatedAt: string
  contributingFactors: string[]
}

export function calculateOpportunityScore(
  factors: DigitalAuditFactor[] | Record<string, unknown>,
  now: Date = new Date(),
): OpportunityScoreResult {
  const normalized = Array.isArray(factors)
    ? factors
    : normalizeAuditFactors(factors)

  const factorMap = new Map(normalized.map((factor) => [factor.key, factor]))

  let score = 0
  const contributingFactors: string[] = []

  for (const [key, weight] of Object.entries(OPPORTUNITY_SCORE_WEIGHTS)) {
    const factor = factorMap.get(key as DigitalAuditFactorKey)

    if (!factor) continue

    if (factor.value === true) {
      score += weight
      contributingFactors.push(`${factor.key} present (+${weight})`)
      continue
    }

    if (factor.value === false) {
      contributingFactors.push(`${factor.key} missing`)
      continue
    }

    contributingFactors.push(`${factor.key} unknown`)
  }

  const classification: OpportunityScoreResult["classification"] =
    score >= 80 ? "HIGH" : score >= 45 ? "MEDIUM" : "LOW"

  return {
    score,
    classification,
    rulesetVersion: OPPORTUNITY_SCORE_RULESET_VERSION,
    factorWeights: OPPORTUNITY_SCORE_WEIGHTS,
    calculatedAt: now.toISOString(),
    contributingFactors,
  }
}

export async function getLatestLeadOpportunityScore(leadId: string) {
  const { data, error } = await supabase
    .from("lead_opportunity_scores")
    .select("*")
    .eq("lead_id", leadId)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (error.code === "PGRST116") {
      const notFound = new Error("Opportunity score not found.") as Error & {
        statusCode?: number
      }

      notFound.statusCode = 404
      throw notFound
    }

    throw error
  }

  if (!data) {
    const notFound = new Error("Opportunity score not found.") as Error & {
      statusCode?: number
    }

    notFound.statusCode = 404
    throw notFound
  }

  return {
    id: data.id,
    leadId: data.lead_id,
    score: data.score,
    classification: data.classification,
    rulesetVersion: data.ruleset_version,
    factorWeights: data.ruleset_version === OPPORTUNITY_SCORE_RULESET_VERSION
      ? OPPORTUNITY_SCORE_WEIGHTS
      : {},
    calculatedAt: data.calculated_at,
    contributingFactors: Array.isArray(data.contributing_factors)
      ? data.contributing_factors
      : [],
  }
}

export async function calculateLeadOpportunityScore(
  leadId: string,
  input?: Record<string, unknown>,
): Promise<OpportunityScoreResult> {
  const audit = await upsertLeadAudit(leadId, input)
  const result = calculateOpportunityScore(audit.factors)

  const { data: existingScore, error: existingScoreError } = await supabase
    .from("lead_opportunity_scores")
    .select("*")
    .eq("audit_id", audit.id)
    .eq("ruleset_version", result.rulesetVersion)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingScoreError) throw existingScoreError
  if (existingScore) {
    return {
      score: existingScore.score,
      classification: existingScore.classification,
      rulesetVersion: existingScore.ruleset_version,
      factorWeights: OPPORTUNITY_SCORE_WEIGHTS,
      calculatedAt: existingScore.calculated_at,
      contributingFactors: Array.isArray(existingScore.contributing_factors)
        ? existingScore.contributing_factors
        : result.contributingFactors,
    }
  }

  const { data, error } = await supabase
    .from("lead_opportunity_scores")
    .insert({
      lead_id: leadId,
      audit_id: audit.id,
      score: result.score,
      classification: result.classification,
      ruleset_version: result.rulesetVersion,
      calculated_at: result.calculatedAt,
      contributing_factors: result.contributingFactors,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return {
    score: data.score,
    classification: data.classification,
    rulesetVersion: data.ruleset_version,
    factorWeights: OPPORTUNITY_SCORE_WEIGHTS,
    calculatedAt: data.calculated_at,
    contributingFactors: Array.isArray(data.contributing_factors)
      ? data.contributing_factors
      : result.contributingFactors,
  }
}
