export const PIPELINE_STAGES = ["AUDIT", "SCORE", "QUALIFICATION", "AI_ANALYSIS"] as const

export type PipelineStage = typeof PIPELINE_STAGES[number]
export type PipelineStageStatus = "PENDING" | "RUNNING" | "COMPLETED" | "SKIPPED" | "FAILED"
export type AiAnalysisPolicy = "qualified_and_review" | "all" | "off"

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

export type PipelineLead = {
  id: string
  websiteUrl: string | null
  status: string
}

export type PipelineDependencies = {
  getLead(leadId: string): Promise<PipelineLead>
  getStage(leadId: string, stage: PipelineStage): Promise<PipelineStageRecord | null>
  saveStage(stage: PipelineStageRecord): Promise<void>
  hasAuditAndScore(leadId: string): Promise<boolean>
  hasScore(leadId: string): Promise<boolean>
  hasCurrentQualification(leadId: string): Promise<boolean>
  getQualificationStatus(leadId: string): Promise<string | null>
  hasCurrentAiAnalysis(leadId: string): Promise<boolean>
  collectDigitalIntelligence(leadId: string, websiteUrl: string): Promise<void>
  calculateOpportunityScore(leadId: string): Promise<void>
  evaluateQualification(leadId: string): Promise<{ status: string }>
  generateAiAnalysis(leadId: string): Promise<void>
  syncAuditedStatus(lead: PipelineLead): Promise<void>
  syncQualifiedStatus(lead: PipelineLead, qualificationStatus: string): Promise<void>
  isTransientError(error: unknown): boolean
}

export type PipelineRunOptions = {
  force?: boolean
  aiPolicy?: AiAnalysisPolicy
  maxAttempts?: number
  now?: () => Date
}

function fingerprint(websiteUrl: string | null) {
  return websiteUrl?.trim().toLowerCase() || "NO_WEBSITE"
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Pipeline stage failed."
}

