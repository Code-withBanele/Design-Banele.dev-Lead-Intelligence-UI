import { supabase } from "../db/supabase.js"
import { generateAiBusinessAnalysis, getLatestAiAnalysis } from "./aiAnalysisService.js"
import { getLeadById, updateLeadStatus } from "./leadService.js"
import { collectDigitalIntelligence } from "./digitalIntelligenceService.js"
import { calculateLeadOpportunityScore, getLatestLeadOpportunityScore } from "./opportunityScoreService.js"
import { getLatestLeadAudit } from "./digitalAuditService.js"
import { evaluateLeadQualification, getLatestLeadQualification } from "./leadQualificationService.js"
import {
  PIPELINE_STAGES,
  runLeadPipeline,
  type AiAnalysisPolicy,
  type PipelineDependencies,
  type PipelineStage,
  type PipelineStageRecord,
  type PipelineStageStatus,
} from "./leadPipelineRunner.js"

const pipelineConcurrency = Math.max(1, Math.min(8, Math.floor(Number(process.env.PIPELINE_CONCURRENCY ?? 3) || 3)))
const configuredAiPolicy = process.env.AI_ANALYSIS_POLICY ?? "qualified_and_review"
export const AI_ANALYSIS_POLICY: AiAnalysisPolicy = ["qualified_and_review", "all", "off"].includes(configuredAiPolicy)
  ? configuredAiPolicy as AiAnalysisPolicy
  : "qualified_and_review"

const protectedLeadStatuses = new Set(["CONTACTED", "REPLIED", "MEETING", "PROPOSAL", "WON", "LOST", "ARCHIVED"])
const queue: string[] = []
const queued = new Map<string, boolean>()
const active = new Set<string>()
const rerunAfterActive = new Map<string, boolean>()
let activeWorkers = 0
let drainScheduled = false

function mapPipelineStage(row: any): PipelineStageRecord {
  return {
    leadId: row.lead_id,
    stage: row.stage,
    status: row.status,
    attempts: row.attempts ?? 0,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
    inputFingerprint: row.input_fingerprint,
  }
}

function stageError(error: unknown) {
  return error instanceof Error ? error : new Error("Pipeline stage failed.")
}

function isNotFound(error: unknown) {
  return (error as { statusCode?: number } | null)?.statusCode === 404
}

async function getStage(leadId: string, stage: PipelineStage) {
  const { data, error } = await supabase
    .from("lead_pipeline_stages")
    .select("*")
    .eq("lead_id", leadId)
    .eq("stage", stage)
    .maybeSingle()
  if (error) throw error
  return data ? mapPipelineStage(data) : null
}

async function saveStage(stage: PipelineStageRecord) {
  const { error } = await supabase.from("lead_pipeline_stages").upsert({
    lead_id: stage.leadId,
    stage: stage.stage,
    status: stage.status,
    attempts: stage.attempts,
    started_at: stage.startedAt,
    completed_at: stage.completedAt,
    error_message: stage.errorMessage,
    input_fingerprint: stage.inputFingerprint,
    updated_at: new Date().toISOString(),
  }, { onConflict: "lead_id,stage" })
  if (error) throw error
}

