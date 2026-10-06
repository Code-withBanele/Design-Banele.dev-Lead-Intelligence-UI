import { getLeadById } from "./leadService.js"
import { getLatestLeadAudit } from "./digitalAuditService.js"
import { getLatestLeadOpportunityScore } from "./opportunityScoreService.js"
import { runWithModelFallback } from "./aiModelRouter.js"
import { supabase } from "../db/supabase.js"

export const BUSINESS_ANALYSIS_PROMPT_VERSION = "v1"

export type AiBusinessAnalysisSummary = {
  summary: string
  problems: string[]
  opportunities: string[]
  recommendations: string[]
  digitalSolution: string
  outreachAngle: string
}

export type AiAnalysisRecord = {
  id: string
  leadId: string
  provider: string
  model: string
  promptVersion: string
  analysis: AiBusinessAnalysisSummary
  routingMetadata: {
    requestedModel: string
    selectedModel: string
    provider: string
    fallbackUsed: boolean
    attemptCount: number
    failureReason?: string
  }
  createdAt: string
}

export function buildAiAnalysisContext(lead: any, audit: any, score: any) {
  return {
    lead: {
      id: lead.id,
      name: lead.name,
      industry: lead.industry ?? null,
      location: lead.location ?? null,
      status: lead.status,
    },
    deterministicAudit: {
      auditVersion: audit?.auditVersion ?? "unknown",
      factors: audit?.factors ?? [],
    },
    opportunityScore: {
      score: score?.score ?? null,
      classification: score?.classification ?? null,
      rulesetVersion: score?.rulesetVersion ?? null,
      contributingFactors: score?.contributingFactors ?? [],
    },
    instructions: {
      deterministicScoreIsAuthoritative: true,
      aiIsInterpretiveOnly: true,
      doNotChangeOpportunityScore: true,
      unknownFactsRemainUnknown: true,
    },
  }
}

export function buildBusinessAnalysisPrompt(context: ReturnType<typeof buildAiAnalysisContext>) {
  return `
You are an AI business analysis assistant for Banele.dev.

The opportunity score and classification are authoritative and deterministic. Do not change them, recalculate them, or suggest that the score is AI-generated.

Treat the audit facts as evidence, not assumptions. Unknown values remain unknown.

Use the supplied structured context to provide a business analysis in JSON with fields:
- summary: string
- problems: string[]
- opportunities: string[]
- recommendations: string[]
- digitalSolution: string
- outreachAngle: string

Do not invent business details. Stay grounded in the evidence provided.

Context:
${JSON.stringify(context, null, 2)}
`
}

export function validateAiAnalysisPayload(payload: unknown): AiBusinessAnalysisSummary {
  if (!payload || typeof payload !== "object") {
    throw new Error("AI response must be an object.")
  }

  const data = payload as Record<string, unknown>

  const summary = typeof data.summary === "string" ? data.summary : ""
  const problems = Array.isArray(data.problems) ? data.problems.filter((entry) => typeof entry === "string") : []
  const opportunities = Array.isArray(data.opportunities) ? data.opportunities.filter((entry) => typeof entry === "string") : []
  const recommendations = Array.isArray(data.recommendations) ? data.recommendations.filter((entry) => typeof entry === "string") : []
  const digitalSolution = typeof data.digitalSolution === "string" ? data.digitalSolution : ""
  const outreachAngle = typeof data.outreachAngle === "string" ? data.outreachAngle : ""

  if (!summary.trim()) throw new Error("AI analysis summary is required.")
  if (!digitalSolution.trim()) throw new Error("AI digital solution is required.")
  if (!outreachAngle.trim()) throw new Error("AI outreach angle is required.")

  return {
    summary,
    problems,
    opportunities,
    recommendations,
    digitalSolution,
    outreachAngle,
  }
}

