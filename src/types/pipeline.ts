import type {
  AiAnalysisRecord,
  LeadQualificationResult,
  OpportunityScoreResult,
} from "./audit"

export const PIPELINE_STAGE_NAMES = ["AUDIT", "SCORE", "QUALIFICATION", "AI_ANALYSIS"] as const

export type PipelineStage = typeof PIPELINE_STAGE_NAMES[number]
export type PipelineStageStatus = "PENDING" | "RUNNING" | "COMPLETED" | "SKIPPED" | "FAILED"

export type PipelineStageRecord = {
  leadId: string
  stage: PipelineStage
  status: PipelineStageStatus
  attempts: number
  startedAt: string | null
  completedAt: string | null
  errorMessage: string | null
  inputFingerprint: string | null
}

export type LeadPipelineStatus = {
  leadId: string
  stages: Record<PipelineStage, PipelineStageRecord>
  opportunityScore: OpportunityScoreResult | null
  qualification: LeadQualificationResult | null
  aiAnalysis: AiAnalysisRecord | null
}

export type PipelineQueueResult = {
  queued: number | boolean
  leadId?: string
  leadIds?: string[]
}