async function latestScoreId(leadId: string) {
  const { data, error } = await supabase
    .from("lead_opportunity_scores")
    .select("id")
    .eq("lead_id", leadId)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

async function hasAuditAndScore(leadId: string) {
  const [audit, score] = await Promise.all([
    supabase.from("lead_digital_audits").select("id").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("lead_opportunity_scores").select("audit_id").eq("lead_id", leadId).order("calculated_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  if (audit.error) throw audit.error
  if (score.error) throw score.error
  return Boolean(audit.data && score.data?.audit_id === audit.data.id)
}

async function hasScore(leadId: string) {
  const [audit, score] = await Promise.all([
    supabase.from("lead_digital_audits").select("id").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("lead_opportunity_scores").select("audit_id").eq("lead_id", leadId).order("calculated_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  if (audit.error) throw audit.error
  if (score.error) throw score.error
  return Boolean(audit.data && score.data?.audit_id === audit.data.id)
}

async function hasCurrentQualification(leadId: string) {
  const scoreId = await latestScoreId(leadId)
  if (!scoreId) return false
  const { data, error } = await supabase
    .from("lead_qualifications")
    .select("id")
    .eq("lead_id", leadId)
    .eq("opportunity_score_id", scoreId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

async function getQualificationStatus(leadId: string) {
  try {
    return (await getLatestLeadQualification(leadId)).status
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

async function hasCurrentAiAnalysis(leadId: string) {
  const { data: score, error: scoreError } = await supabase
    .from("lead_opportunity_scores")
    .select("calculated_at")
    .eq("lead_id", leadId)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (scoreError) throw scoreError
  if (!score) return false
  const { data: analysis, error } = await supabase
    .from("ai_analyses")
    .select("created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return Boolean(analysis && analysis.created_at >= score.calculated_at)
}

function isTransientError(error: unknown) {
  const value = error as { statusCode?: number; code?: string; name?: string; message?: string } | null
  if (value?.code === "OPENROUTER_CONFIG_ERROR") return false
  if (value?.statusCode === 408 || value?.statusCode === 429 || (value?.statusCode ?? 0) >= 500) return true
  return value?.name === "TypeError" || ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED"].includes(value?.code ?? "")
}

async function syncAuditedStatus(lead: { id: string; status: string }) {
  const current = await getLeadById(lead.id)
  if (protectedLeadStatuses.has(current.status)) return
  if (current.status === "NEW") await updateLeadStatus(lead.id, "AUDITED")
}

async function syncQualifiedStatus(lead: { id: string; status: string }, qualificationStatus: string) {
  if (qualificationStatus !== "QUALIFIED") return
  const current = await getLeadById(lead.id)
  if (protectedLeadStatuses.has(current.status)) return
  if (current.status === "NEW" || current.status === "AUDITED") {
    await updateLeadStatus(lead.id, "QUALIFIED")
  }
}

const dependencies: PipelineDependencies = {
  async getLead(leadId) {
    const lead = await getLeadById(leadId)
    return { id: lead.id, websiteUrl: lead.websiteUrl, status: lead.status }
  },
  getStage,
  saveStage,
  hasAuditAndScore,
  hasScore,
  async hasCurrentQualification(leadId) { return hasCurrentQualification(leadId) },
  getQualificationStatus,
  hasCurrentAiAnalysis,
  async collectDigitalIntelligence(leadId, websiteUrl) {
    await collectDigitalIntelligence(leadId, { website: websiteUrl })
  },
  async calculateOpportunityScore(leadId) {
    const audit = await getLatestLeadAudit(leadId)
    const input = Object.fromEntries(audit.factors.map((factor) => [factor.key, {
      value: factor.value,
      status: factor.status,
      evidence: factor.evidence,
    }]))
    await calculateLeadOpportunityScore(leadId, input)
  },
  async evaluateQualification(leadId) { return evaluateLeadQualification(leadId) },
  async generateAiAnalysis(leadId) {
    await generateAiBusinessAnalysis(leadId)
  },
  syncAuditedStatus,
  syncQualifiedStatus,
  isTransientError,
}

function scheduleDrain() {
  if (drainScheduled) return
  drainScheduled = true
  setImmediate(() => {
    drainScheduled = false
    while (activeWorkers < pipelineConcurrency && queue.length) {
      const leadId = queue.shift()!
      const force = queued.get(leadId) ?? false
      queued.delete(leadId)
      active.add(leadId)
      activeWorkers += 1
      void runLeadPipeline(leadId, dependencies, { force, aiPolicy: AI_ANALYSIS_POLICY })
        .catch((error) => console.error(`Lead pipeline failed for ${leadId}:`, stageError(error).message))
        .finally(() => {
          active.delete(leadId)
          activeWorkers -= 1
          const rerun = rerunAfterActive.get(leadId)
          if (rerun !== undefined) {
            rerunAfterActive.delete(leadId)
            queueLead(leadId, rerun)
          }
          scheduleDrain()
        })
    }
  })
}

function queueLead(leadId: string, force: boolean) {
  if (active.has(leadId)) {
    rerunAfterActive.set(leadId, (rerunAfterActive.get(leadId) ?? false) || force)
    return
  }
  if (queued.has(leadId)) {
    queued.set(leadId, (queued.get(leadId) ?? false) || force)
    return
  }
  queued.set(leadId, force)
  queue.push(leadId)
  scheduleDrain()
}

async function ensureStages(leadIds: string[]) {
  const rows = leadIds.flatMap((leadId) => PIPELINE_STAGES.map((stage) => ({
    lead_id: leadId,
    stage,
    status: "PENDING",
    attempts: 0,
    started_at: null,
    completed_at: null,
    error_message: null,
    input_fingerprint: null,
  })))
  if (!rows.length) return
  const { error } = await supabase.from("lead_pipeline_stages").upsert(rows, {
    onConflict: "lead_id,stage",
    ignoreDuplicates: true,
  })
  if (error) throw error
}

export async function enqueueLeadPipeline(leadId: string, force = false) {
  await getLeadById(leadId)
  await ensureStages([leadId])
  queueLead(leadId, force)
  return { leadId, queued: true }
}

export async function enqueueDiscoveredLeads(leadIds: string[]) {
  const ids = [...new Set(leadIds.filter(Boolean))]
  await ensureStages(ids)
  for (const leadId of ids) queueLead(leadId, false)
  return { queued: ids.length, leadIds: ids }
}

export async function enqueueUnprocessedLeads() {
  const [{ data: leads, error: leadsError }, { data: stages, error: stagesError }] = await Promise.all([
    supabase.from("leads").select("id"),
    supabase.from("lead_pipeline_stages").select("lead_id, stage, status"),
  ])
  if (leadsError) throw leadsError
  if (stagesError) throw stagesError

  const byLead = new Map<string, Map<string, string>>()
  for (const row of stages ?? []) {
    const leadStages = byLead.get(row.lead_id) ?? new Map<string, string>()
    leadStages.set(row.stage, row.status)
    byLead.set(row.lead_id, leadStages)
  }
  const ids = (leads ?? []).filter((lead) => {
    const statuses = byLead.get(lead.id)
    return !statuses || PIPELINE_STAGES.some((stage) => {
      const status = statuses.get(stage)
      return status !== "COMPLETED" && status !== "SKIPPED"
    })
  }).map((lead) => lead.id)

  await ensureStages(ids)
  for (const leadId of ids) queueLead(leadId, false)
  return { queued: ids.length, leadIds: ids }
}

export async function resumeLeadPipelines() {
  const { data, error } = await supabase
    .from("lead_pipeline_stages")
    .select("lead_id, stage")
    .in("status", ["PENDING", "RUNNING"])
  if (error) throw error

  const leadIds = [...new Set((data ?? []).map((row) => row.lead_id))]
  const { error: recoveryError } = await supabase
    .from("lead_pipeline_stages")
    .update({ status: "PENDING", completed_at: null, error_message: "Resumed after server restart.", updated_at: new Date().toISOString() })
    .eq("status", "RUNNING")
  if (recoveryError) throw recoveryError
  for (const leadId of leadIds) queueLead(leadId, false)
  return leadIds.length
}

async function getOptional<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

export async function getLeadPipelineStatus(leadId: string) {
  await getLeadById(leadId)
  const { data, error } = await supabase
    .from("lead_pipeline_stages")
    .select("*")
    .eq("lead_id", leadId)
  if (error) throw error
  const byStage = new Map((data ?? []).map((row) => [row.stage, mapPipelineStage(row)]))
  const stages = Object.fromEntries(PIPELINE_STAGES.map((stage) => [stage, byStage.get(stage) ?? {
    leadId,
    stage,
    status: "PENDING" as PipelineStageStatus,
    attempts: 0,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    inputFingerprint: null,
  }]))
  const [opportunityScore, qualification, aiAnalysis] = await Promise.all([
    getOptional(getLatestLeadOpportunityScore(leadId)),
    getOptional(getLatestLeadQualification(leadId)),
    getOptional(getLatestAiAnalysis(leadId)),
  ])
  return { leadId, stages, opportunityScore, qualification, aiAnalysis }
}