export async function runLeadPipeline(
  leadId: string,
  dependencies: PipelineDependencies,
  options: PipelineRunOptions = {},
) {
  const lead = await dependencies.getLead(leadId)
  const aiPolicy = options.aiPolicy ?? "qualified_and_review"
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3)
  const now = options.now ?? (() => new Date())
  const inputFingerprint = fingerprint(lead.websiteUrl)
  const results = new Map<PipelineStage, PipelineStageStatus>()

  async function saveStatus(
    stage: PipelineStage,
    status: PipelineStageStatus,
    message: string | null,
    attempts: number,
    startedAt: string | null,
  ) {
    const completedAt = status === "COMPLETED" || status === "SKIPPED" || status === "FAILED"
      ? now().toISOString()
      : null
    await dependencies.saveStage({
      leadId,
      stage,
      status,
      attempts,
      startedAt,
      completedAt,
      errorMessage: message,
      inputFingerprint,
    })
    results.set(stage, status)
  }

  async function executeStage(stage: PipelineStage, operation: () => Promise<void>) {
    const existing = await dependencies.getStage(leadId, stage)
    if (
      !options.force &&
      existing?.status === "COMPLETED" &&
      existing.inputFingerprint === inputFingerprint
    ) {
      results.set(stage, "COMPLETED")
      return true
    }

    let attempts = existing?.status === "PENDING" || existing?.status === "RUNNING"
      ? existing.attempts
      : 0
    let startedAt: string | null = existing?.startedAt ?? null
    while (attempts < maxAttempts) {
      attempts += 1
      startedAt ??= now().toISOString()
      await saveStatus(stage, "RUNNING", null, attempts, startedAt)
      try {
        await operation()
        await saveStatus(stage, "COMPLETED", null, attempts, startedAt)
        return true
      } catch (error) {
        const message = errorMessage(error)
        const retry = attempts < maxAttempts && dependencies.isTransientError(error)
        await saveStatus(stage, retry ? "PENDING" : "FAILED", message, attempts, startedAt)
        if (!retry) return false
      }
    }
    return false
  }

  async function skipStage(stage: PipelineStage, reason: string, replaceCompleted = false) {
    const existing = await dependencies.getStage(leadId, stage)
    if (!replaceCompleted && !options.force && existing?.status === "COMPLETED" && existing.inputFingerprint === inputFingerprint) {
      results.set(stage, "COMPLETED")
      return
    }
    await saveStatus(stage, "SKIPPED", reason, existing?.attempts ?? 0, existing?.startedAt ?? null)
  }

  if (!lead.websiteUrl) {
    const reason = "No website available - needs review."
    await skipStage("AUDIT", reason, true)
    await skipStage("SCORE", "Skipped because no website is available; no score was created.", true)
    await skipStage("QUALIFICATION", "Skipped because no website is available for this pipeline run.", true)
    await skipStage("AI_ANALYSIS", "Skipped because no usable website is available.", true)
    return Object.fromEntries(results)
  }

  const hasExistingAuditAndScore = await dependencies.hasAuditAndScore(leadId)
  const previousAuditStage = await dependencies.getStage(leadId, "AUDIT")
  const reusableExistingAudit = !options.force &&
    hasExistingAuditAndScore &&
    (!previousAuditStage || previousAuditStage.inputFingerprint === inputFingerprint)
  const auditStatusNeedsSync = options.force ||
    previousAuditStage?.status !== "COMPLETED" ||
    previousAuditStage.inputFingerprint !== inputFingerprint

  const auditCompleted = await executeStage("AUDIT", async () => {
    if (reusableExistingAudit) return
    if (!lead.websiteUrl) return
    await dependencies.collectDigitalIntelligence(leadId, lead.websiteUrl)
  })

  if (!auditCompleted) {
    await skipStage("SCORE", "Skipped because the audit stage failed.")
    await skipStage("QUALIFICATION", "Skipped because the audit stage failed.")
    await skipStage("AI_ANALYSIS", "Skipped because the audit stage failed.")
    return Object.fromEntries(results)
  }
  if (auditStatusNeedsSync) await dependencies.syncAuditedStatus(lead)

  const scoreCompleted = await executeStage("SCORE", async () => {
    if (await dependencies.hasScore(leadId)) return
    await dependencies.calculateOpportunityScore(leadId)
    await dependencies.syncAuditedStatus(lead)
  })

  if (!scoreCompleted) {
    await skipStage("QUALIFICATION", "Skipped because no deterministic opportunity score is available.")
    await skipStage("AI_ANALYSIS", "Skipped because no deterministic opportunity score is available.")
    return Object.fromEntries(results)
  }

  const previousQualificationStage = await dependencies.getStage(leadId, "QUALIFICATION")
  const qualificationStatusNeedsSync = options.force ||
    previousQualificationStage?.status !== "COMPLETED" ||
    previousQualificationStage.inputFingerprint !== inputFingerprint
  const qualificationCompleted = await executeStage("QUALIFICATION", async () => {
    if (!options.force && await dependencies.hasCurrentQualification(leadId)) return
    await dependencies.evaluateQualification(leadId)
  })

  if (!qualificationCompleted) {
    await skipStage("AI_ANALYSIS", "Skipped because qualification did not complete.")
    return Object.fromEntries(results)
  }

  const qualificationStatus = await dependencies.getQualificationStatus(leadId)
  if (qualificationStatus && qualificationStatusNeedsSync) {
    await dependencies.syncQualifiedStatus(lead, qualificationStatus)
  }
  const scoreAvailable = await dependencies.hasScore(leadId)
  const aiAllowed = aiPolicy === "all" || (
    aiPolicy === "qualified_and_review" &&
    (qualificationStatus === "QUALIFIED" || qualificationStatus === "REVIEW_REQUIRED")
  )

  if (!lead.websiteUrl) {
    await skipStage("AI_ANALYSIS", "Skipped because no usable website is available.")
  } else if (!scoreAvailable) {
    await skipStage("AI_ANALYSIS", "Skipped because no deterministic opportunity score is available.")
  } else if (!qualificationStatus) {
    await skipStage("AI_ANALYSIS", "Skipped because qualification is unavailable.")
  } else if (aiPolicy === "off") {
    await skipStage("AI_ANALYSIS", "AI analysis is disabled by AI_ANALYSIS_POLICY.")
  } else if (!aiAllowed) {
    await skipStage("AI_ANALYSIS", "Skipped because qualification is not QUALIFIED or REVIEW_REQUIRED.")
  } else {
    await executeStage("AI_ANALYSIS", async () => {
      if (!options.force && await dependencies.hasCurrentAiAnalysis(leadId)) return
      if (!await dependencies.hasScore(leadId)) {
        throw new Error("AI analysis requires a deterministic opportunity score.")
      }
      await dependencies.generateAiAnalysis(leadId)
    })
  }

  return Object.fromEntries(results)
}