export async function generateAiBusinessAnalysis(leadId: string) {
  const lead = await getLeadById(leadId)
  const [audit, score] = await Promise.all([
    getLatestLeadAudit(leadId).catch(() => null),
    getLatestLeadOpportunityScore(leadId).catch(() => null),
  ])

  if (!score) {
    const error = new Error("Deterministic opportunity score is required before AI analysis.") as Error & { statusCode?: number }
    error.statusCode = 400
    throw error
  }

  const aiContext = buildAiAnalysisContext(lead, audit, score)
  const prompt = buildBusinessAnalysisPrompt(aiContext)

  const providerResult = await runWithModelFallback(
    { structuredOutput: true, businessAnalysis: true },
    async (model) => {
      const apiKey = process.env.OPENROUTER_API_KEY

      if (!apiKey) {
        throw Object.assign(new Error("Missing OPENROUTER_API_KEY."), {
          statusCode: 500,
          code: "OPENROUTER_CONFIG_ERROR",
        })
      }

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://banele.dev",
          "X-Title": "Banele.dev Lead Intelligence",
        },
        body: JSON.stringify({
          model: model.model,
          temperature: model.temperature ?? 0.2,
          max_tokens: model.maxTokens ?? 600,
          response_format: { type: "json_schema" },
          messages: [
            { role: "system", content: "You provide business analysis based only on supplied evidence." },
            { role: "user", content: prompt },
          ],
        }),
      })

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "")
        const message = errorBody || "AI provider request failed."
        const statusCode = response.status
        throw Object.assign(new Error(message), {
          statusCode,
          code: statusCode === 429 ? "AI_RATE_LIMIT" : "AI_PROVIDER_ERROR",
        })
      }

      const json = await response.json() as any
      const content = json?.choices?.[0]?.message?.content

      if (typeof content !== "string") {
        throw Object.assign(new Error("AI provider returned an invalid response."), {
          statusCode: 502,
          code: "AI_INVALID_RESPONSE",
        })
      }

      let parsed: unknown

      try {
        parsed = JSON.parse(content)
      } catch {
        throw Object.assign(new Error("AI provider returned malformed JSON."), {
          statusCode: 502,
          code: "AI_INVALID_RESPONSE",
        })
      }

      return validateAiAnalysisPayload(parsed)
    },
    3,
  )

  const { analysis } = await persistAiAnalysis(leadId, providerResult)

  return analysis
}

export async function persistAiAnalysis(
  leadId: string,
  providerResult: {
    result: AiBusinessAnalysisSummary
    selectedModel: { model: string; provider: string }
    metadata: {
      requestedModel: string
      selectedModel: string
      provider: string
      fallbackUsed: boolean
      attemptCount: number
      failureReason?: string
    }
  },
) {
  const { data, error } = await supabase
    .from("ai_analyses")
    .insert({
      lead_id: leadId,
      provider: providerResult.selectedModel.provider,
      model: providerResult.selectedModel.model,
      prompt_version: BUSINESS_ANALYSIS_PROMPT_VERSION,
      analysis_output: providerResult.result,
      requested_model: providerResult.metadata.requestedModel,
      selected_model: providerResult.metadata.selectedModel,
      fallback_used: providerResult.metadata.fallbackUsed,
      attempt_count: providerResult.metadata.attemptCount,
    })
    .select()
    .single()

  if (error) throw error

  return {
    id: data.id,
    leadId: data.lead_id,
    provider: data.provider,
    model: data.model,
    promptVersion: data.prompt_version,
    analysis: data.analysis_output,
    routingMetadata: {
      requestedModel: data.requested_model,
      selectedModel: data.selected_model,
      provider: data.provider,
      fallbackUsed: data.fallback_used,
      attemptCount: data.attempt_count,
    },
    createdAt: data.created_at,
  } as AiAnalysisRecord
}

export async function getLatestAiAnalysis(leadId: string): Promise<AiAnalysisRecord> {
  const { data, error } = await supabase
    .from("ai_analyses")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    const notFound = new Error("AI analysis not found.") as Error & { statusCode?: number }
    notFound.statusCode = 404
    throw notFound
  }

  return {
    id: data.id,
    leadId: data.lead_id,
    provider: data.provider,
    model: data.model,
    promptVersion: data.prompt_version,
    analysis: data.analysis_output,
    routingMetadata: {
      requestedModel: data.requested_model,
      selectedModel: data.selected_model,
      provider: data.provider,
      fallbackUsed: data.fallback_used,
      attemptCount: data.attempt_count,
    },
    createdAt: data.created_at,
  }
}
