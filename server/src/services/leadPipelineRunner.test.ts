import assert from "node:assert/strict"
import test from "node:test"

import {
  PIPELINE_STAGES,
  runLeadPipeline,
  type PipelineDependencies,
  type PipelineLead,
  type PipelineStage,
  type PipelineStageRecord,
} from "./leadPipelineRunner.js"

function createHarness(input: {
  lead?: PipelineLead
  auditAndScore?: boolean
  score?: boolean
  qualification?: string | null
  aiAnalysis?: boolean
  initialStages?: PipelineStageRecord[]
  failAudit?: (attempt: number) => unknown | null
} = {}) {
  const lead = input.lead ?? { id: "lead-1", websiteUrl: "https://example.com", status: "NEW" }
  const stages = new Map<PipelineStage, PipelineStageRecord>(
    (input.initialStages ?? []).map((stage) => [stage.stage, stage]),
  )
  const calls: string[] = []
  let auditAndScore = input.auditAndScore ?? false
  let score = input.score ?? false
  let qualification = input.qualification ?? null
  let aiAnalysis = input.aiAnalysis ?? false
  let auditAttempts = 0

  const dependencies: PipelineDependencies = {
    async getLead() { return lead },
    async getStage(_leadId, stage) { return stages.get(stage) ?? null },
    async saveStage(stage) {
      stages.set(stage.stage, stage)
      if (stage.status === "RUNNING") calls.push(`stage:${stage.stage}`)
    },
    async hasAuditAndScore() { return auditAndScore },
    async hasScore() { return score },
    async hasCurrentQualification() { return qualification !== null },
    async getQualificationStatus() { return qualification },
    async hasCurrentAiAnalysis() { return aiAnalysis },
    async collectDigitalIntelligence() {
      auditAttempts += 1
      calls.push("audit")
      const failure = input.failAudit?.(auditAttempts)
      if (failure) throw failure
      auditAndScore = true
      score = true
    },
    async calculateOpportunityScore() {
      calls.push("score")
      score = true
    },
    async evaluateQualification() {
      calls.push("qualification")
      qualification = input.qualification ?? "REVIEW_REQUIRED"
      return { status: qualification }
    },
    async generateAiAnalysis() {
      calls.push("ai")
      aiAnalysis = true
    },
    async syncAuditedStatus() { calls.push("status:audited") },
    async syncQualifiedStatus() { calls.push("status:qualified") },
    isTransientError(error) { return (error as { transient?: boolean } | null)?.transient === true },
  }

  return { dependencies, calls, stages, getAuditAttempts: () => auditAttempts }
}

test("pipeline persists stages in order and runs deterministic stages before AI", async () => {
  const harness = createHarness()

  const result = await runLeadPipeline("lead-1", harness.dependencies)

  assert.deepEqual(Object.keys(result), [...PIPELINE_STAGES])
  assert.deepEqual(
    harness.calls.filter((call) => call.startsWith("stage:")).map((call) => call.slice(6)),
    [...PIPELINE_STAGES],
  )
  assert.deepEqual(harness.calls.filter((call) => !call.startsWith("stage:")), [
    "audit",
    "status:audited",
    "qualification",
    "status:qualified",
    "ai",
  ])
})

test("pipeline retries transient failures and marks permanent failures with blocked stages", async () => {
  const retrying = createHarness({
    failAudit: (attempt) => attempt < 3 ? Object.assign(new Error("temporary"), { transient: true }) : null,
  })
  const retried = await runLeadPipeline("lead-1", retrying.dependencies)
  assert.equal(retrying.getAuditAttempts(), 3)
  assert.equal(retried.AUDIT, "COMPLETED")

  const failing = createHarness({
    failAudit: () => new Error("robots policy rejected the crawl"),
  })
  const failed = await runLeadPipeline("lead-1", failing.dependencies)
  assert.equal(failed.AUDIT, "FAILED")
  assert.equal(failed.SCORE, "SKIPPED")
  assert.equal(failed.QUALIFICATION, "SKIPPED")
  assert.equal(failed.AI_ANALYSIS, "SKIPPED")
})

test("pipeline is idempotent for completed stages and resumes persisted pending stages", async () => {
  const harness = createHarness()
  await runLeadPipeline("lead-1", harness.dependencies)
  const firstRunCalls = [...harness.calls]

  await runLeadPipeline("lead-1", harness.dependencies)
  assert.deepEqual(harness.calls, firstRunCalls)

  const resumed = createHarness({
    auditAndScore: true,
    score: true,
    initialStages: [{
      leadId: "lead-1",
      stage: "AUDIT",
      status: "COMPLETED",
      attempts: 1,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:01:00.000Z",
      errorMessage: null,
      inputFingerprint: "https://example.com",
    }],
  })
  const resumedResult = await runLeadPipeline("lead-1", resumed.dependencies)
  assert.equal(resumedResult.AUDIT, "COMPLETED")
  assert.equal(resumed.calls.includes("audit"), false)
})

test("no-website leads skip every stage without crawling or inventing results", async () => {
  const noWebsite = createHarness({
    lead: { id: "lead-1", websiteUrl: null, status: "NEW" },
    auditAndScore: true,
    score: true,
  })

  const result = await runLeadPipeline("lead-1", noWebsite.dependencies)

  assert.deepEqual(result, {
    AUDIT: "SKIPPED",
    SCORE: "SKIPPED",
    QUALIFICATION: "SKIPPED",
    AI_ANALYSIS: "SKIPPED",
  })
  assert.equal(noWebsite.calls.includes("audit"), false)
  assert.equal(noWebsite.calls.includes("ai"), false)
  assert.match(noWebsite.stages.get("AUDIT")?.errorMessage ?? "", /No website available/)
})

test("AI policy gates generation by qualification and can disable it", async () => {
  const unqualified = createHarness({ qualification: "UNQUALIFIED" })
  const gated = await runLeadPipeline("lead-1", unqualified.dependencies)
  assert.equal(gated.AI_ANALYSIS, "SKIPPED")
  assert.equal(unqualified.calls.includes("ai"), false)

  const all = createHarness({ qualification: "UNQUALIFIED" })
  await runLeadPipeline("lead-1", all.dependencies, { aiPolicy: "all" })
  assert.equal(all.calls.includes("ai"), true)

  const off = createHarness()
  const disabled = await runLeadPipeline("lead-1", off.dependencies, { aiPolicy: "off" })
  assert.equal(disabled.AI_ANALYSIS, "SKIPPED")
  assert.equal(off.calls.includes("ai"), false)
})